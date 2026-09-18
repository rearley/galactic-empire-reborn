import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BugReportService } from './bug-report.service';
import { UserRepository } from '../player/user.repository';
import { BugReportRow, REPORT_CLOSED, REPORT_OPEN } from './bug-report.types';
import { isSysopUsername } from '../../auth/sysop';

/** The JWT payload the strategy hands back. @see auth/jwt.strategy.ts */
interface AuthedRequest {
  user: { sub: string; username: string | null };
}

const STATUSES: readonly string[] = [REPORT_OPEN, REPORT_CLOSED];

/**
 * Player bug reports, for the sysop.
 *
 * Authenticated as an ordinary player — the sysop signs into the game like
 * anybody else — and then gated on the SAME allowlist that gates the `sys`
 * command. That is the only thing standing between a curious captain and every
 * report every player has filed, so it fails closed: no allowlist, no access,
 * including for the person who deployed the server.
 *
 * No admin login of its own, deliberately. A second authenticated surface on a
 * public game is the cost this avoids, and the account already exists.
 */
/*
 * Mounted under `/admin/`, not `/reports`, for two reasons that both bite at
 * deploy time. The PAGE lives at `/reports` in the SPA, so an API on the same
 * path is two meanings for one URL separated only by an Accept header. And
 * nginx proxies exactly four prefixes to the backend — `/auth/`, `/admin/`,
 * `/public/`, `/socket.io/` — with everything else falling through to
 * `index.html`, so a top-level `/reports` route would have been answered by the
 * SPA in production and never reach this controller at all. Found by opening
 * the page rather than by a test: the dev proxy has the same four.
 * @see frontend/nginx.conf, frontend/vite.config.ts
 */
@Controller('admin/reports')
@UseGuards(AuthGuard('jwt'))
export class ReportsController {
  constructor(
    private readonly reports: BugReportService,
    private readonly users: UserRepository,
    /**
     * The environment to read the allowlist from. Injectable so a test can vary
     * it without mutating `process.env`, which leaks across a shared worker.
     */
    @Optional() @Inject('REPORTS_ENV')
    private readonly env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  ) {}

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('status') status?: string,
  ): Promise<{ reports: BugReportRow[] }> {
    await this.assertSysop(req);
    if (status !== undefined && !STATUSES.includes(status)) {
      throw new BadRequestException('unknown status');
    }
    return { reports: await this.reports.list(status) };
  }

  @Patch(':id')
  async setStatus(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { status: string },
  ): Promise<{ id: string; status: string }> {
    await this.assertSysop(req);
    if (!STATUSES.includes(body?.status)) throw new BadRequestException('unknown status');

    const found = await this.reports.setStatus(id, body.status);
    if (!found) throw new NotFoundException('no such report');
    return { id, status: body.status };
  }

  /**
   * Forbidden, never "not found": the route's existence is not a secret, and
   * pretending otherwise would only confuse the sysop the day their allowlist
   * entry is wrong.
   */
  private async assertSysop(req: AuthedRequest): Promise<void> {
    // The DATABASE, not the token. `username` is a 30-day-old claim that is
    // `null` for an account which had not finished registration when the token
    // was minted, so trusting it can silently demote the sysop until they log
    // in again. One query on a sysop-only route is nothing.
    const username = await this.users.findUsername(req.user?.sub ?? '');
    if (!isSysopUsername(username, this.env)) {
      throw new ForbiddenException('sysop only');
    }
  }
}
