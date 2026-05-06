import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { ConnectedShipsRegistry } from './connected-ships.registry';
import { ShipModule } from '../game/ship/ship.module';
import { CommandsModule } from '../game/commands/commands.module';
import { CombatModule } from '../game/combat/combat.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OnboardingModule } from '../game/onboarding/onboarding.module';

@Module({
  imports: [ShipModule, CommandsModule, CombatModule, AuthModule, PrismaModule, OnboardingModule],
  providers: [ConnectedShipsRegistry, GameGateway],
  exports: [GameGateway, ConnectedShipsRegistry],
})
export class GatewayModule {}
