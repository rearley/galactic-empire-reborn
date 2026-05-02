import { Module } from '@nestjs/common';
import { GalaxyService } from './galaxy.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [GalaxyService],
  exports: [GalaxyService],
})
export class GalaxyModule {}
