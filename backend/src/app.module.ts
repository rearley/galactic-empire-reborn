import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TickModule } from './game/tick/tick.module';
import { GatewayModule } from './gateway/gateway.module';
import { ShipModule } from './game/ship/ship.module';
import { CommandsModule } from './game/commands/commands.module';
import { GalaxyModule } from './game/galaxy/galaxy.module';
import { PlanetModule } from './game/planet/planet.module';
import { PhysicsModule } from './game/physics/physics.module';
import { CombatModule } from './game/combat/combat.module';
import { CybertronModule } from './game/cybertron/cybertron.module';
import { DroidModule } from './game/droid/droid.module';
import { MidnightModule } from './game/midnight/midnight.module';
import { InvariantsModule } from './game/invariants/invariants.module';
import { DebugController } from './debug/debug.controller';
import { debugEndpointsEnabled } from './debug/debug-endpoints';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ScheduleModule.forRoot(), PrismaModule, AuthModule, InvariantsModule, TickModule, ShipModule, GalaxyModule, PlanetModule, PhysicsModule, CombatModule, CybertronModule, DroidModule, CommandsModule, GatewayModule, MidnightModule],
  controllers: [...(debugEndpointsEnabled() ? [DebugController] : []), HealthController],
})
export class AppModule {}
