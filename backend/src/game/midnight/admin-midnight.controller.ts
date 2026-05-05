/**
 * POST /admin/midnight/run — manually trigger the midnight maintenance pass.
 *
 * Returns 202 with counters on success.
 * Returns 409 if the advisory lock is held by another invocation.
 * Returns 401/503 if auth fails (handled by AdminTokenGuard).
 *
 * @see specs/009-midnight-job/contracts/admin-midnight.md
 */

import { Controller, HttpCode, HttpStatus, Post, UseGuards, ConflictException } from '@nestjs/common';
import { MidnightService, MidnightLockHeldError } from './midnight.service';
import { AdminTokenGuard } from './admin-token.guard';

interface MidnightRunResponse {
  status: 'completed';
  counters: {
    usersUpdated: number;
    planetsProcessed: number;
    mailReportsCreated: number;
    mailDeleted: number;
    teamsReconciled: number;
    teamsRemoved: number;
  };
  durationMs: number;
}

@Controller('admin/midnight')
export class AdminMidnightController {
  constructor(private readonly midnightService: MidnightService) {}

  @Post('run')
  @UseGuards(AdminTokenGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async run(): Promise<MidnightRunResponse> {
    const startMs = Date.now();
    try {
      const counters = await this.midnightService.run();
      return {
        status: 'completed',
        counters,
        durationMs: Date.now() - startMs,
      };
    } catch (err: unknown) {
      if (err instanceof MidnightLockHeldError) {
        throw new ConflictException({ code: 'MIDNIGHT_LOCK_HELD', message: err.message });
      }
      throw err;
    }
  }
}
