/**
 * T014 — Cloak reachability tests.
 * Proves the five ship.cloak >= 1 / === 10 call sites are reachable after
 * cmd_cloak ramps a ship to CLOAK_RAMP_FULL (10):
 *   1. torpedo.handler.ts:82  — firer cloaked → TOR_CLOAK
 *   2. report.handler.ts:189  — ship.cloak > 0 → REP12 "Cloak: active."
 *   3. cybertron-tick.service.ts:268  — scan loop skips cloak=10 target
 *   4. cybertron-tick.service.ts:494  — current locked target cloaked → hold course
 *   5. cybertron-tick.service.ts:513  — acquisition scan skips cloak=10 candidate
 *
 * @see GECMDS.C:3188 cmd_cloak
 * @see GECYBS.C:709 cyb_check_lockon — target skip
 * @see specs/013-ship-management/tasks.md T014
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ScanHandlerService } from '../../../../src/game/commands/handlers/scan.handler';
import { TorpedoHandlerService } from '../../../../src/game/commands/handlers/torpedo.handler';
import { ReportHandlerService } from '../../../../src/game/commands/handlers/report.handler';
import { CybertronTickService } from '../../../../src/game/cybertron/cybertron-tick.service';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { CybertronRepository } from '../../../../src/game/cybertron/cybertron.repository';
import { TickService } from '../../../../src/game/tick/tick.service';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { Mulberry32Adapter, Random } from '../../../../src/game/combat/random.port';
import { CLOAK_RAMP_FULL } from '../../../../src/game/commands/_ship-management-constants';
import { CYBERTRON_EVENT, CybertronTargetAcquiredPayload } from '../../../../src/game/cybertron/cybertron-events';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

// ---------------------------------------------------------------------------
// Shared ship factory
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 5,
    ycoord: 5,
    energy: 50000,
    phasr: 100,
    phasrtype: 2,
    items: Array(14).fill(0n) as bigint[],
    topspeed: 8,
    // Firer identity is the unique `channel` (this port's usrnum), not
    // `shipno`. These fixtures give each ship a distinct shipno, so mirror it.
    channel: overrides.channel ?? overrides.shipno ?? 1,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// 1. torpedo.handler — firer cloaked → TOR_CLOAK (torpedo.handler.ts:82)
// ---------------------------------------------------------------------------

describe('cloak reachability — torpedo.handler.ts:82 (firer cloaked)', () => {
  function makeTorpedoService() {
    const mockShipState = {
      findAllShips: vi.fn().mockReturnValue([]),
      mutate: vi.fn(),
    } as unknown as ShipStateService;
    const mockShipClassCache = {
      getScanRange: vi.fn().mockReturnValue(50000),
      getHasTorpedo: vi.fn().mockReturnValue(true),
    } as unknown as ShipClassCacheService;
    const mockEvents = new EventEmitter2();
    const mockRandom = { next: vi.fn().mockReturnValue(0.5) } as unknown as Random;
    return new TorpedoHandlerService(mockShipState, mockShipClassCache, mockEvents, mockRandom,
      { lettersFor: () => [] } as unknown as ScanHandlerService,
    );
  }

  it('cloak=CLOAK_RAMP_FULL (10) on firer → TOR_CLOAK rejection', async () => {
    const service = makeTorpedoService();
    const firer = makeShip({ cloak: CLOAK_RAMP_FULL });
    const result = await (service.command.handler(firer, ['1'], {}) as Promise<{ lines: { text: string }[] }>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TOR_CLOAK));
  });

  it('cloak=1 (CLOAK_RAMP_INIT) also triggers TOR_CLOAK (cloak > 0 gate)', async () => {
    const service = makeTorpedoService();
    const firer = makeShip({ cloak: 1 });
    const result = await (service.command.handler(firer, ['1'], {}) as Promise<{ lines: { text: string }[] }>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TOR_CLOAK));
  });
});

// ---------------------------------------------------------------------------
// 2. report.handler — ship.cloak > 0 → REP12 "Cloak: active." (report.handler.ts:189)
// ---------------------------------------------------------------------------

describe('cloak reachability — report.handler.ts:189 (REP12 cloaked status)', () => {
  function makeReportService() {
    const mockPrisma = {} as unknown as PrismaService;
    const shipClassCache = new ShipClassCacheService({} as never);
    shipClassCache.setForTest(1, { maxAcceleration: 0, maxWarp: 0, typeName: 'Fighter', hasCloak: true });
    const service = new ReportHandlerService(mockPrisma, undefined, shipClassCache);
    return service;
  }

  it('ship.cloak === CLOAK_RAMP_FULL (10) → report includes REP12 "Cloak: active."', async () => {
    const service = await makeReportService();
    const ship = makeShip({ cloak: CLOAK_RAMP_FULL, shpclass: 1 });
    const result = await (service.command.handler(ship, ['sys'], {}) as Promise<{ lines: { text: string }[] }>);
    const texts = result.lines.map(l => l.text);
    expect(texts).toContain(formatMessage(MessageId.REP12));
    expect(texts).not.toContain(formatMessage(MessageId.REP13));
  });

  it('ship.cloak === 0 → report shows REP13 "Cloak: inactive." not REP12', async () => {
    const service = await makeReportService();
    const ship = makeShip({ cloak: 0, shpclass: 1 });
    const result = await (service.command.handler(ship, ['sys'], {}) as Promise<{ lines: { text: string }[] }>);
    const texts = result.lines.map(l => l.text);
    expect(texts).toContain(formatMessage(MessageId.REP13));
    expect(texts).not.toContain(formatMessage(MessageId.REP12));
  });
});

// ---------------------------------------------------------------------------
// 3–5. cybertron-tick.service — three cloak===10 call sites
// ---------------------------------------------------------------------------

function buildCybertronHarness() {
  const rand = new Mulberry32Adapter(0); // deterministic seed
  const events = new EventEmitter2();
  const shipMap = new Map<string, ShipState>();

  const shipStateService = {
    findAllShips: () => Array.from(shipMap.values()),
    findByUserid: (uid: string) => Array.from(shipMap.values()).filter(s => s.userid === uid),
    get: (uid: string, no: number) => shipMap.get(`${uid}:${no}`),
    mutate: (uid: string, no: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${uid}:${no}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => shipMap.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: (s: { userid: string; shipno: number }) => shipMap.delete(`${s.userid}:${s.shipno}`),
    size: () => shipMap.size,
  } as unknown as ShipStateService;

  const classMap = new Map<number, unknown>();
  const shipClassCache = {
    get: (n: number) => classMap.get(n),
    // Canon dispatches AI behaviour by CLASS (GEMAIN.C:878-895, :2418-2419);
    // every AI hull in this harness is a Cybertron.
    getCategory: (n: number) => (classMap.has(n) ? 'CPU_COMBATIVE' : undefined),
  } as unknown as ShipClassCacheService;

  const cybClass = {
    maxAcceleration: 2000, maxWarp: 8, maxPhaser: 2, maxShields: 2,
    scanRange: 50_000, maxTons: 900, hasTorpedo: true, hasMissile: false,
    hasJammer: false, hasMine: false, hasZipper: false,
    noClaim: 3, tough: 0, cybLowestClassAttacks: 1,
    cybCanAttack: false, tooclose: 3000,
  };
  classMap.set(21, cybClass);

  // The gang-up limit is read from the ship being HUNTED (GECYBS.C:357-376),
  // so the player's own class row has to be present or nothing is claimable.
  classMap.set(1, {
    maxAcceleration: 5000, maxWarp: 10, maxPhaser: 10, maxShields: 10,
    scanRange: 15_000, maxTons: 1000, hasTorpedo: true, hasMissile: false,
    hasJammer: true, hasMine: true, hasZipper: true,
    noClaim: 1, tough: 0, cybLowestClassAttacks: 0,
    cybCanAttack: true, tooclose: 3000,
  });

  const repository = {
    hydrateAll: vi.fn().mockResolvedValue(undefined),
    createSpawn: vi.fn(),
    flushShipsImmediate: vi.fn().mockResolvedValue(undefined),
    flushUsersImmediate: vi.fn().mockResolvedValue(undefined),
    clampCybertronCash: (n: bigint) => n,
  } as unknown as CybertronRepository;

  const subscribed: Array<(ctx: unknown) => void> = [];
  const tickService = {
    subscribe: (_: unknown, fn: (ctx: unknown) => void) => {
      subscribed.push(fn);
      return () => {};
    },
  } as unknown as TickService;

  const svc = new CybertronTickService(tickService, shipStateService, shipClassCache, repository, events, rand);
  svc.onModuleInit();

  function fireTick(): void {
    for (const fn of subscribed) {
      fn({ kind: 'PHYSICS', tickNumber: 1, firedAt: new Date() });
    }
  }

  function addShip(s: ShipState): void {
    shipMap.set(`${s.userid}:${s.shipno}`, s);
  }

  return { svc, events, addShip, fireTick };
}

describe('cloak reachability — cybertron-tick.service.ts:268 (scan loop skips cloak=10)', () => {
  it('Cybertron does not acquire cloaked player (cloak=10) as a new target', async () => {
    const { events, addShip, fireTick } = buildCybertronHarness();

    // Cybertron with no current target (cybmine=255)
    const cyb = makeShip({
      userid: 'cyb1', shipno: 101, shpclass: 21,
      status: 2, cybmine: 255, xcoord: 5, ycoord: 5, topspeed: 8,
    });
    // Cloaked player ship — the only target in the world
    const player = makeShip({
      userid: 'p1', shipno: 1, shpclass: 1,
      status: 1, cloak: CLOAK_RAMP_FULL, xcoord: 5, ycoord: 5,
    });

    addShip(cyb);
    addShip(player);

    const acquired: CybertronTargetAcquiredPayload[] = [];
    events.on(CYBERTRON_EVENT.TARGET_ACQUIRED, (p: CybertronTargetAcquiredPayload) => acquired.push(p));

    fireTick();

    // Cybertron must NOT acquire the cloaked player
    expect(acquired).toHaveLength(0);
    expect(cyb.cybmine).toBe(255); // no target locked
  });
});

describe('cloak reachability — cybertron-tick.service.ts:494 (current target cloaks → hold course)', () => {
  it('Cybertron with existing lock on player who cloaks → holds course, does not fire', async () => {
    const { events, addShip, fireTick } = buildCybertronHarness();

    // Player ship locked in cybertron's sights — now fully cloaked
    const player = makeShip({
      userid: 'p1', shipno: 1, shpclass: 1,
      status: 1, cloak: CLOAK_RAMP_FULL, xcoord: 5, ycoord: 5,
    });
    // Cybertron already has this player locked (cybmine = player.shipno = 1)
    const cyb = makeShip({
      userid: 'cyb1', shipno: 101, shpclass: 21,
      status: 2, cybmine: player.shipno, holdcourse: 0, xcoord: 5, ycoord: 5, topspeed: 8,
    });

    addShip(cyb);
    addShip(player);

    const phaser: unknown[] = [];
    events.on('cybertron.phaser-fired', (p: unknown) => phaser.push(p));

    fireTick();

    // Cybertron must not fire (target is cloaked)
    expect(phaser).toHaveLength(0);
    // Cybertron must set holdcourse (hold-course branch engaged)
    expect(cyb.holdcourse).toBeGreaterThan(0);
  });
});

describe('cloak reachability — cybertron-tick.service.ts:513 (acquisition scan skips cloak=10)', () => {
  it('Cybertron scans for new target — cloaked player is invisible, uncloaked player is acquired', async () => {
    const { events, addShip, fireTick } = buildCybertronHarness();

    const cyb = makeShip({
      userid: 'cyb1', shipno: 101, shpclass: 21,
      status: 2, cybmine: 255, xcoord: 5, ycoord: 5, topspeed: 8,
    });
    // Cloaked player — should be skipped
    const cloakedPlayer = makeShip({
      userid: 'p1', shipno: 1, shpclass: 1,
      status: 1, cloak: CLOAK_RAMP_FULL, xcoord: 5, ycoord: 5,
    });
    // Visible player — should be acquirable
    const visiblePlayer = makeShip({
      userid: 'p2', shipno: 2, shpclass: 1,
      status: 1, cloak: 0, xcoord: 5, ycoord: 5,
    });

    addShip(cyb);
    addShip(cloakedPlayer);
    addShip(visiblePlayer);

    const acquired: CybertronTargetAcquiredPayload[] = [];
    events.on(CYBERTRON_EVENT.TARGET_ACQUIRED, (p: CybertronTargetAcquiredPayload) => acquired.push(p));

    fireTick();

    // Cybertron must acquire the visible player and NOT the cloaked one
    expect(acquired).toHaveLength(1);
    expect(acquired[0].targetShipKey).toContain('p2');
    expect(acquired[0].targetShipKey).not.toContain('p1');
  });
});
