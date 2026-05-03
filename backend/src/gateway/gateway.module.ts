import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { ShipModule } from '../game/ship/ship.module';
import { CommandsModule } from '../game/commands/commands.module';
import { CombatModule } from '../game/combat/combat.module';

@Module({
  imports: [ShipModule, CommandsModule, CombatModule],
  providers: [GameGateway],
  exports: [GameGateway],
})
export class GatewayModule {}
