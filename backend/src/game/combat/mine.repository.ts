import { Injectable } from '@nestjs/common';
import { Mine } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateMineInput {
  channel: number;
  timer: number;
  xcoord: number;
  ycoord: number;
  deployedBy: string;
}

/**
 * Persistence boundary for mines. Mines must survive a server restart so the
 * combat tick can re-hydrate the in-memory MineRegistry on boot.
 *
 * @see GECMDS.C:cmd_mine — mine deployment
 * @see GEFUNCS.C:minesweep — mine evaluation
 */
@Injectable()
export class MineRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllActive(): Promise<Mine[]> {
    return this.prisma.mine.findMany();
  }

  create(input: CreateMineInput): Promise<Mine> {
    return this.prisma.mine.create({ data: input });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.mine.delete({ where: { id } });
  }
}
