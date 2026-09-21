/**
 * A whole galaxy of AI, run headless on a fake clock.
 *
 * The real services — the tick heartbeats, movement, ship housekeeping, combat,
 * the Cybertron AI and its trace, and `pha` for pilots who shoot back — over an
 * in-memory ship map. Only the persistence edge is faked. Canon's class table is
 * loaded through the real `ShipClassCacheService`, from the generated seed.
 *
 * Why: the hub-trap bugs of 2026-09-20 were EMERGENT. Every unit test passed
 * while an Obliterator sat in sector (0,0) for hours. This runs hours of play
 * and lets a spec assert what the AI's decisions add up to.
 * @see issue #61, docs/superpowers/specs/2026-09-21-ai-galaxy-simulation-design.md
 *
 * A spec using this MUST set `process.env.UNIVMAX = '100'` inside `vi.hoisted`
 * before importing it: `constants.ts` reads UNIVMAX once, at import.
 *
 * Known limits, each stated where it matters:
 *  - no galaxy service, so no gravity and no planets;
 *  - no PlayerScoreService, so `CYBERTRON_SCORED_KILL` never fires and a killer's
 *    claim lapses through `releaseTargetLeft` instead of `releaseWon`;
 *  - `createSpawn` builds the hull on `makeShip` defaults rather than Prisma's
 *    column defaults. `galaxy-sim.sim.spec.ts` pins the fields it writes.
 */
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';
import { Mulberry32Adapter } from '../../src/game/combat/random.port';
import { CombatTickService } from '../../src/game/combat/combat-tick.service';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { MineRepository } from '../../src/game/combat/mine.repository';
import { CommandContext } from '../../src/game/commands/command.types';
import { PhaserHandlerService } from '../../src/game/commands/handlers/phaser.handler';
import { renderTrace } from '../../src/game/commands/handlers/sys-trace';
import { CybTraceService } from '../../src/game/cybertron/cyb-trace.service';
import { CybertronRepository, SpawnSlotInit } from '../../src/game/cybertron/cybertron.repository';
import { CybertronTickService } from '../../src/game/cybertron/cybertron-tick.service';
import { InvariantRegistry } from '../../src/game/invariants/harness';
import { PhysicsTickService } from '../../src/game/physics/physics-tick.service';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { MaintenanceService } from '../../src/game/ship/maintenance.service';
import { ShipState, shipKey } from '../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { ShipTickService } from '../../src/game/ship/ship-tick.service';
import { TickService } from '../../src/game/tick/tick.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { makeShip } from '../helpers/make-ship';
import { headingToward } from '../../src/game/physics/physics-math';

/** One emission, in order. */
export interface SimEvent {
  at: number;
  name: string;
  payload: unknown;
}

/** Called once per simulated second, after the tick, for one pilot. */
export type PilotScript = (pilot: ShipState, sim: GalaxySim) => void | Promise<void>;

export interface PilotOptions {
  name: string;
  classNumber: number;
  at: { x: number; y: number };
  script?: PilotScript;
}

