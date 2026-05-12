import { forwardRef, Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TickService } from './tick.service';
import { ShipModule } from '../ship/ship.module';
import { InvariantsModule } from '../invariants/invariants.module';

@Global()
@Module({
  imports: [forwardRef(() => ShipModule), EventEmitterModule, InvariantsModule],
  providers: [TickService],
  exports: [TickService],
})
export class TickModule {}
