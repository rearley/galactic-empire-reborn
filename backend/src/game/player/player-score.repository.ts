import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { scoreF2 } from './score.config';

/**
 * Persistence layer for player score updates on kill.
 * Awards kill points to the attacker (scaled by scoreF2) and deducts from the
 * victim (floor at 0). AI ships (isAiVictim=true) are never penalised.
 * AI attackers receive 1/10 of the normal transfer (GEFUNCS.C:1161 branch).
 *
 * @see GEFUNCS.C:killem (1143-1185)
 */
@Injectable()
export class PlayerScoreRepository {
  private readonly logger = new Logger(PlayerScoreRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Award a scoreF2-scaled transfer to attacker score/klscore and deduct the
   * same transfer from victim (floor at 0). Runs as a single Prisma transaction.
   * AI victims (isAiVictim=true) are skipped for deduction. AI attackers
   * (isAiAttacker=true) receive 1/10 of the normal transfer per the original
   * GEFUNCS.C:1161 branch ("ai can't earn that much").
   *
   * transfer (PvP)        = floor((scr / 100) * scoreF2)
   * transfer (AI attack)  = floor((scr / 100) * scoreF2 / 10)
   *
   * @see GEFUNCS.C:1157-1185
   * @see GEFUNCS.C:1161  AI 1/10 branch
   */
  async transferKillScore(
    attackerUserid: string,
    victimUserid: string,
    scr: number,
    isAiVictim: boolean,
    isAiAttacker: boolean,
  ): Promise<void> {
    const base = (scr / 100) * scoreF2;
    const rawTransfer = isAiAttacker ? base / 10 : base;
    const transfer = Math.max(0, Math.floor(rawTransfer));
    const transferBig = BigInt(transfer);

    try {
      await this.prisma.$transaction(async (tx) => {
        if (!isAiVictim) {
          const victim = await tx.user.findUnique({ where: { userid: victimUserid } });
          if (victim) {
            const newScore = victim.score > transferBig ? victim.score - transferBig : 0n;
            const newKlscore = victim.klscore > transferBig ? victim.klscore - transferBig : 0n;
            await tx.user.update({
              where: { userid: victimUserid },
              data: { score: newScore, klscore: newKlscore },
            });
          }
        }

        const attacker = await tx.user.findUnique({ where: { userid: attackerUserid } });
        if (attacker) {
          // Bump User.kills only for human attackers — AI attackers don't have
          // User rows (Cybrg-/@Droid- prefixes), and their kill counter lives
          // on Ship.kills via CybertronRepository.incrementKills.
          // @see GEFUNCS.C:1118 acctm — WARUSR.kills per-user kill counter
          const userIncrement: { score: { increment: bigint }; klscore: { increment: bigint }; kills?: { increment: number } } = {
            score: { increment: transferBig },
            klscore: { increment: transferBig },
          };
          if (!isAiAttacker) {
            userIncrement.kills = { increment: 1 };
          }
          await tx.user.update({
            where: { userid: attackerUserid },
            data: userIncrement,
          });
        }
      });
    } catch (err: unknown) {
      const stack = err instanceof Error ? err.stack : String(err);
      this.logger.error(`transferKillScore failed (${attackerUserid} → ${victimUserid}, ${scr} pts): ${stack}`);
    }
  }

  /**
   * Transfer a percentage of the loser's cash to the killer on a PvP kill.
   * transfer = floor(loser.cash * percent / 100), capped at loser.cash.
   * Safe when either user row is missing.
   *
   * @see GEFUNCS.C:killem (1087-1218 chgloser block)
   */
  async applyCashPenalty(
    attackerUserid: string,
    victimUserid: string,
    percent: number,
  ): Promise<bigint> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const loser = await tx.user.findUnique({ where: { userid: victimUserid }, select: { cash: true } });
        if (!loser || loser.cash <= 0n) return 0n;

        const transfer = loser.cash * BigInt(percent) / 100n;
        if (transfer <= 0n) return 0n;

        await tx.user.update({ where: { userid: victimUserid }, data: { cash: { decrement: transfer } } });

        const killer = await tx.user.findUnique({ where: { userid: attackerUserid }, select: { userid: true } });
        if (killer) {
          await tx.user.update({ where: { userid: attackerUserid }, data: { cash: { increment: transfer } } });
        }

        return transfer;
      });
    } catch (err: unknown) {
      const stack = err instanceof Error ? err.stack : String(err);
      this.logger.error(`applyCashPenalty failed (${attackerUserid} → ${victimUserid}, ${percent}%): ${stack}`);
      return 0n;
    }
  }
}
