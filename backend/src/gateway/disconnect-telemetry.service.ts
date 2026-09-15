import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** What a dropped connection looked like at the moment it dropped. */
export interface DisconnectFacts {
  userid: string;
  shipno: number;
  username: string | null;
  /** Socket.io's own reason string, or null when the socket never reported one. */
  reason: string | null;
  /** Battle lock at the drop. > 0 is what makes a disconnect cost the hull. */
  cantexit: number;
  /** Whether the anti-rage-quit kill actually fired. */
  killed: boolean;
  xcoord: number;
  ycoord: number;
  speed: number;
}

/** Just enough of a logger to report a telemetry failure without importing the gateway. */
export interface TelemetrySink {
  error(message: string): void;
}

/**
 * Optional override for where failures are reported. Nothing provides it in the
 * app — `TelemetrySink` is an interface, so Nest cannot inject it by type, and
 * an unprovided optional token simply arrives undefined and falls back to a
 * Logger. Tests pass their own to assert the message.
 */
export const DISCONNECT_TELEMETRY_SINK = Symbol('DISCONNECT_TELEMETRY_SINK');

/**
 * Records every dropped connection, and how long the player stayed gone.
 *
 * **Diagnostic only.** Nothing reads this table at runtime and no gameplay
 * decision depends on it. It exists because the disconnect fix needs two
 * constants — how fast to park a ship, and how long to wait before applying
 * the `warhupa` rage-quit kill — and both are currently
 * guesses. A week of `returnedAfterMs` turns them into percentiles.
 *
 * Every method swallows its own failures. This code runs inside
 * `handleDisconnect`, alongside the hull flush and the kill path; telemetry
 * that can throw would turn a logging outage into lost ships.
 *
 * @see GEMAIN.C:1418 `if (warsptr->cantexit > 0)` / `killem(warsptr,usrnum);`
 *      — canon kills on ANY hangup while combat-locked, with no grace period,
 *      because a carrier drop was known at once. Ours is a ~45s guess.
 *
 * @see DisconnectEvent in schema.prisma
 */
@Injectable()
export class DisconnectTelemetryService {
  private readonly sink: TelemetrySink;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(DISCONNECT_TELEMETRY_SINK) sink?: TelemetrySink,
  ) {
    this.sink = sink ?? new Logger(DisconnectTelemetryService.name);
  }

  /** One row per drop. Never throws. */
  async recordDisconnect(facts: DisconnectFacts, at: Date = new Date()): Promise<void> {
    try {
      await this.prisma.disconnectEvent.create({ data: { ...facts, disconnectedAt: at } });
    } catch (err) {
      this.sink.error(`disconnect telemetry: could not record drop for ${facts.userid}: ${String(err)}`);
    }
  }

  /**
   * Closes this player's open row, if they have one.
   *
   * Matches on `returnedAt: null` rather than on recency alone, so a player who
   * connects twice without dropping in between does not overwrite a gap that was
   * already measured. A long-abandoned row closing days later is recorded
   * truthfully rather than discarded — a 3-day gap is real data about a player
   * who left, not a bug.
   */
  async recordReturn(userid: string, at: Date = new Date()): Promise<void> {
    try {
      const open = await this.prisma.disconnectEvent.findFirst({
        where: { userid, returnedAt: null },
        orderBy: { disconnectedAt: 'desc' },
        select: { id: true, disconnectedAt: true },
      });
      if (!open) return;

      // Clamped: clock skew between the two writes would otherwise store a
      // negative duration and poison every percentile drawn from this column.
      const elapsed = Math.max(0, at.getTime() - open.disconnectedAt.getTime());
      await this.prisma.disconnectEvent.update({
        where: { id: open.id },
        data: { returnedAt: at, returnedAfterMs: elapsed },
      });
    } catch (err) {
      this.sink.error(`disconnect telemetry: could not close gap for ${userid}: ${String(err)}`);
    }
  }
}
