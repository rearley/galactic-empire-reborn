import { Module } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlayerScoreService } from './player-score.service';
import { PlayerScoreRepository } from './player-score.repository';
import { ShipLossMailService } from './ship-loss-mail.service';
import { loadMidnightConfig } from '../midnight/midnight.config';

/**
 * Injection token for the resolved CHGLOSER percentage.
 * Resolved once at module init via the factory provider below.
 *
 * @see GEFUNCS.C:killem (1087-1218 chgloser block)
 * @see specs/009-midnight-job/tasks.md T034
 */
export const CHGLOSER_PERCENT = 'CHGLOSER_PERCENT' as const;

@Module({
  imports: [PrismaModule, EventEmitterModule],
  providers: [
    PlayerScoreRepository,
    {
      provide: CHGLOSER_PERCENT,
      useFactory: () => loadMidnightConfig().chgLoserPercent,
    },
    {
      provide: PlayerScoreService,
      useFactory: (events: EventEmitter2, repo: PlayerScoreRepository, pct: number) =>
        new PlayerScoreService(events, repo, pct),
      inject: [EventEmitter2, PlayerScoreRepository, CHGLOSER_PERCENT],
    },
    ShipLossMailService,
  ],
  exports: [PlayerScoreService, ShipLossMailService],
})
export class PlayerScoreModule {}
