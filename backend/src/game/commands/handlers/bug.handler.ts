import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { BugReportService } from '../../reports/bug-report.service';
import { buildVersion, releaseVersion } from '../../../public/build-version';
import { allowReport } from './helpers/report-throttle';

/** Injectable clock, so the throttle is testable without real time. */
export interface ReportClock {
  now(): number;
}
export const REPORT_CLOCK = Symbol('REPORT_CLOCK');

/**
 * `bug <what went wrong>` — report something from inside the game.
 *
 * PORT-ORIGINAL: canon has no player-to-sysop channel at all. `cmd_sysop`
 * (GECMDS.C:4752 `if ((!syscmds) || (sysonly && !(hasmkey(SYSKEY))))`) is the
 * only sysop surface in the module, because a MajorBBS
 * player mailed the sysop one level up, through the BBS itself.
 *
 * The verb is three characters like every canon verb, and the router matches on
 * the first three — GECMDS.C:249 `struct cmd * FUNC gesearch(ptr,tab,len)` —
 * so `bug` and `buy` differ at the
 * third, so neither shadows the other.
 *
 * What makes this worth having over a link to the issue tracker is the context.
 * A player writes "it killed me"; the server knows the hull, the sector, the
 * damage and — the one nobody ever includes — which build it happened on.
 *
 * The client's own event log is deliberately NOT attached: the server cannot
 * reconstruct what the player saw, and inventing a plausible log would be worse
 * than omitting it.
 */
@Injectable()
export class BugHandlerService {
  /** Filing times per ship, inside the throttle window only. @see allowReport */
  private readonly history = new Map<string, number[]>();

  constructor(
    private readonly reports: BugReportService,
    @Optional() @Inject(REPORT_CLOCK) private readonly clock: ReportClock = { now: () => Date.now() },
  ) {}

  readonly command: Command = {
    keyword: 'bug',
    aliases: [],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult =>
      this.handle(ship, args),
  };

  private handle(ship: ShipState, args: string[]): CommandResult {
    const text = args.join(' ').trim();
    if (!text) {
      return {
        lines: [{
          text: 'Say what went wrong, Sir — for example: bug the scanner shows a planet that is not there.',
          category: 'system',
        }],
      };
    }

    const key = `${ship.userid}:${ship.shipno}`;
    const now = this.clock.now();
    const { allowed, history } = allowReport(this.history.get(key) ?? [], now);
    this.history.set(key, history);
    if (!allowed) {
      return {
        lines: [{ text: 'Your last report is still being logged, Sir. Try again in a moment.', category: 'system' }],
      };
    }

    const id = randomUUID();
    // Fire-and-forget: a handler is synchronous, and the reply must not wait on
    // Postgres. Failures are logged inside the service with the report text.
    void this.reports.file({
      id,
      userid: ship.userid,
      username: ship.username ?? null,
      text,
      shipno: ship.shipno,
      shipname: ship.shipname,
      shpclass: ship.shpclass,
      xcoord: ship.xcoord,
      ycoord: ship.ycoord,
      damage: ship.damage,
      version: releaseVersion(process.env),
      sha: buildVersion(process.env),
    });

    return {
      lines: [{
        // The short id is what a player quotes back, and what a sysop searches
        // for. Eight characters of a UUID is plenty to find one row.
        text: `Logged as ${id.slice(0, 8)}. Thank you, Commander — it goes straight to the sysop.`,
        category: 'success',
      }],
    };
  }
}
