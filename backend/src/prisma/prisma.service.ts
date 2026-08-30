import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from './database-url';

/**
 * Owns the Prisma lifecycle — connects on module init, disconnects on destroy.
 * If $connect() throws, the bootstrap error propagates and the process exits non-zero (FR-013).
 * @see https://docs.nestjs.com/recipes/prisma
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Binds test runs to TEST_DATABASE_URL so specs that truncate tables can
    // never reach the development database. @see ./database-url.ts
    super({ datasources: { db: { url: resolveDatabaseUrl() } } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    console.log('[Nest] LOG [PrismaService]   Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    console.log('[Nest] LOG [PrismaService]   Disconnected from PostgreSQL');
  }
}
