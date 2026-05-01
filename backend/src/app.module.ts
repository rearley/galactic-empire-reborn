import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { TickModule } from './game/tick/tick.module';
import { GatewayModule } from './gateway/gateway.module';
import { ShipModule } from './game/ship/ship.module';
import { CommandsModule } from './game/commands/commands.module';
import { DebugController } from './debug/debug.controller';

@Module({
  imports: [PrismaModule, TickModule, ShipModule, CommandsModule, GatewayModule],
  controllers: [DebugController],
})
export class AppModule {}
