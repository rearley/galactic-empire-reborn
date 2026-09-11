import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { ConnectedShipsRegistry } from './connected-ships.registry';
import { ShipDestroyedService } from './ship-destroyed.service';
import { ConnectionLifecycleService } from './connection-lifecycle.service';
import { ShipModule } from '../game/ship/ship.module';
import { CommandsModule } from '../game/commands/commands.module';
import { CombatModule } from '../game/combat/combat.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PlayerModule } from '../game/player/player.module';
import { OnboardingModule } from '../game/onboarding/onboarding.module';
import { PhysicsModule } from '../game/physics/physics.module';
import { PublicModule } from '../public/public.module';

@Module({
  imports: [ShipModule, CommandsModule, CombatModule, AuthModule, PrismaModule, PlayerModule, OnboardingModule, PhysicsModule, PublicModule],
  providers: [ConnectedShipsRegistry, ShipDestroyedService, ConnectionLifecycleService, GameGateway],
  exports: [GameGateway, ConnectedShipsRegistry],
})
export class GatewayModule {}
