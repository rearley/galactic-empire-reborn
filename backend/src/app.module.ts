import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { TickModule } from './game/tick/tick.module';
import { GatewayModule } from './gateway/gateway.module';
import { ShipModule } from './game/ship/ship.module';
import { CommandsModule } from './game/commands/commands.module';
import { GalaxyModule } from './game/galaxy/galaxy.module';
import { PlanetModule } from './game/planet/planet.module';
import { PhysicsModule } from './game/physics/physics.module';
import { CombatModule } from './game/combat/combat.module';
import { CybertronModule } from './game/cybertron/cybertron.module';
import { DebugController } from './debug/debug.controller';

@Module({
  imports: [PrismaModule, TickModule, ShipModule, GalaxyModule, PlanetModule, PhysicsModule, CombatModule, CybertronModule, CommandsModule, GatewayModule],
  controllers: [DebugController],
})
export class AppModule {}
