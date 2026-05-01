import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io as ioc, Socket } from 'socket.io-client';
import { GatewayModule } from '../../src/gateway/gateway.module';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandsModule } from '../../src/game/commands/commands.module';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TickKind } from '../../src/game/tick/tick.types';
import { ShipState } from '../../src/game/ship/ship-state.types';

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function makeShipState(overrides: { userid: string; shipno: number; shipname: string; topspeed?: number }): ShipState {
  return {
    userid: overrides.userid,
    shipno: overrides.shipno,
    shipname: overrides.shipname,
    shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0,
    topspeed: overrides.topspeed ?? 5,
    warncntr: 0,
    dirty: false,
  };
}

describe('command round-trip integration (US1)', () => {
  let app: INestApplication;
  let port: number;
  let shipServiceFake: ShipStateService;
  let prismaMock: { ship: { findMany: jest.Mock; update: jest.Mock }; shipClass: { findMany: jest.Mock } };
  let flushTick: (() => Promise<void>) | undefined;

  const USERID = 'roundtrip-user';
  const SHIPNO = 1;
  const SHIPNAME = 'Roundtrip';

  beforeEach(async () => {
    const ship = makeShipState({ userid: USERID, shipno: SHIPNO, shipname: SHIPNAME, topspeed: 5 });

    prismaMock = {
      ship: {
        findMany: jest.fn().mockResolvedValue([ship]),
        update: jest.fn().mockResolvedValue({}),
      },
      shipClass: {
        findMany: jest.fn().mockResolvedValue([{ classNumber: 1, scanRange: 10000, typeName: 'Scout', hasCloak: false }]),
      },
    };

    const tickServiceMock = {
      subscribe: jest.fn().mockImplementation(
        (_kind: TickKind, handler: () => Promise<void>) => {
          if (_kind === TickKind.SHIP_UPDATE) flushTick = handler;
          return () => {};
        },
      ),
    };

    // Construct a real ShipStateService using the mocked deps, then initialise it manually
    // so the in-memory map is loaded before we build the NestJS app.
    shipServiceFake = new ShipStateService(
      prismaMock as never,
      tickServiceMock as never,
    );
    await shipServiceFake.onModuleInit();

    const module: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule, CommandsModule],
    })
      .overrideProvider(ShipStateService)
      .useValue(shipServiceFake)
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    const url = await app.getUrl();
    port = parseInt(new URL(url).port, 10);
  }, 10000);

  afterEach(async () => {
    flushTick = undefined;
    await app.close();
  }, 10000);

  function makeClient(): Socket {
    return ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      query: { userid: USERID },
    });
  }

  it('rot 45 → command:result with NOWTURN success line', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'rot 45' });
    const result = await waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      client,
      'command:result',
    );
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].category).toBe('success');
    expect(result.lines[0].text).toContain('45');
    client.disconnect();
  });

  it('rot 45 → after flush, ship.degrees == 45 in state', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'rot 45' });
    await waitForEvent(client, 'command:result');
    // Verify in-memory state was mutated
    const state = shipServiceFake.get(USERID, SHIPNO);
    expect(state?.degrees).toBe(45);
    expect(state?.dirty).toBe(true);
    client.disconnect();
  });

  it('after flush tick: degrees=45 written to Prisma, dirty cleared', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'rot 45' });
    await waitForEvent(client, 'command:result');
    // Advance the SHIP_UPDATE tick
    await flushTick!();
    expect(prismaMock.ship.update).toHaveBeenCalledTimes(1);
    const state = shipServiceFake.get(USERID, SHIPNO);
    expect(state?.dirty).toBe(false);
    client.disconnect();
  });

  it('imp 50 → command:result with ENGFIRE success line', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'imp 50' });
    const result = await waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      client,
      'command:result',
    );
    expect(result.lines[0].category).toBe('success');
    client.disconnect();
  });

  it('warp 3 → command:result with ENGFIRE success line', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'warp 3' });
    const result = await waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      client,
      'command:result',
    );
    expect(result.lines.at(-1)!.category).toBe('success');
    client.disconnect();
  });

  it('zero prisma.ship.update calls when no command issued (SC-003)', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    await flushTick!();
    expect(prismaMock.ship.update).not.toHaveBeenCalled();
    client.disconnect();
  });

  // T038: US2 round-trip cases
  it('scan → command:result carries scanGrid (US2)', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'scan' });
    const result = await waitForEvent<{ lines: unknown[]; scanGrid?: unknown[] }>(
      client,
      'command:result',
    );
    expect(result.scanGrid).toBeDefined();
    expect(Array.isArray(result.scanGrid)).toBe(true);
    client.disconnect();
  });

  it('scan emits zero Ship writes (read-only, SC-003)', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'scan' });
    await waitForEvent(client, 'command:result');
    await flushTick!();
    expect(prismaMock.ship.update).not.toHaveBeenCalled();
    client.disconnect();
  });

  it('report nav → command:result with multi-line read-out (US2)', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'report nav' });
    const result = await waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      client,
      'command:result',
    );
    expect(result.lines.length).toBeGreaterThan(2);
    // Header line should reference class typename and ship name
    expect(result.lines[0].category).toBe('system');
    client.disconnect();
  });

  it('report nav emits zero Ship writes (read-only, SC-003)', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'report nav' });
    await waitForEvent(client, 'command:result');
    await flushTick!();
    expect(prismaMock.ship.update).not.toHaveBeenCalled();
    client.disconnect();
  });

  // T040: gateway try/catch error path
  it('handler that throws → client receives internal error line, connection stays open', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome

    // Register a throw-on-purpose command via the router directly
    const router = app.get<CommandRouterService>(CommandRouterService);
    router.register({
      keyword: '__throw_test__',
      aliases: [],
      minArgs: 0,
      argMissingMessage: '',
      handler: () => { throw new Error('intentional test throw'); },
    });

    client.emit('command', { input: '__throw_test__' });
    const result = await waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      client,
      'command:result',
    );
    expect(result.lines[0].text).toBe('Internal error processing command.');
    expect(result.lines[0].category).toBe('system');
    expect(client.connected).toBe(true);
    client.disconnect();
  });
});
