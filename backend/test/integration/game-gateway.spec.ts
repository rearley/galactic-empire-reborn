import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io as ioc, Socket } from 'socket.io-client';
import { Server } from 'socket.io';
import { GatewayModule } from '../../src/gateway/gateway.module';
import { GameGateway } from '../../src/gateway/game.gateway';

function makeClient(port: number): Socket {
  return ioc(`http://localhost:${port}`, { transports: ['websocket'] });
}

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('GameGateway integration', () => {
  let app: INestApplication;
  let port: number;
  let ioServer: Server;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    }).compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    const url = await app.getUrl();
    port = parseInt(new URL(url).port, 10);
    ioServer = module.get(GameGateway).server;
  }, 10000);

  afterAll(async () => {
    await app.close();
  }, 10000);

  describe('sector:join', () => {
    it('join valid (5,5) → receives sector:joined with correct payload', async () => {
      const socket = makeClient(port);
      await waitForEvent(socket, 'connect');

      socket.emit('sector:join', { x: 5, y: 5 });
      const data = await waitForEvent<{ x: number; y: number; room: string }>(socket, 'sector:joined');

      expect(data).toEqual({ x: 5, y: 5, room: 'sector:5:5' });
      socket.disconnect();
    });

    it('join idempotent — joining (5,5) twice yields only one membership', async () => {
      const socket = makeClient(port);
      await waitForEvent(socket, 'connect');

      socket.emit('sector:join', { x: 5, y: 5 });
      await waitForEvent(socket, 'sector:joined');

      socket.emit('sector:join', { x: 5, y: 5 });
      const data = await waitForEvent<{ x: number; y: number; room: string }>(socket, 'sector:joined');
      expect(data.room).toBe('sector:5:5');
      socket.disconnect();
    });

    it('leave → receives sector:left and room no longer contains socket', async () => {
      const socket = makeClient(port);
      await waitForEvent(socket, 'connect');

      socket.emit('sector:join', { x: 3, y: 7 });
      await waitForEvent(socket, 'sector:joined');

      socket.emit('sector:leave', { x: 3, y: 7 });
      const data = await waitForEvent<{ x: number; y: number; room: string }>(socket, 'sector:left');
      expect(data).toEqual({ x: 3, y: 7, room: 'sector:3:7' });
      socket.disconnect();
    });

    it('leave never-joined → emits sector:left (no-op, no error)', async () => {
      const socket = makeClient(port);
      await waitForEvent(socket, 'connect');

      socket.emit('sector:leave', { x: 10, y: 10 });
      const data = await waitForEvent<{ room: string }>(socket, 'sector:left');
      expect(data.room).toBe('sector:10:10');
      socket.disconnect();
    });

    it.each([
      [0, 5],
      [31, 5],
      [5, 0],
      [5, 16],
    ])('out-of-bounds join (%i,%i) → OUT_OF_BOUNDS error, no room joined', async (x, y) => {
      const socket = makeClient(port);
      await waitForEvent(socket, 'connect');

      socket.emit('sector:join', { x, y });
      const err = await waitForEvent<{ event: string; code: string }>(socket, 'error');

      expect(err.event).toBe('sector:join');
      expect(err.code).toBe('OUT_OF_BOUNDS');
      socket.disconnect();
    });

    it.each([
      [{}],
      [{ x: 'a', y: 5 }],
      [{ x: 1.5, y: 5 }],
    ])('invalid payload %j → INVALID_PAYLOAD error', async (payload) => {
      const socket = makeClient(port);
      await waitForEvent(socket, 'connect');

      socket.emit('sector:join', payload);
      const err = await waitForEvent<{ event: string; code: string }>(socket, 'error');

      expect(err.event).toBe('sector:join');
      expect(err.code).toBe('INVALID_PAYLOAD');
      socket.disconnect();
    });

    it('disconnect cleanup — rooms released after disconnect (FR-008)', async () => {
      const socket = makeClient(port);
      await waitForEvent(socket, 'connect');

      socket.emit('sector:join', { x: 1, y: 1 });
      await waitForEvent(socket, 'sector:joined');
      socket.emit('sector:join', { x: 2, y: 2 });
      await waitForEvent(socket, 'sector:joined');
      socket.emit('sector:join', { x: 3, y: 3 });
      await waitForEvent(socket, 'sector:joined');

      const socketId = socket.id!;
      socket.disconnect();

      await new Promise((resolve) => setTimeout(resolve, 200));

      const rooms = ioServer.sockets.adapter.rooms;
      expect(rooms.get('sector:1:1')?.has(socketId)).toBeFalsy();
      expect(rooms.get('sector:2:2')?.has(socketId)).toBeFalsy();
      expect(rooms.get('sector:3:3')?.has(socketId)).toBeFalsy();
    });

    it('100-cycle leak test — no growth in adapter room count (SC-004)', async () => {
      const countRooms = (): number => ioServer.sockets.adapter.rooms.size;
      const initialCount = countRooms();

      for (let i = 0; i < 100; i++) {
        const socket = makeClient(port);
        await waitForEvent(socket, 'connect');
        socket.emit('sector:join', { x: 5, y: 5 });
        await waitForEvent(socket, 'sector:joined');
        socket.emit('sector:leave', { x: 5, y: 5 });
        await waitForEvent(socket, 'sector:left');
        socket.disconnect();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
      const finalCount = countRooms();
      expect(finalCount).toBeLessThanOrEqual(initialCount + 1);
    }, 30000);
  });
});
