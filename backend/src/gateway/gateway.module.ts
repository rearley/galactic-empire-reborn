import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { ShipModule } from '../game/ship/ship.module';
import { CommandsModule } from '../game/commands/commands.module';

@Module({
  imports: [ShipModule, CommandsModule],
  providers: [GameGateway],
  exports: [GameGateway],
})
export class GatewayModule {}
