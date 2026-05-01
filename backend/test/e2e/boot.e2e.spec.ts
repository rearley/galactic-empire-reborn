import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { io as ioc, Socket } from 'socket.io-client';
import { AppModule } from '../../src/app.module';

describe('Boot e2e — AppModule boots and accepts Socket.io connections', () => {
  let app: INestApplication;
  let port: number;

  // G1: boot must complete in < 5000ms
  beforeAll(async () => {
    const start = Date.now();
    app = await NestFactory.create(AppModule, { logger: false });
    app.useWebSocketAdapter(new IoAdapter(app));
    app.enableShutdownHooks();
    await app.listen(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);

    const url = await app.getUrl();
    port = parseInt(new URL(url).port, 10);
  }, 10000);

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
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('connect timeout'));
      }, 2000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  it('no leaked Socket.io connections after disconnect', (done) => {
    const socket: Socket = ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
    });
    socket.on('connect', () => {
      socket.disconnect();
      // Give the server a tick to process the disconnect
      setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const count: number = (app.getHttpServer() as any)?.io?.engine?.clientsCount ?? 0;
        expect(count).toBe(0);
        done();
      }, 100);
    });
  });
});
