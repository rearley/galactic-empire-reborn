import { forwardRef, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ShipStateService } from './ship-state.service';
import { ShipTickService } from './ship-tick.service';
import { MaintenanceService } from './maintenance.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlanetModule } from '../planet/planet.module';
import { ShipDebugController } from './ship.debug.controller';

// Same gating as the droid/cybertron debug controllers — never in production.
const devOnlyControllers = process.env.NODE_ENV !== 'production' ? [ShipDebugController] : [];

/**
 * ShipModule owns in-memory ship state and the 1-second ship-update tick.
 * PlanetModule is imported via forwardRef to break the mutual dependency
 * (PlanetModule imports ShipModule for ShipStateService).
 */
@Module({
  imports: [
    PrismaModule,
    EventEmitterModule,
    forwardRef(() => PlanetModule),
  ],
  controllers: [...devOnlyControllers],
  providers: [ShipStateService, MaintenanceService, ShipTickService],
  exports: [ShipStateService, MaintenanceService, ShipTickService],
})
export class ShipModule {}
