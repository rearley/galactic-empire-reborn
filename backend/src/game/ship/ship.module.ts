import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ShipTickService } from './ship-tick.service';
import { MaintenanceService } from './maintenance.service';
import { ShipStateModule } from './ship-state.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlayerModule } from '../player/player.module';
import { PlanetModule } from '../planet/planet.module';
import { ShipDebugController } from './ship.debug.controller';
import { debugEndpointsEnabled } from '../../debug/debug-endpoints';

// Unauthenticated cheat endpoints — mounted only when explicitly enabled, and
// never in production. @see src/debug/debug-endpoints.ts
const devOnlyControllers = debugEndpointsEnabled() ? [ShipDebugController] : [];

/**
 * ShipModule owns the 1-second ship-update tick and maintenance, and
 * re-exports the leaf `ShipStateModule` so importers still get
 * `ShipStateService`, `ShipChannelRegistry` and `ShipRepository` from here.
 *
 * `PlanetModule` is a plain import: its own dependency on ship state goes
 * through `ShipStateModule` and the `SHIP_STATE_PORT` seam, so there is no
 * longer a cycle for `forwardRef` to defer.
 */
@Module({
  imports: [
    PrismaModule, PlayerModule,
    EventEmitterModule,
    ShipStateModule,
    PlanetModule,
  ],
  controllers: [...devOnlyControllers],
  providers: [MaintenanceService, ShipTickService],
  exports: [ShipStateModule, MaintenanceService, ShipTickService],
})
export class ShipModule {}
