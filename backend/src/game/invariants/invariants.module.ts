import { Module } from '@nestjs/common';
import { InvariantRegistry } from './harness';

@Module({
  providers: [{ provide: InvariantRegistry, useValue: new InvariantRegistry() }],
  exports: [InvariantRegistry],
})
export class InvariantsModule {}
