import { Module } from '@nestjs/common';
import { GalaxyService } from './galaxy.service';
import { WormholeRepository } from './wormhole.repository';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [GalaxyService, WormholeRepository],
  exports: [GalaxyService, WormholeRepository],
})
export class GalaxyModule {}
