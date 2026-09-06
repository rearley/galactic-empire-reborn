import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipStateService } from '../ship/ship-state.service';
import { TickService } from './tick.service';
import { TickKind } from './tick.types';
import type { Sector } from '../../gateway/connected-ships.registry';
import { shipKey } from '../ship/ship-state.types';

export const PHYSICS_SECTOR_TRANSITION_EVENT = 'physics.sector-transition';

export interface SectorTransition {
  shipId: string;
  fromSector: Sector;
  toSector: Sector;
}

export interface PhysicsSectorTransitionPayload {
  transitions: SectorTransition[];
}

/**
 * Subscribes to the existing physics tick and emits a batched
 * `physics.sector-transition` event whenever any ship crosses an integer-cell
 * boundary. Newly-spawned and despawned ships are excluded (FR-026).
 *
 * @see specs/010-react-frontend/data-model.md §C.2
 * @see research.md R5 placement in physics tick
 * @see GEMAIN.H TICKTIME=6 (physics tick cadence)
 */
@Injectable()
export class SectorTransitionSubscriber implements OnModuleInit {
  private prevSnapshot = new Map<string, Sector>(); // shipId → last-tick integer cell

  constructor(
    private readonly shipStateService: ShipStateService,
    private readonly events: EventEmitter2,
    private readonly tickService?: TickService,
  ) {}

  onModuleInit(): void {
    if (this.tickService) {
      // Sampled at the MOVEMENT cadence, not the 6-second one. Canon prints
      // MOVE1 from inside `moveship` at the instant of the crossing
      // (GEFUNCS.C:711-713), and moveship runs every 3 seconds (warrti2a,
      // GEMAIN.C:2472). This subscriber derives crossings by diffing integer
      // cells between ticks, so its sampling rate is its fidelity: on the
      // 6-second tick a hull crossing two cells in six seconds reported one
      // A->C transition and the intermediate crossing was lost.
      this.tickService.subscribe(TickKind.SHIP_UPDATE, () => this.onPhysicsTick());
    }
  }

  /** Called on each physics tick — exposed for direct unit testing. */
  onPhysicsTick(): void {
    const ships = this.shipStateService.findAllShips();
    const currentSnapshot = new Map<string, Sector>();
    const transitions: SectorTransition[] = [];

    for (const ship of ships) {
      const id = shipKey(ship.userid, ship.shipno);
      const current: Sector = { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) };
      currentSnapshot.set(id, current);

      const prev = this.prevSnapshot.get(id);
      if (prev === undefined) continue; // newly spawned — no transition

      if (prev.x !== current.x || prev.y !== current.y) {
        transitions.push({ shipId: id, fromSector: prev, toSector: current });
      }
    }

    this.prevSnapshot = currentSnapshot;

    if (transitions.length > 0) {
      this.events.emit(PHYSICS_SECTOR_TRANSITION_EVENT, { transitions } satisfies PhysicsSectorTransitionPayload);
    }
  }
}
