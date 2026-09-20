import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { ConnectedShipsRegistry } from './connected-ships.registry';
import { ShipDestroyedService } from './ship-destroyed.service';
import { ConnectionLifecycleService } from './connection-lifecycle.service';
import { DisconnectTelemetryService } from './disconnect-telemetry.service';
import { ShipModule } from '../game/ship/ship.module';
import { CommandsModule } from '../game/commands/commands.module';
import { CombatModule } from '../game/combat/combat.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PlayerModule } from '../game/player/player.module';
import { OnboardingModule } from '../game/onboarding/onboarding.module';
import { PhysicsModule } from '../game/physics/physics.module';
import { PublicModule } from '../public/public.module';
import { DeployNoticeService } from './deploy-notice.service';
import { DeployNoticeController } from './deploy-notice.controller';
import { AdminTokenGuard } from '../game/midnight/admin-token.guard';

@Module({
  // PublicModule is where PresenceService comes from, and DeployNoticeService
  // must get THAT instance — a second one would count a second, empty galaxy
  // and suppress every notice.
  imports: [ShipModule, CommandsModule, CombatModule, AuthModule, PrismaModule, PlayerModule, OnboardingModule, PhysicsModule, PublicModule],
  controllers: [DeployNoticeController],
  providers: [
    ConnectedShipsRegistry,
    ShipDestroyedService,
    DisconnectTelemetryService,
    ConnectionLifecycleService,
    DeployNoticeService,
    AdminTokenGuard,
    GameGateway,
  ],
  exports: [GameGateway, ConnectedShipsRegistry],
})
export class GatewayModule {}
