import { Inject, Injectable, Logger, OnModuleInit, Optional} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipStateService } from '../ship/ship-state.service';
import { TickService } from '../tick/tick.service';
import { TickKind } from '../tick/tick.types';
import { TickOrder } from '../tick/tick-order';
import { ShipState, shipKey } from '../ship/ship-state.types';
import { CLOAK_ENERGY_USE } from './cloak.config';
import { SHMINPWR } from '../constants';
import {
  SHIP_STATUS_NOTICE,
  ShipStatusNotice,
  ShipStatusNoticeEvent,
} from '../ship/repair-events';

/** `shieldstat == SHIELDUP` — shields raised. @see GEMAIN.H */
const SHIELDUP_STAT = 1;
import { isInNeutralZone } from '../combat/neutral-zone';
import { cdistance, destructBlastDamage } from '../combat/combat-math';
import { MINERANGE } from '../constants';
import { RANDOM, Random, gernd } from '../combat/random.port';
import { COMBAT_DESTRUCT_BLAST, CombatDestructBlastEvent } from '../combat/combat-events';
import { CLOAK_RAMP_INIT, CLOAK_RAMP_MID, CLOAK_RAMP_FULL } from './_ship-management-constants';
import { formatMessage, MessageId } from './messages';
import { COMBAT_SHIP_DESTROYED, CombatShipDestroyedEvent } from '../combat/combat-events';

/**
 * Drives cloak ramp/drain and self-destruct countdown on every 6-second physics tick.
 * Subscribes to TickKind.PHYSICS after PhysicsTickService and CombatTickService.
 *
 * @see GEFUNCS.C:1366 cloakstat — cloak per-tick maintenance
 * @see GEFUNCS.C:1820 destruct — self-destruct countdown
 */
/** Canon strides the ship table by 3 on the 1-second timer. @see GEMAIN.C:2472 */
const DESTRUCT_STRIDE = 3;

@Injectable()
export class ShipManagementTickService implements OnModuleInit {
  private readonly logger = new Logger(ShipManagementTickService.name);

  constructor(
    private readonly shipState: ShipStateService,
    private readonly tickService: TickService,
    private readonly events: EventEmitter2,
    @Inject(CLOAK_ENERGY_USE) private readonly cloakEnergyUse: number,
    // Optional so the hand-built test harnesses keep working; without one the
    // shield divisor roll is 0, which is simply canon's most favourable case
    // for the victim rather than a change of behaviour.
    @Optional() @Inject(RANDOM) private readonly random?: Random,
  ) {}

  /** Canon's `clicker` — which third of the fleet this second belongs to. */
  private clicker = 0;

  onModuleInit(): void {
    this.tickService.subscribe(
      TickKind.PHYSICS,
      () => this.onPhysicsTick(),
      // `cloakstat` is FOURTH in warrtia (GEMAIN.C:2259), after fluxstat.
      // That order is the difference between a cloak surviving on a
      // reloaded pod and dying at zero with a full hold. @see tick-order.ts
      TickOrder.CLOAK,
    );

    // The self-destruct countdown belongs to the MOVEMENT clock. Canon calls
    // `destruct(wptr,zothusn)` from warrti2a, in the same strided loop as
    // rotate/accel/move (GEMAIN.C:2476-2483) — so it ticks once per 3 seconds
    // per ship, not once per 6. Left on the slow tick a 20-count took two
    // minutes instead of one.
    //
    // `cloakstat` deliberately stays on the 6-second tick: canon runs THAT from
    // warrtia (GEFUNCS.C:1366). The two live in this service together but
    // belong to different clocks.
    this.tickService.subscribe(TickKind.SHIP_UPDATE, () => this.onDestructTick());
    this.logger.log('ShipManagementTickService subscribed to PHYSICS tick');
  }

  private onPhysicsTick(): void {
    const ships = this.shipState
      .findAllShips()
      .slice()
      .sort((a, b) => {
        const ka = shipKey(a.userid, a.shipno);
        const kb = shipKey(b.userid, b.shipno);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });

    for (const ship of ships) {
      try {
        this.cloakTick(ship);
        this.shieldPowerTick(ship);
      } catch (err) {
        const id = shipKey(ship.userid, ship.shipno);
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(`ship-management tick fault for ${id}: ${stack}`);
      }
    }
  }

