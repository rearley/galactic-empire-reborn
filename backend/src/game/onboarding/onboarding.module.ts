import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OnboardingService } from './onboarding.service';
import { RenameService } from './rename.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ShipModule } from '../ship/ship.module';

@Module({
  imports: [ConfigModule, PrismaModule, ShipModule],
  providers: [OnboardingService, RenameService],
  exports: [OnboardingService, RenameService],
})
export class OnboardingModule {}
