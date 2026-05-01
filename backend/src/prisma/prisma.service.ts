import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Owns the Prisma lifecycle — connects on module init, disconnects on destroy.
 * If $connect() throws, the bootstrap error propagates and the process exits non-zero (FR-013).
 * @see https://docs.nestjs.com/recipes/prisma
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
    console.log('[Nest] LOG [PrismaService]   Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    console.log('[Nest] LOG [PrismaService]   Disconnected from PostgreSQL');
  }
}
