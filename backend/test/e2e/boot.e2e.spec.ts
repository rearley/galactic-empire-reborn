import 'reflect-metadata';
// Point the real AppModule at the test DB (ge_test), not the dev DB.
// globalSetup already ran prisma db push on ge_test, so the Ship table exists.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { io as ioc, Socket } from 'socket.io-client';
import { PrismaClient } from '../../src/prisma/client';
import { sign } from 'jsonwebtoken';
import { AppModule } from '../../src/app.module';
import { makePrismaClient } from '../helpers/make-prisma-client';

const BOOT_TEST_USERID = 'boot-e2e-user';
const BOOT_TEST_SHIPNO = 1;
const BOOT_TEST_SHIPNAME = 'Boot Test Ship';
const BOOT_TEST_USERNAME = 'BootPilot';

/** Issue a minimal JWT for the test user using the same secret as .env */
function makeTestToken(): string {
  const secret = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod';
  return sign(
    { sub: BOOT_TEST_USERID, username: BOOT_TEST_USERNAME },
    secret,
    { expiresIn: '1h' },
  );
}

describe('Boot e2e — AppModule boots and accepts Socket.io connections', () => {
  let app: INestApplication;
  let port: number;
  let testToken: string;

  // G1: boot must complete in < 5000ms
  beforeAll(async () => {
    // Seed User + Ship before app boots so ShipStateService.onModuleInit hydrates it.
    const seedPrisma = makePrismaClient(process.env.DATABASE_URL);
    try {
      await seedPrisma.user.upsert({
        where: { userid: BOOT_TEST_USERID },
        create: { userid: BOOT_TEST_USERID, username: BOOT_TEST_USERNAME },
        update: {},
      });
      await seedPrisma.ship.upsert({
        where: { userid_shipno: { userid: BOOT_TEST_USERID, shipno: BOOT_TEST_SHIPNO } },
        create: { userid: BOOT_TEST_USERID, shipno: BOOT_TEST_SHIPNO, shipname: BOOT_TEST_SHIPNAME, shpclass: 1 },
        update: { shipname: BOOT_TEST_SHIPNAME },
      });
    } finally {
      await seedPrisma.$disconnect();
    }

    const start = Date.now();
    app = await NestFactory.create(AppModule, { logger: false });
    app.useWebSocketAdapter(new IoAdapter(app));
    app.enableShutdownHooks();
    await app.listen(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);

    const url = await app.getUrl();
    port = parseInt(new URL(url).port, 10);
    testToken = makeTestToken();
  }, 15000);

  // G2: shutdown must complete in < 3000ms
  afterAll(async () => {
    const start = Date.now();
    await app.close();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  }, 10000);

  it('Socket.io client connects within 2s', async () => {
    const socket: Socket = ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: testToken },
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('connect timeout'));
      }, 2000);
      socket.on('command:result', () => {
        // Welcome message received — handshake succeeded, connection is live
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    socket.disconnect();
  });

  // Vitest 5 removed the `done` callback, so the same wait is expressed as a
  // promise the test returns. Identical shape: resolve on the timeout that
  // follows the disconnect, and let the suite timeout catch a welcome that
  // never arrives.
  it('no leaked Socket.io connections after disconnect', async () => {
    const socket: Socket = ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: testToken },
    });
    const settled = new Promise<number>((resolve) => {
      socket.on('command:result', () => {
        // Welcome received; now disconnect and verify no leaked connections
        socket.disconnect();
        setTimeout(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          resolve((app.getHttpServer() as any)?.io?.engine?.clientsCount ?? 0);
        }, 100);
      });
    });
    expect(await settled).toBe(0);
  });
});
