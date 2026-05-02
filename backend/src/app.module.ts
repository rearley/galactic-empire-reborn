import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { TickModule } from './game/tick/tick.module';
import { GatewayModule } from './gateway/gateway.module';
import { ShipModule } from './game/ship/ship.module';
import { CommandsModule } from './game/commands/commands.module';
import { GalaxyModule } from './game/galaxy/galaxy.module';
import { PlanetModule } from './game/planet/planet.module';
import { DebugController } from './debug/debug.controller';

@Module({
  imports: [PrismaModule, TickModule, ShipModule, GalaxyModule, PlanetModule, CommandsModule, GatewayModule],
  controllers: [DebugController],
})
export class AppModule {}
