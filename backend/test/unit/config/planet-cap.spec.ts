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
    owned.set(planetKey(0, 0, 1), { userid: null }); // the planet being claimed
    (svc as unknown as { map: unknown }).map = owned;
    // claim() serialises per key; stub it so the test exercises the cap alone.
    (svc as unknown as { runSerialized: <T>(k: string, fn: () => Promise<T>) => Promise<T> })
      .runSerialized = (_k, fn) => fn();

    const result = await svc.claim(0, 0, 1, 'alice', 'NewWorld');
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
  it('land reports the cap instead of the optimistic LAND_CLAIMED line', async () => {
    // Previously the claim was fire-and-forget, so the cap was enforced but the
    // player still saw "You have claimed X". CommandHandler already allowed a
    // Promise result, so awaiting it needed no router change.
    const { LandHandlerService } = await import('../../../src/game/commands/handlers/land.handler');
    const { formatMessage, MessageId } = await import('../../../src/game/commands/messages');

    const planetService = {
      // The handler looks the planet up in live state before claiming.
      get: () => ({ plnum: 1, userid: null, name: null }),
      claim: jest.fn().mockResolvedValue({ ok: false, reason: 'PLANET_LIMIT' }),
    };
    const galaxyService = {
      getSectorPlanets: () => [{ plnum: 1, userid: null, name: null }],
    };
    const scanHandler = { clearScantab: jest.fn() };

    const svc = new LandHandlerService(
      galaxyService as never,
      {} as never, // shipService — unused on this path
      planetService as never,
      scanHandler as never,
    );

    const ship = { userid: 'alice', shipno: 1, where: 11, xcoord: 0.5, ycoord: 0.5 } as never;
    const result = await (svc.command.handler(ship, ['NewWorld'], {} as never) as Promise<{
      lines: Array<{ text: string }>;
    }>);

    const text = result.lines.map((l) => l.text).join(' ');
    expect(text).toBe(formatMessage(MessageId.LAND_PLANET_LIMIT, String(MAXPLNTS)));
    expect(text).not.toMatch(/claimed/i);
  });
});
