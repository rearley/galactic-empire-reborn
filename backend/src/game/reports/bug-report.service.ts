import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BugReportRow, NewBugReport, REPORT_OPEN } from './bug-report.types';

/**
 * Player bug reports: filing them, reading them, closing them.
 *
 * PORT-ORIGINAL. Canon has no player-to-sysop channel — on a BBS that lived one
 * level up, in the BBS itself. @see docs/DECISIONS.md 2026-09-18
 *
 * Filing must never be able to hurt the game. A report is written
 * fire-and-forget from a synchronous command handler, and a failure is logged
 * rather than thrown: losing a bug report is bad, and throwing inside a
 * player's command because the reports table is unhappy is worse.
 */
@Injectable()
export class BugReportService {
  private readonly logger = new Logger(BugReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async file(report: NewBugReport): Promise<void> {
    try {
      await this.prisma.bugReport.create({ data: { ...report, status: REPORT_OPEN } });
    } catch (err: unknown) {
      // Logged with the text, so a report is recoverable from the log even when
      // the row is not. This is the only copy in existence at this point.
      this.logger.error(`bug report ${report.id} from ${report.userid} failed to save: ${report.text}`, err);
    }
  }

  /** Newest first. `status` filters; omitted means everything. */
  async list(status?: string, take = 200): Promise<BugReportRow[]> {
    const rows = await this.prisma.bugReport.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows as unknown as BugReportRow[];
  }

  /** Returns false when no such report — the caller answers 404 rather than 200. */
  async setStatus(id: string, status: string): Promise<boolean> {
    const { count } = await this.prisma.bugReport.updateMany({ where: { id }, data: { status } });
    return count > 0;
  }
}
