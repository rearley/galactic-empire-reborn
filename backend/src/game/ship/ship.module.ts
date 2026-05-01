import { Module } from '@nestjs/common';
import { ShipStateService } from './ship-state.service';

@Module({
  providers: [ShipStateService],
  exports: [ShipStateService],
})
export class ShipModule {}
