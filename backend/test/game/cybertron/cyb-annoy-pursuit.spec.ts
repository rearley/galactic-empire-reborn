/**
 * The pursuit ladder taunts too — and the port never did.
 *
 * `cyb_annoy` is called from FIVE places, not two. Three of them live in
 * `cyb_check_lockon`, the movement ladder, and they are the ones that give a
 * pilot warning while the Cybertron is still closing:
 *
 *   low_dist >= hyperdist2   cyb_annoy(ptr, low_ship, 60, 1, 4)   GECYBS.C:769
 *   low_dist >  3.0          cyb_annoy(ptr, low_ship, 30, 5, 8)   GECYBS.C:782
 *   low_dist <= 3.0          cyb_annoy(ptr, low_ship, 30, 5, 8)   GECYBS.C:801
 *
 * `low_ship` is the hunted player, so `outprfge(FILTER, usrn)` puts the line on
 * that pilot's own terminal. The hyperwarp band (>= hyperdist1) is silent.
 *
 * This matters because scan ranges are asymmetric: at fifteen sectors the
 * Cybertron's engagement loop cannot see the player at all, so the ONLY thing
 * that can speak here is the movement ladder.
 */

import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickKind } from '../../../src/game/tick/tick.types';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CYBERTRON_EVENT, CybertronTauntPayload } from '../../../src/game/cybertron/cybertron-events';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CYB_TAUNTS } from '../../../src/game/cybertron/cyb-taunt-catalog.generated';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(
  o: Partial<ShipState> & { userid: string; shipno: number; shpclass: number },
): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 5,
    ycoord: 5,
    energy: 50000,
    phasr: 100,
    phasrtype: 2,
    lastfired: 255,
    shieldtype: 2,
    shieldstat: 1,
    shield: 2,
    helm: 1,
    decout: [0, 0, 0, 0, 0],
    freq: [],
    items: [0n, 0n, 0n, 0n, 0n, 0n, 10n, 10n, 0n, 0n, 0n, 10n, 0n, 5n, 0n, 0n],
    channel: 1,
    cybmine: 255,
    cybskill: 5,
    ...o,
  });
}