  /**
   * Per-physics-tick cloak maintenance — ramps 1→2→10 and drains energy.
   * Auto-decloaks when energy is insufficient (CLENGUSE check).
   * @see GEFUNCS.C:1366 cloakstat
   */
  cloakTick(ship: ShipState): void {
    if (ship.cloak === 0) return;

    // Damaged cloak (< 0): increment toward 0 each tick.
    if (ship.cloak < 0) {
      let repaired = false;
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.cloak += 1;
        repaired = s.cloak === 0;
      });
      // `if (ptr->cloak == 0) prfmsg(CLREPR);` @see GEFUNCS.C:1391-1394
      if (repaired) this.notice(ship, 'cloak-repaired');
      return;
    }

    // Active cloak (> 0): energy starvation check first.
    if (ship.energy < this.cloakEnergyUse) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.cloak = 0;
      });
      // Per-captain collapse notification via event (gateway or handler listens).
      this.events.emit('ship-management.cloak-collapsed', {
        userid: ship.userid,
        shipId: shipKey(ship.userid, ship.shipno),
        message: formatMessage(MessageId.CLOAK_COLLAPSED),
        sector: { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) },
      } satisfies CloakCollapsedPayload);
      return;
    }

    // Drain energy and advance ramp.
    let reachedFull = false;
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.energy -= this.cloakEnergyUse;
      if (s.cloak === CLOAK_RAMP_INIT) {
        s.cloak = CLOAK_RAMP_MID;
      } else if (s.cloak === CLOAK_RAMP_MID) {
        s.cloak = CLOAK_RAMP_FULL;
        reachedFull = true;
      }
      // CLOAK_RAMP_FULL (10): no further transition.
    });

    // `ptr->cloak = 10; prfmsg(CLOKUP);` — the ramp completing is the moment
    // that matters: until then the ship is still visible and still lockable.
    // @see GEFUNCS.C:1722-1726
    if (reachedFull) this.notice(ship, 'cloak-full');
  }

  /**
   * Shields fall the moment there is not enough power to hold them.
   *
   *   if (ptr->shieldstat == SHIELDUP && ptr->energy < SHMINPWR)
   *       { ptr->shieldstat = SHIELDDN; ptr->shield = 0; prfmsg(SHDNNOP); }
   *
   * @see GEFUNCS.C:1340-1348 shieldstat
   *
   * SHMINPWR was defined in constants.ts and used by no production code, so
   * this did not happen at all — a drained ship sat shielded indefinitely.
   */
  shieldPowerTick(ship: ShipState): void {
    if (ship.shieldstat !== SHIELDUP_STAT) return;
    if (ship.energy >= SHMINPWR) return;

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.shieldstat = 0; // SHIELDDN
      s.shield = 0;
    });
    this.notice(ship, 'shields-no-power');
  }

  /** One status notice to the ship's own captain. */
  private notice(ship: ShipState, notice: ShipStatusNotice): void {
    this.events.emit(SHIP_STATUS_NOTICE, {
      shipId: shipKey(ship.userid, ship.shipno),
      notice,
      tickAt: new Date(),
    } satisfies ShipStatusNoticeEvent);
  }

  /**
   * Damage every ship within one sector of a scuttled hull.
   *
   *   if (ddist < MINERANGE && (xsect != 0 || ysect != 0)) { ... }
   *   wptr->damage += damage;
   *   wptr->lastfired = -1;
   *
   * @see GEFUNCS.C:1866-1895
   *
   * The neutral zone is exempt — `(xsect != 0 || ysect != 0)` — so a scuttle at
   * the origin harms nobody, which is what keeps (0,0) safe for new captains.
   * `lastfired = -1` means a scuttle that finishes someone off scores for
   * no one.
   *
   * The destructing ship is skipped: canon's loop includes it, but it is
   * already at damage 101 and is removed on the next line, so the only visible
   * difference would be a damage report sent to a pilot whose ship no longer
   * exists.
   */
  private applyDestructBlast(bomb: ShipState): void {
    if (isInNeutralZone(bomb)) return;

    for (const victim of this.shipState.findAllShips()) {
      if (victim.userid === bomb.userid && victim.shipno === bomb.shipno) continue;

      const distanceRaw = cdistance(bomb, victim) * 10_000;
      if (distanceRaw >= MINERANGE) continue;

      const shieldUp = victim.shieldstat === 1;
      const damage = destructBlastDamage(
        distanceRaw, bomb.shpclass, shieldUp, victim.shieldtype,
        this.random ? gernd(this.random) % 5 : 0,
      );
      if (damage <= 0) continue;

      this.shipState.mutate(victim.userid, victim.shipno, (v) => {
        v.damage += damage;
        v.lastfired = -1;
        // Cleared, not set: canon has no weapon for a scuttle blast and the
        // union has no member for one. Reporting the last torpedo to graze this
        // hull as the cause would be a wrong answer, where `unknown` is merely
        // an incomplete one. @see issue #52
        v.lastWeapon = undefined;
      });

      this.events.emit(COMBAT_DESTRUCT_BLAST, {
        victimId: shipKey(victim.userid, victim.shipno),
        damage,
        shieldUp,
        tickAt: new Date(),
      } satisfies CombatDestructBlastEvent);
    }
  }

  /**
   * The strided destruct pass — a third of the fleet each second, so every ship
   * counts down once per 3 seconds. @see GEMAIN.C:2472-2489
   */
  private onDestructTick(): void {
    const all = this.shipState.findAllShips();
    const due = all.filter((_, i) => i % DESTRUCT_STRIDE === this.clicker);
    this.clicker = (this.clicker + 1) % DESTRUCT_STRIDE;
    for (const ship of due) {
      try {
        this.destructTick(ship);
      } catch (err) {
        this.logger.error(`destruct tick failed for ${shipKey(ship.userid, ship.shipno)}: ${String(err)}`);
      }
    }
  }

  /**
   * Per-tick destruct countdown — decrements, broadcasts sector warnings,
   * and destroys the ship on expiration.
   * @see GEFUNCS.C:1820 destruct
   */
  destructTick(ship: ShipState): void {
    if (ship.destruct <= 0) return;

    const sectorX = Math.floor(ship.xcoord);
    const sectorY = Math.floor(ship.ycoord);
    const room = `sector:${sectorX}:${sectorY}`;

    // Decrement (canonical: --ptr->destruct).
    const newCount = ship.destruct - 1;
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.destruct = newCount;
    });

    if (newCount > 0) {
      // Canon prints TWO different things on a countdown tick, to two different
      // audiences, and they are not alternatives (GEFUNCS.C:1833-1852):
      //
      //   SELFD2A/2B/2C -> outrange, i.e. the SECTOR, and only at 10, 5 and 2
      //   SELFD2        -> outprfge(usrn), i.e. the PILOT, on every tick
      //
      // The port had them in one if/else chain on a single sector broadcast, so
      // the whole sector read the pilot's countdown every tick (canon tells the
      // neighbours nothing until ten remain), and at 10/5/2 the pilot lost the
      // number and saw only the room's warning.
      const sectorMessage =
        newCount === 10 ? formatMessage(MessageId.DESTRUCT_TICK_10, ship.shipname)
        : newCount === 5 ? formatMessage(MessageId.DESTRUCT_TICK_5, ship.shipname)
        : newCount === 2 ? formatMessage(MessageId.DESTRUCT_TICK_2, ship.shipname)
        : null;

      this.events.emit('ship-management.destruct-tick', {
        room,
        userid: ship.userid,
        pilotMessage: formatMessage(MessageId.DESTRUCT_TICK, newCount),
        sectorMessage,
        countdown: newCount,
        shipId: shipKey(ship.userid, ship.shipno),
      } satisfies DestructTickPayload);
    } else {
      // Same split at detonation: SELFD3 to the pilot, SELFD3A to the sector.
      // @see GEFUNCS.C:1856-1859
      this.events.emit('ship-management.destruct-boom', {
        room,
        userid: ship.userid,
        pilotMessage: formatMessage(MessageId.DESTRUCT_BOOM),
        sectorMessage: formatMessage(MessageId.DESTRUCT_BOOM_SECTOR, ship.shipname),
        shipId: shipKey(ship.userid, ship.shipno),
      } satisfies DestructBoomPayload);

      // The blast. Canon damages every ship within one sector of the wreck,
      // hardest at point blank, and credits nobody for anything it kills.
      // @see GEFUNCS.C:1860-1899
      this.applyDestructBlast(ship);

      // Emit COMBAT_SHIP_DESTROYED for score/gateway broadcast chain.
      // Self-destruct: no attacker, no loot, no score awarded.
      const destroyed: CombatShipDestroyedEvent = {
        victimId: shipKey(ship.userid, ship.shipno),
        attackerId: null,
        victimShipKey: shipKey(ship.userid, ship.shipno),
        attackerShipKey: null,
        victimUserid: ship.userid,
        attackerUserid: null,
        attackerChannel: 0,
        weapon: null,
        sector: { x: sectorX, y: sectorY },
        tickAt: new Date(),
        loot: [],
        scoreAwarded: 0,
      };
      this.events.emit(COMBAT_SHIP_DESTROYED, destroyed);

      // Remove from active registry — consistent with CombatTickService.runKillResolution.
      this.shipState.removeFromGame(ship);
    }
  }
}

export interface CloakCollapsedPayload {
  userid: string;
  shipId: string;
  message: string;
  sector: { x: number; y: number };
}

export interface DestructTickPayload {
  room: string;
  userid: string;
  /** SELFD2 — the countdown number, for the pilot alone. */
  pilotMessage: string;
  /** SELFD2A/2B/2C — null on every tick except 10, 5 and 2. */
  sectorMessage: string | null;
  countdown: number;
  shipId: string;
}

export interface DestructBoomPayload {
  room: string;
  userid: string;
  /** SELFD3 — for the pilot. */
  pilotMessage: string;
  /** SELFD3A — for the sector. */
  sectorMessage: string;
  shipId: string;
}
