import { Global, Module } from '@nestjs/common';
import { TickService } from './tick.service';

@Global()
@Module({
  providers: [TickService],
  exports: [TickService],
})
export class TickModule {}
