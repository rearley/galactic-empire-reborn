import { forwardRef, Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TickService } from './tick.service';
import { ShipModule } from '../ship/ship.module';

@Global()
@Module({
  imports: [forwardRef(() => ShipModule), EventEmitterModule],
  providers: [TickService],
  exports: [TickService],
})
export class TickModule {}
