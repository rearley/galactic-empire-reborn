import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipStateService } from '../ship/ship-state.service';
import { TickService } from '../tick/tick.service';
import { TickKind } from '../tick/tick.types';
import { ShipState, shipKey } from '../ship/ship-state.types';
import { CLOAK_ENERGY_USE } from './cloak.config';
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
@Injectable()
export class ShipManagementTickService implements OnModuleInit {
  private readonly logger = new Logger(ShipManagementTickService.name);

  constructor(
    private readonly shipState: ShipStateService,
    private readonly tickService: TickService,
    private readonly events: EventEmitter2,
    @Inject(CLOAK_ENERGY_USE) private readonly cloakEnergyUse: number,
  ) {}

  onModuleInit(): void {
    this.tickService.subscribe(TickKind.PHYSICS, () => this.onPhysicsTick());
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
        this.destructTick(ship);
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
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.cloak += 1;
      });
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
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.energy -= this.cloakEnergyUse;
      if (s.cloak === CLOAK_RAMP_INIT) {
        s.cloak = CLOAK_RAMP_MID;
      } else if (s.cloak === CLOAK_RAMP_MID) {
        s.cloak = CLOAK_RAMP_FULL;
      }
      // CLOAK_RAMP_FULL (10): no further transition.
    });
  }

  /**
   * Per-physics-tick destruct countdown — decrements, broadcasts sector warnings,
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
      // Broadcast tick warning — SELFD2A at 10, SELFD2B at 5, SELFD2C at 2, SELFD2 otherwise.
      let message: string;
      if (newCount === 10) {
        message = formatMessage(MessageId.DESTRUCT_TICK_10, ship.shipname);
      } else if (newCount === 5) {
        message = formatMessage(MessageId.DESTRUCT_TICK_5, ship.shipname);
      } else if (newCount === 2) {
        message = formatMessage(MessageId.DESTRUCT_TICK_2, ship.shipname);
      } else {
        message = formatMessage(MessageId.DESTRUCT_TICK, ship.shipname, newCount);
      }
      this.events.emit('ship-management.destruct-tick', {
        room,
        message,
        countdown: newCount,
        shipId: shipKey(ship.userid, ship.shipno),
      } satisfies DestructTickPayload);
    } else {
      // Countdown expired: destroy the ship.
      const boomMessage = formatMessage(MessageId.DESTRUCT_BOOM, ship.shipname);
      this.events.emit('ship-management.destruct-boom', {
        room,
        message: boomMessage,
        shipId: shipKey(ship.userid, ship.shipno),
      } satisfies DestructBoomPayload);

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
  message: string;
  countdown: number;
  shipId: string;
}

export interface DestructBoomPayload {
  room: string;
  message: string;
  shipId: string;
}
