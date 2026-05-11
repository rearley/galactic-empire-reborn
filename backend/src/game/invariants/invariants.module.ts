import { Module } from '@nestjs/common';
import { InvariantRegistry } from './harness';

@Module({
  providers: [InvariantRegistry],
  exports: [InvariantRegistry],
})
export class InvariantsModule {}
