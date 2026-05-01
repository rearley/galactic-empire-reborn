import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { TickModule } from './game/tick/tick.module';
import { GatewayModule } from './gateway/gateway.module';
import { DebugController } from './debug/debug.controller';

@Module({
  imports: [PrismaModule, TickModule, GatewayModule],
  controllers: [DebugController],
})
export class AppModule {}