const quietLogger = { log: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as unknown as Logger;

export class GalaxySim {
  readonly events: SimEvent[] = [];
  /** Simulated seconds elapsed since boot. */
  elapsed = 0;

  private readonly map = new Map<string, ShipState>();
  private readonly scripts = new Map<string, PilotScript>();
  private nextChannel = 1;

  private constructor(
    readonly seed: number,
    readonly emitter: EventEmitter2,
    readonly classes: ShipClassCacheService,
    readonly traceService: CybTraceService,
    private readonly tick: TickService,
    readonly phaser: PhaserHandlerService,
  ) {}

  /**
   * Install the fake clock a sim runs on: the timers the game uses and `Date`,
   * and nothing else, so `performance.now()` and `process.hrtime` stay real for
   * measuring wall time. Call before `create`, which opens the heartbeats.
   */
  static installClock(): void {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  }

  /** Build and boot a galaxy. `installClock()` must have run first. */
  static async create(opts: { seed: number }): Promise<GalaxySim> {
    const random = new Mulberry32Adapter(opts.seed);
    const emitter = new EventEmitter2();

    const classes = new ShipClassCacheService({
      shipClass: { findMany: async () => SHIP_CLASSES.map((c) => ({ ...c })) },
    } as unknown as PrismaService);
    await classes.onModuleInit();

    const tick = new TickService(new InvariantRegistry());
    const traceService = new CybTraceService({ now: () => Date.now() });

    // Assigned below; the ship-state surface closes over it.
    let sim!: GalaxySim;
    const shipState = GalaxySim.shipStateOver(() => sim.map);

    const repository = {
      hydrateAll: async () => undefined,
      createSpawn: async (slot: SpawnSlotInit) => sim.loadSpawn(slot),
      flushShipsImmediate: async () => undefined,
      flushUsersImmediate: async () => undefined,
      creditAllowances: async () => undefined,
      incrementKills: async () => undefined,
      clampCybertronCash: (n: bigint) => n,
    } as unknown as CybertronRepository;

    const mineRegistry = new MineRegistry();
    const mineRepo = {
      findAllActive: async () => [],
      create: async () => ({ id: 0 }),
      delete: async () => undefined,
    } as unknown as MineRepository;

    const combat = new CombatTickService(
      tick, shipState, mineRepo, mineRegistry, random, emitter, quietLogger, classes, traceService,
    );
    const physics = new PhysicsTickService(tick, shipState, classes, emitter, undefined, random);
    const shipTick = new ShipTickService(tick, shipState, {} as MaintenanceService, undefined, emitter);
    const phaser = new PhaserHandlerService(shipState, classes, emitter, random, combat, traceService);
    const cyb = new CybertronTickService(
      tick, shipState, classes, repository, emitter, random,
      undefined, combat, mineRegistry, mineRepo, traceService,
    );

    sim = new GalaxySim(opts.seed, emitter, classes, traceService, tick, phaser);
    emitter.onAny((name: string | string[], payload: unknown) => {
      sim.events.push({ at: sim.elapsed, name: Array.isArray(name) ? name.join('.') : name, payload });
    });

    // Nest's order: every onModuleInit, then onApplicationBootstrap opens the
    // heartbeats. @see TickService.onApplicationBootstrap
    physics.onModuleInit();
    shipTick.onModuleInit();
    await combat.onModuleInit();
    await cyb.onModuleInit();
    tick.onApplicationBootstrap();
    return sim;
  }

  /** The `ShipStateService` surface the services use, over the sim's map. */
  private static shipStateOver(map: () => Map<string, ShipState>): ShipStateService {
    return {
      findAllShips: () => Array.from(map().values()),
      findByUserid: (uid: string) => Array.from(map().values()).filter((s) => s.userid === uid),
      get: (uid: string, no: number) => map().get(shipKey(uid, no)),
      mutate: (uid: string, no: number, fn: (s: ShipState) => void) => {
        const s = map().get(shipKey(uid, no));
        if (s) { fn(s); s.dirty = true; }
        return s;
      },
      loadShip: (s: ShipState) => { map().set(shipKey(s.userid, s.shipno), s); },
      removeFromGame: (s: { userid: string; shipno: number }) => { map().delete(shipKey(s.userid, s.shipno)); },
      size: () => map().size,
      flush: async () => undefined,
    } as unknown as ShipStateService;
  }

  /**
   * The in-memory half of `CybertronRepository.createSpawn`: the same fields the
   * real one writes, then `loadShip`. @see cybertron.repository.ts createSpawn
   */
  private loadSpawn(slot: SpawnSlotInit): void {
    const ship = makeShip({
      userid: slot.userid,
      shipno: slot.shipno,
      shipname: slot.shipname,
      shpclass: slot.classNumber,
      xcoord: slot.xcoord,
      ycoord: slot.ycoord,
      phasr: 100,
      phasrtype: slot.phasrtype,
      shieldtype: slot.shieldtype,
      topspeed: slot.topspeed,
      cybmine: 255,
      cybskill: slot.cybskill,
      tick: slot.tick,
      cybupdate: 100,
      holdcourse: 0,
      status: 2,
      energy: 0,
      damage: 0,
      channel: this.nextChannel++,
      items: [
        0n, 0n, BigInt(slot.loadout.torpedo), 0n, BigInt(slot.loadout.fluxpod), 0n, 0n,
        BigInt(slot.loadout.decoys), 0n, 0n, BigInt(slot.loadout.jammers),
        BigInt(slot.loadout.mine), BigInt(slot.loadout.gold), 0n,
      ],
    });
    delete (ship as { username?: string }).username;
    this.map.set(shipKey(ship.userid, ship.shipno), ship);
  }

  /** Put a pilot in the galaxy. Returns the live ship. */
  addPilot(o: PilotOptions): ShipState {
    const cls = SHIP_CLASSES.find((c) => c.classNumber === o.classNumber);
    if (!cls) throw new Error(`no class ${o.classNumber}`);
    const ship = makeShip({
      userid: `pilot_${o.name}`,
      shipno: 1,
      shipname: o.name,
      username: o.name,
      shpclass: o.classNumber,
      status: 1,
      channel: this.nextChannel++,
      xcoord: o.at.x,
      ycoord: o.at.y,
      speed: 0,
      speed2b: 0,
      topspeed: cls.maxWarp,
      phasrtype: cls.maxPhaser,
      shieldtype: cls.maxShields,
      phasr: 100,
      energy: 50_000,
      cybmine: 255,
    });
    this.map.set(shipKey(ship.userid, ship.shipno), ship);
    if (o.script) this.scripts.set(shipKey(ship.userid, ship.shipno), o.script);
    return ship;
  }

  ships(): ShipState[] {
    return Array.from(this.map.values());
  }

  cybertrons(): ShipState[] {
    return this.ships().filter((s) => s.status === 2 && s.userid.startsWith('Cybrg-'));
  }

  pilots(): ShipState[] {
    return this.ships().filter((s) => s.status === 1);
  }

  /** A Cybertron's `sys trace`, rendered exactly as a sysop would read it. */
  trace(key: string): string[] {
    const ship = this.map.get(key);
    const entries = this.traceService.read(key);
    return ship ? renderTrace(ship, entries) : [`${key} (no longer in the galaxy)`, ...entries.map((e) => JSON.stringify(e))];
  }

  /** Issue a player command as a pilot. Only `pha` is wired. */
  async command(pilot: ShipState, verb: 'pha', args: string[]): Promise<void> {
    await this.phaser.command.handler(pilot, args, {} as CommandContext);
  }

  /**
   * Advance simulated time one second at a time. After each second: the pilot
   * scripts run, then `every` — return `false` from it to stop early.
   */
  async run(opts: { seconds: number; every?: (sim: GalaxySim) => boolean | void }): Promise<void> {
    for (let i = 0; i < opts.seconds; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      this.elapsed++;
      for (const [key, script] of this.scripts) {
        const pilot = this.map.get(key);
        if (pilot) await script(pilot, this);
      }
      if (opts.every?.(this) === false) return;
    }
  }

  dispose(): void {
    this.tick.onModuleDestroy();
  }
}

/**
 * Fly between two points: head for the current one at `speed` (warp × 1000),
 * stop on arrival, and swap ends every `periodSeconds`. Steers the way the AI
 * does, by `head2b` / `speed2b`, and lets the real movement code do the flying.
 */
export function commute(a: { x: number; y: number }, b: { x: number; y: number }, periodSeconds: number, speed = 2000): PilotScript {
  return (pilot, sim) => {
    const to = Math.floor(sim.elapsed / periodSeconds) % 2 === 0 ? b : a;
    const dx = to.x - pilot.xcoord;
    const dy = to.y - pilot.ycoord;
    if (Math.hypot(dx, dy) < 0.2) {
      pilot.speed2b = 0;
      return;
    }
    pilot.head2b = headingToward(dx, dy);
    pilot.speed2b = speed;
  };
}
