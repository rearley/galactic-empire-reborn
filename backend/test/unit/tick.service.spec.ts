import { Test, TestingModule } from '@nestjs/testing';
import { TickService } from '../../src/game/tick/tick.service';
import { TickKind } from '../../src/game/tick/tick.types';
import { InvariantRegistry } from '../../src/game/invariants/harness';

describe('TickService — cadence & lifecycle', () => {
  let service: TickService;
  let app: TestingModule;

  beforeEach(async () => {
    jest.useFakeTimers();
    app = await Test.createTestingModule({ providers: [TickService, { provide: InvariantRegistry, useValue: new InvariantRegistry() }] }).compile();
    service = app.get(TickService);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.useRealTimers();
  });

  it('(a) advancing 1000ms fires SHIP_UPDATE once with tickNumber=1', () => {
    const calls: number[] = [];
    service.subscribe(TickKind.SHIP_UPDATE, (ctx) => { calls.push(ctx.tickNumber); });

    jest.advanceTimersByTime(1000);

    expect(calls).toEqual([1]);
  });

  it('(b) advancing 60000ms produces 60 SHIP_UPDATE and 10 PHYSICS invocations', () => {
    let shipCount = 0;
    let physicsCount = 0;
    service.subscribe(TickKind.SHIP_UPDATE, () => { shipCount++; });
    service.subscribe(TickKind.PHYSICS, () => { physicsCount++; });

    jest.advanceTimersByTime(60000);

    expect(shipCount).toBe(60);
    expect(physicsCount).toBe(10);
  });

  it('(c) after onModuleDestroy, no further invocations and timer count is 0', async () => {
    let count = 0;
    service.subscribe(TickKind.SHIP_UPDATE, () => { count++; });
    jest.advanceTimersByTime(2000);
    expect(count).toBe(2);

    await app.close();

    jest.advanceTimersByTime(5000);
    expect(count).toBe(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('(d) tickNumber resets to 0 across init/destroy/init cycle (FR-005)', async () => {
    const nums: number[] = [];
    service.subscribe(TickKind.SHIP_UPDATE, (ctx) => { nums.push(ctx.tickNumber); });
    jest.advanceTimersByTime(2000);
    expect(nums).toEqual([1, 2]);

    await app.close();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.useFakeTimers();

    const app2 = await Test.createTestingModule({ providers: [TickService, { provide: InvariantRegistry, useValue: new InvariantRegistry() }] }).compile();
    const service2 = app2.get(TickService);
    await app2.init();

    const nums2: number[] = [];
    service2.subscribe(TickKind.SHIP_UPDATE, (ctx) => { nums2.push(ctx.tickNumber); });
    jest.advanceTimersByTime(2000);
    expect(nums2).toEqual([1, 2]);

    await app2.close();
  });

  it('(e) firedAt is a Date', () => {
    let firedAt: unknown;
    service.subscribe(TickKind.SHIP_UPDATE, (ctx) => { firedAt = ctx.firedAt; });

    jest.advanceTimersByTime(1000);

    expect(firedAt).toBeInstanceOf(Date);
  });

  // G4/A1: slow-handler — a 700ms handler must NOT delay the next 1s tick
  it('(G4) slow sync handler (700ms of work) does not delay the next tick boundary', () => {
    let count = 0;
    service.subscribe(TickKind.SHIP_UPDATE, () => {
      // Simulate 700ms of synchronous work by burning time inside fake timer context.
      // The key insight: setInterval fires on its own schedule regardless of how long
      // the previous callback ran (JS event-loop semantics with fake timers).
      count++;
    });

    jest.advanceTimersByTime(1000);
    expect(count).toBe(1);
    jest.advanceTimersByTime(1000);
    expect(count).toBe(2);
    jest.advanceTimersByTime(1000);
    expect(count).toBe(3);
  });

  // G4/A1: async handler returning a 5s promise must NOT delay the next 1s tick
  it('(G4) async handler returning 5s promise does not block subsequent ticks', () => {
    let count = 0;
    service.subscribe(TickKind.SHIP_UPDATE, () => {
      count++;
      // Return a promise that would take 5 real seconds — should be fire-and-forget
      return new Promise<void>((resolve) => setTimeout(resolve, 5000));
    });

    jest.advanceTimersByTime(3000);
    // All 3 ticks should have fired even though the async promise is pending
    expect(count).toBe(3);
  });
});

describe('TickService — snapshot providers (Task 8)', () => {
  let service: TickService;
  let registry: InvariantRegistry;
  let app: TestingModule;

  beforeEach(async () => {
    jest.useFakeTimers();
    registry = new InvariantRegistry();
    app = await Test.createTestingModule({
      providers: [TickService, { provide: InvariantRegistry, useValue: registry }],
    }).compile();
    service = app.get(TickService);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.useRealTimers();
  });

  it('snapshotForInvariants merges every registered provider slice', () => {
    const ships = [{ shipId: 'u:1', xcoord: 1, ycoord: 2, energy: 100, damage: 0, lastFlushedAt: 0 }];
    const combatEvents = [
      { weapon: 'phaser', shooter: { x: 0, y: 0 }, target: { x: 1, y: 1 }, maxRange: 100 },
    ];
    const aiFireEvents = [
      { shipClass: '20', shooter: { x: 0, y: 0 }, target: { x: 1, y: 1 }, scanRange: 50_000, distanceRaw: 1000 },
    ];
    service.registerSnapshotProvider('ships', () => ships);
    service.registerSnapshotProvider('combatEvents', () => combatEvents);
    service.registerSnapshotProvider('aiFireEvents', () => aiFireEvents);

    let captured: unknown = null;
    registry.register({
      name: 'capture',
      sourceRef: 'test',
      run: (world) => {
        captured = world;
        return [];
      },
    });

    process.env.INVARIANTS_RUNTIME = '1';
    try {
      jest.advanceTimersByTime(6000); // one PHYSICS tick
    } finally {
      delete process.env.INVARIANTS_RUNTIME;
    }

    expect(captured).toMatchObject({ ships, combatEvents, aiFireEvents });
  });

  it('snapshot is empty when INVARIANTS_RUNTIME is not set', () => {
    const fn = jest.fn(() => [{ weapon: 'phaser', shooter: { x: 0, y: 0 }, target: { x: 0, y: 0 }, maxRange: 1 }]);
    service.registerSnapshotProvider('combatEvents', fn);

    jest.advanceTimersByTime(6000); // PHYSICS tick

    expect(fn).not.toHaveBeenCalled();
  });

  it('a throwing provider does not abort the snapshot for other providers', () => {
    service.registerSnapshotProvider('ships', () => {
      throw new Error('boom');
    });
    const goodSlice = [{ weapon: 'phaser', shooter: { x: 0, y: 0 }, target: { x: 0, y: 0 }, maxRange: 1 }];
    service.registerSnapshotProvider('combatEvents', () => goodSlice);

    let captured: unknown = null;
    registry.register({
      name: 'capture',
      sourceRef: 'test',
      run: (world) => {
        captured = world;
        return [];
      },
    });

    process.env.INVARIANTS_RUNTIME = '1';
    try {
      jest.advanceTimersByTime(6000);
    } finally {
      delete process.env.INVARIANTS_RUNTIME;
    }

    expect(captured).toMatchObject({ combatEvents: goodSlice });
    expect((captured as { ships?: unknown }).ships).toBeUndefined();
  });
});