async function harness(seed: number) {
  const events = new EventEmitter2();
  const rand = new Mulberry32Adapter(seed);
  const shipMap = new Map<string, ShipState>();

  const shipStateService = {
    get: (uid: string, no: number) => shipMap.get(`${uid}:${no}`),
    findAllShips: () => Array.from(shipMap.values()),
    mutate: (uid: string, no: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${uid}:${no}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => shipMap.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: (s: { userid: string; shipno: number }) => shipMap.delete(`${s.userid}:${s.shipno}`),
    size: () => shipMap.size,
  } as unknown as ShipStateService;

  const classCache = new Map<number, unknown>();
  const shipClassCache = {
    get: (n: number) => classCache.get(n),
    // Canon dispatches AI behaviour by CLASS (GEMAIN.C:878-895); a droid never
    // runs cyb_lives. These harnesses only ever hold CYBORG classes.
    getCategory: (n: number) => (classCache.has(n) ? 'CPU_COMBATIVE' : undefined),
    getMaxPhaser: () => 2,
    getMaxTons: () => 900,
  } as unknown as ShipClassCacheService;
  classCache.set(21, {
    maxAcceleration: 2000, maxWarp: 8, maxPhaser: 2, maxShields: 2,
    scanRange: 50_000, maxTons: 900, hasTorpedo: true, hasMissile: false,
    hasJammer: true, hasMine: false, hasZipper: false, noClaim: 3, tough: 0,
    cybLowestClassAttacks: 1,
  });
  classCache.set(3, {
    maxAcceleration: 1000, maxWarp: 5, maxPhaser: 1, maxShields: 1,
    scanRange: 30_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
    hasJammer: false, hasMine: false, hasZipper: false, noClaim: 3, tough: 0,
    cybLowestClassAttacks: 0,
  });

  const repository = {
    hydrateAll: vi.fn().mockResolvedValue(undefined),
    createSpawn: vi.fn().mockResolvedValue(undefined),
    flushShipsImmediate: vi.fn().mockResolvedValue(undefined),
    flushUsersImmediate: vi.fn().mockResolvedValue(undefined),
    clampCybertronCash: (n: bigint) => n,
  } as unknown as CybertronRepository;

  const byKind = new Map<unknown, (ctx: unknown) => void>();
  const tickService = {
    subscribe: (kind: unknown, fn: (ctx: unknown) => void) => { byKind.set(kind, fn); return () => {}; },
  } as unknown as TickService;

  const svc = new CybertronTickService(
    tickService, shipStateService, shipClassCache, repository, events, rand,
  );
  process.env.CYBERTRON_BOOT_SEED = 'false';
  await svc.onModuleInit();

  const fireAiTick = (n = 1): void => {
    const fn = byKind.get(TickKind.SHIP_UPDATE);
    for (let i = 0; i < n; i += 1) fn?.({ kind: TickKind.SHIP_UPDATE, tickNumber: i + 1, firedAt: new Date() });
  };

  return { events, shipMap, fireAiTick };
}

/** Run a hunt at the given separation and collect every taunt emitted. */
async function huntAt(separation: number, seed = 7): Promise<CybertronTauntPayload[]> {
  const { events, shipMap, fireAiTick } = await harness(seed);

  const cyb = makeShip({
    userid: 'Cybrg-300', shipno: 300, shpclass: 21, status: 2,
    shipname: 'Cybertron 1', xcoord: 5, ycoord: 5,
    cybmine: 255, tick: 0, cybupdate: 100, where: 0, channel: 90,
  });
  shipMap.set('Cybrg-300:300', cyb);

  const player = makeShip({
    userid: 'player1', shipno: 1, shpclass: 3, status: 1,
    xcoord: 5 + separation, ycoord: 5, channel: 1, kills: 0,
  });
  shipMap.set('player1:1', player);

  const taunts: CybertronTauntPayload[] = [];
  events.on(CYBERTRON_EVENT.TAUNT, (e: CybertronTauntPayload) => taunts.push(e));

  for (let i = 0; i < 400; i += 1) {
    // Hold the geometry still: this exercises the taunt, not the physics.
    cyb.xcoord = 5; cyb.ycoord = 5; cyb.where = 0;
    player.xcoord = 5 + separation; player.ycoord = 5;
    cyb.tick = 0;
    fireAiTick(1);
  }
  await new Promise((r) => setImmediate(r));
  return taunts;
}

const SCOUT = 21;
const withName = (i: number) => CYB_TAUNTS[SCOUT]![i]!.replace('%s', 'Cybertron 1');
const APPROACH_LINES = [0, 1, 2, 3].map(withName);
const BRAKE_LINES = [4, 5, 6, 7].map(withName);

describe('cyb_annoy fires from the pursuit ladder', () => {
  it('taunts from the APPROACH band at 15 sectors — outside its own scan range', async () => {
    // scanRange 50_000 = 5 sectors, so the engagement loop is blind here.
    const taunts = await huntAt(15);
    expect(taunts.length).toBeGreaterThan(0);
    for (const t of taunts) {
      expect(t.band).toBe('APPROACH');
      expect(APPROACH_LINES).toContain(t.message);
    }
  });

  it('addresses the taunt to the hunted pilot, not the Cybertron', async () => {
    const taunts = await huntAt(15);
    expect(taunts[0]!.targetShipKey).toBe('player1:1');
    expect(taunts[0]!.attackerShipKey).toBe('Cybrg-300:300');
  });

  it('switches to the BRAKE band once inside hyperdist2', async () => {
    // hyperdist2 defaults to 10 sectors; 6 is inside it and above the 3.0 line.
    const taunts = (await huntAt(6)).filter((t) => t.band === 'BRAKE' || t.band === 'APPROACH');
    expect(taunts.length).toBeGreaterThan(0);
    for (const t of taunts) {
      expect(t.band).toBe('BRAKE');
      expect(BRAKE_LINES).toContain(t.message);
    }
  });

  it('says nothing from the ladder while in hyperwarp (>= hyperdist1)', async () => {
    // hyperdist1 defaults to 25 sectors. C's hyperwarp band has no cyb_annoy.
    const taunts = await huntAt(28);
    expect(taunts).toHaveLength(0);
  });
});
