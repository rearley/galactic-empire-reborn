import { Injectable } from '@nestjs/common';
import type { Ship } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The two whole-row hull reads that still lived directly in `GameGateway`,
 * left behind by Phase 2's Prisma sweep because they sit in onboarding /
 * ship-select handling, a region that phase's task breakdown never assigned.
 *
 * Both issue `ship.findFirst` with no `select`: `prismaShipToState` reads
 * every column, so a narrowed select would silently drop fields the caller
 * needs.
 */
@Injectable()
export class ShipRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The first hull row found for a captain, whole-row.
   *
   * Used only on the onboarding race path: two `finalize` calls collided on
   * the account's unique ship-per-user constraint, the other one won, and
   * this re-read finds the hull it created so the loser can be boarded onto
   * it instead of erroring.
   * @see game.gateway.ts handlePromptReply — the P2002-on-userid branch
   */
  async findFirstForUser(userid: string): Promise<Ship | null> {
    return this.prisma.ship.findFirst({ where: { userid } });
  }

  /**
   * One specific hull by owner and ship number, whole-row.
   *
   * Re-read at ship-select time to confirm the hull chosen from the pending
   * fleet list still exists — it could have been destroyed while the prompt
   * was open.
   * @see game.gateway.ts handleShipSelectReply
   */
  async findHull(userid: string, shipno: number): Promise<Ship | null> {
    return this.prisma.ship.findFirst({ where: { userid, shipno } });
  }
}
