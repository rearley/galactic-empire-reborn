import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { ConnectedShipsRegistry } from './connected-ships.registry';
import { ShipModule } from '../game/ship/ship.module';
import { CommandsModule } from '../game/commands/commands.module';
import { CombatModule } from '../game/combat/combat.module';

@Module({
  imports: [ShipModule, CommandsModule, CombatModule],
  providers: [ConnectedShipsRegistry, GameGateway],
  exports: [GameGateway],
})
export class GatewayModule {}
