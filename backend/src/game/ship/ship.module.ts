import { forwardRef, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ShipStateService } from './ship-state.service';
import { ShipChannelRegistry } from './ship-channel.registry';
import { ShipTickService } from './ship-tick.service';
import { MaintenanceService } from './maintenance.service';
import { ShipRepository } from './ship.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlayerModule } from '../player/player.module';
import { PlanetModule } from '../planet/planet.module';
import { ShipDebugController } from './ship.debug.controller';
import { debugEndpointsEnabled } from '../../debug/debug-endpoints';

// Unauthenticated cheat endpoints — mounted only when explicitly enabled, and
// never in production. @see src/debug/debug-endpoints.ts
const devOnlyControllers = debugEndpointsEnabled() ? [ShipDebugController] : [];

/**
 * ShipModule owns in-memory ship state and the 1-second ship-update tick.
 * PlanetModule is imported via forwardRef to break the mutual dependency
 * (PlanetModule imports ShipModule for ShipStateService).
 */
@Module({
  imports: [
    PrismaModule, PlayerModule,
    EventEmitterModule,
    forwardRef(() => PlanetModule),
  ],
  controllers: [...devOnlyControllers],
  providers: [ShipChannelRegistry, ShipStateService, MaintenanceService, ShipTickService, ShipRepository],
  exports: [ShipChannelRegistry, ShipStateService, MaintenanceService, ShipTickService, ShipRepository],
})
export class ShipModule {}
