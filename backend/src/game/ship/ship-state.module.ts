import { Module } from '@nestjs/common';
import { ShipStateService } from './ship-state.service';
import { ShipChannelRegistry } from './ship-channel.registry';
import { ShipRepository } from './ship.repository';
import { SHIP_STATE_PORT } from './ship-state.port';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlayerModule } from '../player/player.module';

/**
 * The leaf half of ShipModule: in-memory ship state and its persistence, with
 * no dependency on the planet or command subsystems.
 *
 * It exists so `PlanetModule` can reach `ShipStateService` — through the
 * narrow `SHIP_STATE_PORT` — without importing the whole of `ShipModule`,
 * which needs `PlanetModule` back. That mutual need was carried by
 * `forwardRef` on both sides; splitting the leaf out removes the cycle
 * instead of deferring it.
 *
 * `ShipModule` imports and re-exports this, so every existing
 * `imports: [ShipModule]` keeps resolving `ShipStateService` unchanged.
 */
@Module({
  imports: [PrismaModule, PlayerModule],
  providers: [
    ShipChannelRegistry,
    ShipStateService,
    ShipRepository,
    { provide: SHIP_STATE_PORT, useExisting: ShipStateService },
  ],
  exports: [ShipChannelRegistry, ShipStateService, ShipRepository, SHIP_STATE_PORT],
})
export class ShipStateModule {}
