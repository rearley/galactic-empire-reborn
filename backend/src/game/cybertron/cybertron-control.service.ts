import { Injectable } from '@nestjs/common';

/**
 * A pause switch the Cybertron tick consults, set by `sys cybpause`.
 *
 * Canon keeps this in a global, `cybhaltflg` (GECMDS.C:4972), decremented by
 * the tick. A separate tiny service rather than a field on CybertronTickService
 * so the sysop command handler can set it without CommandsModule importing
 * CybertronModule — that import direction would close a cycle, since the
 * Cybertron tick already reaches command-side services.
 *
 * In-memory and process-local, like PresenceService: a restart clears the
 * pause, which is the safe direction for a switch that stops the AI.
 */
@Injectable()
export class CybertronControlService {
  /** Epoch ms until which Cybertron decisions are suspended. */
  private pausedUntil = 0;

  /** @returns the number of seconds actually applied. */
  pauseFor(seconds: number, now: number = Date.now()): number {
    const s = Math.max(0, Math.trunc(seconds));
    this.pausedUntil = s > 0 ? now + s * 1000 : 0;
    return s;
  }

  isPaused(now: number = Date.now()): boolean {
    return now < this.pausedUntil;
  }

  /** Seconds remaining, floored at 0. For status output. */
  remaining(now: number = Date.now()): number {
    return Math.max(0, Math.ceil((this.pausedUntil - now) / 1000));
  }
}
