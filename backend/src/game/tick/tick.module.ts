import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TickService } from './tick.service';
import { InvariantsModule } from '../invariants/invariants.module';

@Global()
@Module({
  imports: [EventEmitterModule, InvariantsModule],
  providers: [TickService],
  exports: [TickService],
})
export class TickModule {}
