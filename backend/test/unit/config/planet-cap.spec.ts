/**
 * MAXPLNTS — the per-player planet cap.
 *
 * GECMDS.C:3487 refuses a further claim with `if (waruptr->planets >= max_plnts)`.
 * Note this is PER PLAYER, not a galaxy-wide total: the name reads like a world
 * limit but the C checks the claiming user's own count.
 *
 * The option was declared in the sysop config but inert, so a single player
 * could claim every planet in the galaxy.
 */

import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { MAXPLNTS } from '../../../src/game/constants';
import { planetKey } from '../../../src/game/planet/planet-state.types';

describe('planet ownership cap', () => {
  it('counts only the planets owned by the given player', () => {
    const svc = Object.create(PlanetStateService.prototype) as PlanetStateService;
    (svc as unknown as { map: Map<string, { userid: string | null }> }).map = new Map([
      ['a', { userid: 'alice' }],
      ['b', { userid: 'bob' }],
      ['c', { userid: 'alice' }],
      ['d', { userid: null }],
    ]);

    expect(svc.countOwnedBy('alice')).toBe(2);
    expect(svc.countOwnedBy('bob')).toBe(1);
    expect(svc.countOwnedBy('nobody')).toBe(0);
  });

  it('refuses a claim once the player is at MAXPLNTS', async () => {
    const svc = Object.create(PlanetStateService.prototype) as PlanetStateService;
    const owned = new Map<string, { userid: string | null }>();
    for (let i = 0; i < MAXPLNTS; i++) owned.set(`p${i}`, { userid: 'alice' });
    owned.set(planetKey(5, 7, 1), { userid: null }); // outside the neutral zone
    (svc as unknown as { map: unknown }).map = owned;
    // claim() serialises per key; stub it so the test exercises the cap alone.
    (svc as unknown as { runSerialized: <T>(k: string, fn: () => Promise<T>) => Promise<T> })
      .runSerialized = (_k, fn) => fn();

    const result = await svc.claim(5, 7, 1, 'alice', 'NewWorld');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('PLANET_LIMIT');
  });

  it('the cap is per player — another pilot is unaffected', () => {
    const svc = Object.create(PlanetStateService.prototype) as PlanetStateService;
    const owned = new Map<string, { userid: string | null }>();
    for (let i = 0; i < MAXPLNTS; i++) owned.set(`p${i}`, { userid: 'alice' });
    (svc as unknown as { map: unknown }).map = owned;

    expect(svc.countOwnedBy('alice')).toBe(MAXPLNTS);
    expect(svc.countOwnedBy('bob')).toBe(0);
  });
});

describe('the refusal reaches the player', () => {
  it('adm reports the cap instead of the optimistic claimed line', async () => {
    // Previously the claim was fire-and-forget, so the cap was enforced but the
    // player still saw "You have claimed X". Claiming now lives in `adm`, where
    // C puts it (GEMAIN.C:2899) — the invented `land` command was removed.
    const { AdminHandlerService } = await import('../../../src/game/commands/handlers/admin.handler');
    const { formatMessage, MessageId } = await import('../../../src/game/commands/messages');

    const planetService = {
      get: () => ({ xsect: 0, ysect: 0, plnum: 1, userid: null, name: null }),
      claim: vi.fn().mockResolvedValue({ ok: false, reason: 'PLANET_LIMIT' }),
    };

    const svc = new AdminHandlerService(planetService as never);

    const ship = { userid: 'alice', shipno: 1, where: 11, xcoord: 0.5, ycoord: 0.5 } as never;
    const result = await (svc.command.handler(ship, ['claim', 'NewWorld'], {} as never) as Promise<{
      lines: Array<{ text: string }>;
    }>);

    const text = result.lines.map((l) => l.text).join(' ');
    expect(text).toBe(formatMessage(MessageId.LAND_PLANET_LIMIT, String(MAXPLNTS)));
    // The refusal must not be the SUCCESS line. Guarding on the word "claimed"
    // was too blunt once canon's wording arrived: ADMIN4 is a refusal and says
    // "We have already claimed the maximum planets permited by law."
    expect(text).not.toMatch(/you (?:have )?claimed/i);
    expect(text).toMatch(/maximum planets/i);
  });
});

describe('neutral-zone planets cannot be claimed', () => {
  /**
   * Sector 0,0 holds the trade hub (Zygor-3, where `new ship <N>` is bought and
   * most trade happens) plus Nexus Prime and three others. Found in playtest:
   * landing on Zygor-3 prompted for a name and the claim SUCCEEDED — the hub was
   * renamed and player-owned, which distorts the whole early game.
   *
   * C creates these already owned — build_plan_1/build_plan_2 both copy
   * `s00[idx].owner` into `planet.userid` (GEPLANET.C:671, 737) — and the claim
   * path only fires on an unowned planet (GECMDS.C:3486 `plptr->userid[0] == 0`).
   * Our S00Entry has the same owner field but leaves it empty, so the planets
   * are created unowned and therefore claimable.
   *
   * Guarding on the SECTOR rather than on ownership is the more robust fix: it
   * holds even if a planet is somehow released, and it states the rule directly
   * — nothing in the neutral zone is claimable.
   */
  function serviceWith(planets: Array<[string, { userid: string | null }]>): PlanetStateService {
    const svc = Object.create(PlanetStateService.prototype) as PlanetStateService;
    (svc as unknown as { map: unknown }).map = new Map(planets);
    (svc as unknown as { runSerialized: <T>(k: string, fn: () => Promise<T>) => Promise<T> })
      .runSerialized = (_k, fn) => fn();
    return svc;
  }

  it('refuses a claim on the trade hub at sector 0,0', async () => {
    const svc = serviceWith([[planetKey(0, 0, 1), { userid: null }]]);
    const result = await svc.claim(0, 0, 1, 'alice', 'MyZygor');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NEUTRAL_ZONE');
  });

  it('refuses every planet in sector 0,0, not just plnum 1', async () => {
    for (const plnum of [1, 2, 3, 4, 5]) {
      const svc = serviceWith([[planetKey(0, 0, plnum), { userid: null }]]);
      const result = await svc.claim(0, 0, plnum, 'alice', 'Mine');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('NEUTRAL_ZONE');
    }
  });

  it('does not apply the guard outside the neutral zone', async () => {
    // An empty map makes the claim fall through to NOT_FOUND, which proves the
    // neutral-zone guard did not fire — without needing the full claim path's
    // collaborators.
    const svc = serviceWith([]);
    const result = await svc.claim(5, 7, 1, 'alice', 'Freehold');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_FOUND');
  });
});
