import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Persistence layer for player score updates on kill.
 * Awards kill points to the attacker and deducts from the victim (floor at 0).
 * AI ships (isAiVictim=true) are never penalised.
 *
 * @see GEFUNCS.C:killem (1143-1185)
 */
@Injectable()
export class PlayerScoreRepository {
  private readonly logger = new Logger(PlayerScoreRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Award `scr` to attacker score/klscore and deduct from victim (floor at 0).
   * Runs as a single Prisma transaction. AI victims (isAiVictim=true) are skipped
   * for deduction — Cybertrons and Droids have no meaningful score balance.
   *
   * @see GEFUNCS.C:killem (1164-1185)
   */
  async transferKillScore(
    attackerUserid: string,
    victimUserid: string,
    scr: number,
    isAiVictim: boolean,
  ): Promise<void> {
    const scrBig = BigInt(scr);
    try {
      await this.prisma.$transaction(async (tx) => {
        if (!isAiVictim) {
          const victim = await tx.user.findUnique({ where: { userid: victimUserid } });
          if (victim) {
            const newScore = victim.score > scrBig ? victim.score - scrBig : 0n;
            const newKlscore = victim.klscore > scrBig ? victim.klscore - scrBig : 0n;
            await tx.user.update({
              where: { userid: victimUserid },
              data: { score: newScore, klscore: newKlscore },
            });
          }
        }

        const attacker = await tx.user.findUnique({ where: { userid: attackerUserid } });
        if (attacker) {
          await tx.user.update({
            where: { userid: attackerUserid },
            data: { score: { increment: scrBig }, klscore: { increment: scrBig } },
          });
        }
      });
    } catch (err: unknown) {
      const stack = err instanceof Error ? err.stack : String(err);
      this.logger.error(`transferKillScore failed (${attackerUserid} → ${victimUserid}, ${scr} pts): ${stack}`);
    }
  }
}
