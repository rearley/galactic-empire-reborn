import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UserRepository } from './user.repository';

/**
 * The persistence boundary for the `User` row (canon's `WARUSR`).
 *
 * Separate from `PlayerScoreModule`, which owns scoring behaviour rather than
 * the row itself: anything that needs to read or write a captain's cash, team,
 * planet count or options imports this and injects `UserRepository`.
 */
@Module({
  imports: [PrismaModule],
  providers: [UserRepository],
  exports: [UserRepository],
})
export class PlayerModule {}
