import { applyHyperspaceTransition } from './hyperspace';
import { checkGravity } from './gravity';
import { applySectorChangeEffects } from './sector-change';
import { GalaxyService } from '../galaxy/galaxy.service';
import { Inject, Optional, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { COORD_SCALE, GESTAT_USER, MOVENGMIN, MOVENGUSE, USEENERGY_RESERVE } from '../constants';
import { ShipState, shipKey } from '../ship/ship-state.types';
import { ShipStateService } from '../ship/ship-state.service';
import { TickService } from '../tick/tick.service';
import { TickContext, TickKind } from '../tick/tick.types';
import {
  PHYSICS_BOUNDARY_WRAPPED,
  PHYSICS_HYPERSPACE,
  PHYSICS_UNIVERSE_EDGE,
  PHYSICS_SECTOR_TRANSITION,
  PhysicsBoundaryWrappedEvent,
  PhysicsHyperspaceEvent,
  PhysicsSectorTransitionEvent,
  PHYSICS_GRAVITY,
  PHYSICS_DESTRUCT_CANCELLED,
  PhysicsGravityEvent,
} from './physics-events';
import {
  accelerationStep,
  positionIntegration,
  rotationStep,
  sectorOf,
  tryEnergyDebit,
  applyUniverseEdge,
} from './physics-math';
import { TELEDAM, UNIVWRAP, UNIVMAX } from '../constants';
import { ShipClassCacheService } from './ship-class-cache.service';
import { cdistance } from '../combat/combat-math';
import {
  SHIP_ENGINE_SHUTDOWN,
  SHIP_MISSILE_SHAKEN,
  SHIP_SPEED_REPORT,
  SHIP_WARP_PROGRESS,
  ShipEngineShutdownEvent,
  ShipMissileShakenEvent,
  ShipSpeedReportEvent,
  ShipWarpProgressEvent,
} from './speed-events';
import { RANDOM, Random, gernd } from '../combat/random.port';

/**
 * Orchestrates the 6-second PHYSICS tick: rotates, accelerates, moves, debits
 * movement-maintenance, and decrements per-tick countdowns for every active
 * ship. Mutations route through `ShipStateService.mutate()` so the existing
 * 1-second flush picks them up.
 *
 * Ordering inside each tick:
 *  1. Skip if destroyed (status sentinel — currently a no-op; spec FR-001).
 *  2. Conditional block (only when not in orbit / docked):
 *     rotate → accel → move (position) → maintenance debit.
 *  3. Unconditional countdowns: hypha, cantexit (FR-001, FR-008, FR-009).
 *
 * Per-ship faults are caught and logged; a single bad ship MUST NOT abort the
 * batch (FR-015). Ships are processed in ascending composite-shipId order so
 * tests are deterministic (FR-019).
 *
 * @see GEFUNCS.C:441-460 rotship, GEFUNCS.C:469-573 accel,
 *      GEFUNCS.C:617-792 moveship
 * @see specs/006a-physics-tick/research.md
 */
/**
 * How close the autopilot must get before it calls the trip done, in raw units.
 * 250 is the radius cmd_orbit accepts for establishing an orbit
 * (GECMDS.C:798), and the autopilot exists to put you within orbit range of
 * where you asked to go.
 */
const NAV_ARRIVAL_RANGE = 250;

/** Empty projectile slot — C's `channel == 255`. @see GEFUNCS.C:1611-1613 */
const NO_CHANNEL_SLOT = 255;

/**
 * Canon walks the ship table with a stride of 3 on the 1-second timer, so each
 * ship is advanced once every 3 seconds. @see GEMAIN.C:2472-2489 warrti2a
 */
const PHYSICS_STRIDE = 3;

@Injectable()
export class PhysicsTickService implements OnModuleInit {
  private readonly logger = new Logger(PhysicsTickService.name);
  private faultCount = 0;

  constructor(
    private readonly tickService: TickService,
    private readonly shipState: ShipStateService,
    private readonly shipClassCache: ShipClassCacheService,
    private readonly events: EventEmitter2,
    // Optional so the hand-built test harnesses keep working; without it a ship
    // simply never encounters gravity, which is the pre-existing behaviour.
    @Optional() private readonly galaxy?: GalaxyService,
    // Optional so the many hand-built test harnesses keep working. Without one
    // a ship simply never shakes a missile, which is the pre-existing
    // behaviour rather than a silent change of odds.
    @Optional() @Inject(RANDOM) private readonly random?: Random,
  ) {}

  /**
   * Canon's `clicker` — which third of the fleet this second belongs to.
   * @see GEMAIN.C:2470 `static int clicker = 0;`
   */
  private clicker = 0;

  onModuleInit(): void {
    // Canon runs rotateship/accel/moveship/destruct from `warrti2a`, which is
    // registered on the 1-SECOND timer (`rtkick(TICKTIME2,warrti2)`, TICKTIME2
    // = 1) and strides the fleet by 3 — so each ship moves every 3 seconds.
    // @see GEMAIN.C:2462-2493
    //
    // This used to sit on the 6-second PHYSICS tick, which halved every ship's
    // speed, turn rate, time-to-warp and self-destruct countdown, because
    // `positionIntegration` carries canon's per-CALL displacement and has no dt
    // term to compensate. The 6-second timer keeps what canon's `warrtia` puts
    // there — repair, shields, cloak, torpedo/missile flight, ion, recharge,
    // damage control — which the port already had right.
    this.tickService.subscribe(TickKind.SHIP_UPDATE, (ctx) => this.advanceAll(ctx));

    // hypha and cantexit are decremented inside `checktm`, which canon calls
    // from `warrtia` — the SIX-second timer — not from warrti2a. They must not
    // ride the movement cadence: at 3s the hyper-phaser would recharge in half
    // canon's time and a battle lock would release twice as early, letting a
    // ship run from a fight it should still be pinned in.
    // @see GEFUNCS.C:1522-1541 checktm
    this.tickService.subscribe(TickKind.PHYSICS, () => this.runCountdowns());
    this.logger.log(
      'Subscribed to SHIP_UPDATE (canon warrti2a, 1s stride 3) and PHYSICS (countdowns)',
    );
  }

  /**
   * Per-6-second countdowns: hyper-phaser cooldown and battle lock. Applied to
   * every ship, unstrided — the stride is a movement-loop detail in canon, and
   * `checktm` walks the whole table. @see GEFUNCS.C:1537-1541
   */
  private runCountdowns(): void {
    for (const ship of this.shipState.findAllShips()) {
      if (ship.hypha <= 0 && ship.cantexit <= 0) continue;
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        if (s.hypha > 0) s.hypha = Math.max(0, s.hypha - 1);
        if (s.cantexit > 0) s.cantexit = Math.max(0, s.cantexit - 1);
      });
    }
  }

  /** Total per-process fault counter, exposed for the debug controller. */
  getFaultCount(): number {
    return this.faultCount;
  }

  /**
   * Advance the third of the fleet due this second. Caller is the TickService
   * dispatcher; we walk a deterministic ascending-shipId snapshot of the
   * in-memory map and isolate per-ship faults.
   *
   * Canon's loop, verbatim in shape:
   *
   *   zothusn = clicker;
   *   while (zothusn < nships) { ...; zothusn += 3; }
   *   clicker = (clicker+1)%3;
   *
   * Every ship is therefore touched once per three seconds. The stride exists
   * in canon to smooth load across the 1-second timer; keeping it (rather than
   * moving the whole fleet every third second) preserves both the cadence and
   * the smoothing. @see GEMAIN.C:2472-2489
   */
  advanceAll(ctx: TickContext): void {
    // Boot race: movement runs on the 1-second timer, which can fire before
    // ShipClassCacheService finishes hydrating from Postgres — the 6-second
    // tick never could. Without this guard a live restart faulted every ship
    // ("ShipClass 21 not in cache") and skipped their movement anyway. Skipping
    // the tick costs one second of motion; faulting costs the same motion plus
    // an error per ship.
    //
    // Optional-called because several hand-built test harnesses supply a stub
    // cache object rather than the real service; a stub with no isHydrated is
    // treated as ready, which is what those tests intend.
    if (this.shipClassCache.isHydrated?.() === false) return;

    // FR-019 — ascending composite-shipId order (lexicographic on `${userid}:${shipno}`).
    const all = this.shipState
      .findAllShips()
      .slice()
      .sort((a, b) => {
        const ka = shipKey(a.userid, a.shipno);
        const kb = shipKey(b.userid, b.shipno);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });

    const ships = all.filter((_, i) => i % PHYSICS_STRIDE === this.clicker);
    this.clicker = (this.clicker + 1) % PHYSICS_STRIDE;

    for (const ship of ships) {
      try {
        this.advanceOne(ship, ctx);
      } catch (err) {
        this.faultCount += 1;
        const id = shipKey(ship.userid, ship.shipno);
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(
          `ship ${id} fault on tick ${ctx.tickNumber}: ${stack}`,
          { shipId: id, tickAt: ctx.firedAt },
        );
      }
    }
  }

  /**
   * Apply one tick to a single ship. All mutations route through
   * `ShipStateService.mutate(...)` to set the dirty flag for the flush path.
   */
  private advanceOne(ship: ShipState, ctx: TickContext): void {
    // Destroyed/removed ships are skipped entirely (FR-001).
    // (No `destroyed` flag exists on ShipState today; reserved for future combat work.)

    // NO AUTOPILOT. `nav` in canon is a read-only bearing report — cmd_navigate
    // is argument validation, cdistance, cbearing, prfmsg(NAV01), return
    // (GECMDS.C:5109-5156). It never steers, never moves, never holds a course.
    //
    // The port had one, and it generated six defects of its own: an arrival
    // test on sector membership that broke onboarding, a fixed arrival shell
    // that made arrival impossible above warp 1, undocking a captain who only
    // asked for a bearing, a bare speed order cancelling a turn, war/imp lying
    // about the course, and finally plotting courses through planets. It was
    // withdrawn on 2026-09-04. @see docs/DECISIONS.md
    //
    // `holdcourse` is an AI-only field in canon meaning "hold this heading for
    // N ticks, then re-decide" (GECYBS.C:318, GEDROIDS.C:328) and is left to
    // the AI, which is what it is for.

    // Rotation runs ALWAYS, orbit included. `warrti2a` calls
    // rotateship/accel/moveship/destruct with no orbit test (GEMAIN.C:2476-2483),
    // and rotateship itself contains no reference to `where` at all
    // (GEFUNCS.C:433-461) — the `where` gate lives only in moveship (:641, :652).
    //
    // Gating rotation on `where < 10` meant a ship in orbit was told "Now
    // turning to N degrees" and then simply did not turn: the heading only
    // applied once the pilot broke orbit. And because `rep nav` correctly omits
    // heading while orbiting (GECMDS.C:1984-1988), there was no way to see the
    // deferral — every `sca pl` bearing taken in orbit was measured against a
    // stale heading.
    this.applyRotation(ship);

    const inOrbitOrDocked = ship.where >= 10;

    if (!inOrbitOrDocked) {
      this.runConditionalBlock(ship, ctx);
    }

  }

  /**
   * Rotation — unconditional, orbit included. @see GEFUNCS.C:433-461 rotateship
   * Tick does not debit rotation energy; that is paid by the `rotate` command.
   */
  private applyRotation(ship: ShipState): void {
    const maxAccel = this.shipClassCache.getMaxAcceleration(ship.shpclass);
    const rot = rotationStep(ship.heading, ship.head2b, maxAccel);
    if (rot.newHeading !== ship.heading) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.heading = rot.newHeading;
      });
    }
  }

  /** accel → move → maintenance, only when not in orbit/docked. */
  private runConditionalBlock(ship: ShipState, ctx: TickContext): void {
    const maxAccel = this.shipClassCache.getMaxAcceleration(ship.shpclass);

    // 2. Acceleration (US1).
    // Captured before the step: the mutate below overwrites ship.speed, and the
    // warp-boundary test downstream needs the speed we came from.
    const speedBefore = ship.speed;
    const accel = accelerationStep(ship.speed, ship.speed2b, maxAccel);
    let speedChanged = accel.newSpeed !== ship.speed;
    let speed2bForcedZero = false;

    if (speedChanged && accel.energyDebit > 0) {
      // `useenergy` holds back a 500-unit reserve — `if (ptr->energy >=
      // amount+500)`, GEFUNCS.C:1505 — so acceleration cuts out below 620, not
      // below 120. The port passed a floor of 0 here and let a captain spend
      // into a reserve canon protects.
      const debit = tryEnergyDebit(ship.energy, accel.energyDebit, USEENERGY_RESERVE);
      if (debit.ok) {
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.speed = accel.newSpeed;
          s.energy = debit.newEnergy;
        });
      } else {
        // Debit refused — force speed2b = 0 so the ship begins to coast down.
        // Canon announces it: `prfmsg(NOACCEL,(int)ptr->speed)` on ALWAYS, so
        // the captain cannot filter away the news that the engines quit.
        // @see GEFUNCS.C:526-531
        const shutdownSpeed = ship.speed;
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.speed2b = 0;
        });
        this.events.emit(SHIP_ENGINE_SHUTDOWN, {
          shipId: shipKey(ship.userid, ship.shipno),
          userid: ship.userid,
          shipno: ship.shipno,
          speed: shutdownSpeed,
        } satisfies ShipEngineShutdownEvent);
        speedChanged = false;
        speed2bForcedZero = true;
      }
    } else if (speedChanged) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.speed = accel.newSpeed;
      });
    }

    // The helm calls out each integer warp factor it passes, climbing and
    // slowing alike, and says DEADSTOP instead of "warp 0" on the step that
    // reaches a standstill. On the way DOWN canon adds 1 — the factor announced
    // is the one being left, not the one entered.
    // @see GEFUNCS.C:497-500 (climb), :556-566 (slow)
    if (speedChanged && !accel.snapped) {
      const fromWarp = Math.trunc(speedBefore / 1000);
      const toWarp = Math.trunc(accel.newSpeed / 1000);
      if (fromWarp !== toWarp) {
        const climbing = accel.newSpeed > speedBefore;
        this.events.emit(SHIP_WARP_PROGRESS, {
          shipId: shipKey(ship.userid, ship.shipno),
          userid: ship.userid,
          shipno: ship.shipno,
          warp: climbing ? toWarp : toWarp + 1,
        } satisfies ShipWarpProgressEvent);
      }
    }

    // Crossing a warp boundary can shake off missiles locked onto you.
    // Canon puts this inside the non-snap accelerate branch, after the energy
    // debit succeeds, and only when the integer warp number changes — the same
    // condition that prints WARP. It then rolls `4 + gernd()%4` and zeroes
    // every tracked missile if the new warp meets it.
    // @see GEFUNCS.C:497-521
    if (speedChanged && !accel.snapped && accel.newSpeed > speedBefore && this.random) {
      const crossed = Math.trunc(speedBefore / 1000) !== Math.trunc(accel.newSpeed / 1000);
      if (crossed) {
        const threshold = 4 + (gernd(this.random) % 4);
        if (accel.newSpeed / 1000 >= threshold) {
          let count = 0;
          this.shipState.mutate(ship.userid, ship.shipno, (s) => {
            for (let i = 0; i < s.lmisslDistance.length; i++) {
              if (s.lmisslDistance[i] > 0) {
                // Free the WHOLE slot. Zeroing distance alone announced the
                // kill and did not deliver it: CombatTickService walks each
                // slot by CHANNEL, so a channel left set is still processed,
                // `newDist = 0 - MISLSPED` goes negative, and the missile
                // detonates at full stored charge one tick later. The player
                // was told they had shaken it off and was then hit by it.
                s.lmisslDistance[i] = 0;
                s.lmisslChannel[i] = NO_CHANNEL_SLOT;
                s.lmisslEnergy[i] = 0;
                count++;
              }
            }
          });
          if (count > 0) {
            const evt: ShipMissileShakenEvent = {
              shipId: shipKey(ship.userid, ship.shipno),
              userid: ship.userid,
              shipno: ship.shipno,
              count,
            };
            this.events.emit(SHIP_MISSILE_SHAKEN, evt);
          }
        }
      }
    }

    // The helm answers when it reaches the ordered speed. C prints SPEEDIS on
    // either snap, or SPEED0 when that snap is a dead stop
    // (GEFUNCS.C:487-489, :543-553), to the captain's own socket.
    if (speedChanged && accel.snapped) {
      const evt: ShipSpeedReportEvent = {
        shipId: shipKey(ship.userid, ship.shipno),
        userid: ship.userid,
        shipno: ship.shipno,
        speed: accel.newSpeed,
      };
      this.events.emit(SHIP_SPEED_REPORT, evt);
    }

    // Hyperspace event — emit only when the step actually applied (i.e., the
    // useenergy gate did not refuse the change).
    if (speedChanged && accel.hyperspaceEvent !== null) {
      // The state change belongs inline — this event once had no listener at
      // all, so `where` never became 1 for a player and every `where === 1`
      // gate in the game was dead code.
      //
      // The MESSAGES were the other half of that same gap and outlived the
      // fix: C prints HYSHDN, HYCLDN and HYPERIN on entry (GEFUNCS.C:590-601),
      // and the port printed none of them. A pilot who raised shields, jumped
      // to warp and stopped had no idea they were now unshielded. That is not
      // cosmetic: it is how a new player dies a sector out from the hub without
      // ever knowing what went wrong. The transition therefore reports what it
      // took, and the gateway says so.
      // @see GEFUNCS.C:580-628 hyperspace
      let dropped = { shieldsDropped: false, cloakDropped: false };
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        dropped = applyHyperspaceTransition(s, accel.hyperspaceEvent as 'enter' | 'exit');
      });

      const payload: PhysicsHyperspaceEvent = {
        shipId: shipKey(ship.userid, ship.shipno),
        direction: accel.hyperspaceEvent,
        speed: accel.newSpeed,
        tickAt: ctx.firedAt,
        shieldsDropped: dropped.shieldsDropped,
        cloakDropped: dropped.cloakDropped,
      };
      this.events.emit(PHYSICS_HYPERSPACE, payload);

      // Set auto-shield warp-exit trigger (T024 — consumed by ShipTickService.processShip).
      if (accel.hyperspaceEvent === 'exit') {
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.recentlyWarpedExit = true;
        });
      }
    }

    // 3. Position integration (US1). Uses the *current* heading + speed.
    if (ship.speed > 0) {
      const preX = ship.xcoord;
      const preY = ship.ycoord;
      const preSector = sectorOf({ x: preX, y: preY });
      const next = positionIntegration(preX, preY, ship.heading, ship.speed);

      // Universe boundary — only in normal space (where <= 1).
      // @see GEFUNCS.C:651-705 moveship — wrap and no-wrap arms
      let wrappedX = next.x;
      let wrappedY = next.y;
      let xWrapped = false;
      let yWrapped = false;
      let hitEdge = false;
      if (ship.where <= 1) {
        const ex = applyUniverseEdge(next.x, UNIVMAX, UNIVWRAP);
        const ey = applyUniverseEdge(next.y, UNIVMAX, UNIVWRAP);
        xWrapped = UNIVWRAP && ex.value !== next.x;
        yWrapped = UNIVWRAP && ey.value !== next.y;
        hitEdge = ex.hitEdge || ey.hitEdge;
        wrappedX = ex.value;
        wrappedY = ey.value;
      }

      const postSector = sectorOf({ x: wrappedX, y: wrappedY });

      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.xcoord = wrappedX;
        s.ycoord = wrappedY;
        if (hitEdge) {
          // telezip: the wall takes your momentum and 17 hull.
          // @see GEFUNCS.C:819-833
          s.speed = 0;
          s.speed2b = 0;
          s.damage = s.damage + TELEDAM;

          // ...and drops you out of hyperspace. C does NOT, and that is an
          // oversight rather than a design: telezip zeroes speed and speed2b
          // and never calls hyperspace(ptr,usrn,0), while the only exit
          // transition (GEFUNCS.C:537-539) requires `speed/1000 >= 1` — which
          // is now impossible. A ship that strikes the perimeter at warp is
          // left flagged as being IN hyperspace at a dead stop, permanently,
          // and every `where === 1` gate treats it as still warping. The
          // escape in the original is to `war 1` and then `war 0` again, which
          // no player would ever deduce.
          // Fixed per the standing rule that the original's defects are not
          // reproduced. @see docs/DECISIONS.md
          if (s.where === 1) s.where = 0;
        }
      });

      if (hitEdge) {
        this.events.emit(PHYSICS_UNIVERSE_EDGE, {
          shipId: shipKey(ship.userid, ship.shipno),
          damage: TELEDAM,
        });
      }

      // C calls gravity() from moveship under BOTH of these conditions:
      //
      //     /* Cybertrons ignore gravity */
      //     if (ptr->where == 0 && ptr->status == GESTAT_USER)
      //         gravity(ptr,usrn);
      //
      // (GEFUNCS.C:794-795.) `where == 0` is normal space; `where == 1` is
      // hyperspace, i.e. at warp — so canon never runs this check while you are
      // warping, and you CANNOT fly into a planet at warp. This code cited
      // those exact lines while implementing only the call.
      //
      // It cost two players three deaths in round 5, and the warning ladder
      // cannot rescue them: 250/50/25 units deep against 1,385 units of travel
      // per tick at warp 9, so all three bands and the kill threshold fall
      // inside one tick. That is why canon does not run it there.
      if (ship.where === 0 && ship.status === GESTAT_USER) {
        this.applyGravity(ship, postSector, ctx);
      }

      if (xWrapped || yWrapped) {
        const axis = xWrapped && yWrapped ? 'both' : xWrapped ? 'x' : 'y';
        const wrapped: PhysicsBoundaryWrappedEvent = {
          shipId: shipKey(ship.userid, ship.shipno),
          axis,
          preCoord: { x: next.x, y: next.y },
          postCoord: { x: wrappedX, y: wrappedY },
          tickAt: ctx.firedAt.getTime(),
        };
        this.events.emit(PHYSICS_BOUNDARY_WRAPPED, wrapped);
      }

      if (preSector.x !== postSector.x || preSector.y !== postSector.y) {
        // C clears `hostile` and cancels an armed self-destruct on reaching a
        // neutral sector, right here inside moveship. @see GEFUNCS.C:724-730
        let destructCancelled = false;
        this.shipState.mutate(ship.userid, ship.shipno, (v) => {
          destructCancelled = applySectorChangeEffects(v, postSector);
        });
        if (destructCancelled) {
          this.events.emit(PHYSICS_DESTRUCT_CANCELLED, {
            shipId: shipKey(ship.userid, ship.shipno),
            tickAt: ctx.firedAt,
          });
        }

        const payload: PhysicsSectorTransitionEvent = {
          shipId: shipKey(ship.userid, ship.shipno),
          fromSector: preSector,
          toSector: postSector,
          x: wrappedX,
          y: wrappedY,
          tickAt: ctx.firedAt,
        };
        this.events.emit(PHYSICS_SECTOR_TRANSITION, payload);
      }
    }

    // 4. Movement-maintenance debit — player ships only (FR-006).
    //    `status === 1` (GESTAT_USER) gates the entire block in the original.
    if (ship.speed > 0 && ship.status === 1 && !speed2bForcedZero) {
      const debit = tryEnergyDebit(ship.energy, MOVENGUSE, 0);
      if (debit.ok) {
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.energy = debit.newEnergy;
          // Post-debit floor cutoff: if we're now below MOVENGMIN, force coast-down.
          if (s.energy < MOVENGMIN) s.speed2b = 0;
        });
      } else {
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.speed2b = 0;
        });
      }
    }
  }
  /**
   * Planet and wormhole proximity — the only reason to be careful where you
   * point a warp run. Fly into a planet and the hull is written off; fly into
   * a wormhole and you come out at its destination, 5.5 damage worse off and
   * with every torpedo and missile lock cleared.
   *
   * Neither existed in the port: `gravity` had no implementation and the
   * wormhole rows the galaxy generator writes had no reader.
   *
   * @see GEFUNCS.C:836-905 gravity
   */
  private applyGravity(ship: ShipState, sector: { x: number; y: number }, ctx: TickContext): void {
    if (!this.galaxy) return;

    const bodies = this.galaxy.getGravityBodies(sector.x, sector.y);
    if (bodies.length === 0) return;

    for (const event of checkGravity(ship, bodies)) {
      const payload: PhysicsGravityEvent = {
        shipId: shipKey(ship.userid, ship.shipno),
        plnum: event.plnum,
        isWormhole: event.isWormhole,
        band: event.band,
        tickAt: ctx.firedAt,
      };
      this.events.emit(PHYSICS_GRAVITY, payload);

      if (!event.effect) continue;

      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        if (event.effect!.kind === 'crash') {
          s.damage = event.effect!.damage;
          // Record WHAT killed them. Kill resolution runs later and sees only a
          // damage figure with no attacker, which is indistinguishable from a
          // killer who logged off — and the mail then told a pilot who had
          // flown into a planet that "an unknown assailant" got them.
          s.deathCause = {
            kind: 'gravity',
            what: event.isWormhole ? `wormhole ${event.plnum}` : `planet ${event.plnum}`,
          };
          return;
        }
        const w = event.effect as { destination: { xcoord: number; ycoord: number }; damage: number };
        s.xcoord = w.destination.xcoord;
        s.ycoord = w.destination.ycoord;
        s.damage += w.damage;
        // cleartm(usrn) — a transit shakes off everything chasing you.
        for (let i = 0; i < s.ltorpsDistance.length; i++) s.ltorpsDistance[i] = 0;
        for (let i = 0; i < s.ltorpsChannel.length; i++) s.ltorpsChannel[i] = 255;
        for (let i = 0; i < s.lmisslDistance.length; i++) s.lmisslDistance[i] = 0;
        for (let i = 0; i < s.lmisslChannel.length; i++) s.lmisslChannel[i] = 255;
      });

      // A crash or a jump ends this ship's move.
      break;
    }
  }

}
