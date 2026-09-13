import { Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import { MailStat } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Prisma-backed repository for MailStat inbox queries.
 * @see GEMAIN.H:531 MAILSTAT
 */
@Injectable()
export class MailInboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns all MailStat rows for the given userid, ordered newest-first.
   * Sort: stamp DESC, msgno DESC, class DESC per R4.
   */
  async findByUserid(userid: string): Promise<MailStat[]> {
    return this.prisma.mailStat.findMany({
      where: { userid },
      orderBy: [{ stamp: 'desc' }, { msgno: 'desc' }, { class: 'desc' }],
    });
  }

  /**
   * Hard-deletes a single MailStat row by composite key (userid, class, msgno).
   * Returns false if the row was already gone (Prisma P2025 — race with purge).
   */
  async deleteOne(userid: string, klass: number, msgno: bigint): Promise<boolean> {
    try {
      await this.prisma.mailStat.delete({
        where: { userid_class_msgno: { userid, class: klass, msgno } },
      });
      return true;
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return false;
      }
      throw e;
    }
  }
}
