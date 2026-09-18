import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BugReportService } from './bug-report.service';
import { ReportsController } from './reports.controller';
import { PlayerModule } from '../player/player.module';

/**
 * Player bug reports — the `bug` command writes, the sysop reads.
 *
 * PORT-ORIGINAL; canon has no player-to-sysop channel. Its own module rather
 * than a corner of CommandsModule because the HTTP surface and the command are
 * two consumers of one service, and neither belongs inside the other.
 */
@Module({
  imports: [PrismaModule, PlayerModule],
  controllers: [ReportsController],
  providers: [BugReportService],
  exports: [BugReportService],
})
export class ReportsModule {}
