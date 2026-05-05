import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TickService } from './tick.service';
import { SectorTransitionSubscriber } from './sector-transition.subscriber';
import { ShipModule } from '../ship/ship.module';

@Global()
@Module({
  imports: [ShipModule, EventEmitterModule],
  providers: [TickService, SectorTransitionSubscriber],
  exports: [TickService, SectorTransitionSubscriber],
})
export class TickModule {}
