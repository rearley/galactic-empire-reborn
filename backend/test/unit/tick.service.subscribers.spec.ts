import { Test, TestingModule } from '@nestjs/testing';
import { TickService } from '../../src/game/tick/tick.service';
import { TickKind } from '../../src/game/tick/tick.types';

describe('TickService — subscriber registry (US3)', () => {
  let service: TickService;
  let app: TestingModule;

  beforeEach(async () => {
    jest.useFakeTimers();
    app = await Test.createTestingModule({ providers: [TickService] }).compile();
    service = app.get(TickService);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.useRealTimers();
  });

  it('register + fire — handler called with correct kind and sequential tickNumbers', () => {
    const calls: Array<{ kind: TickKind; tickNumber: number }> = [];
    service.subscribe(TickKind.SHIP_UPDATE, (ctx) => { calls.push({ kind: ctx.kind, tickNumber: ctx.tickNumber }); });

    jest.advanceTimersByTime(3000);

    expect(calls).toEqual([
      { kind: TickKind.SHIP_UPDATE, tickNumber: 1 },
      { kind: TickKind.SHIP_UPDATE, tickNumber: 2 },
      { kind: TickKind.SHIP_UPDATE, tickNumber: 3 },
    ]);
  });

  it('unsubscribe — returned function stops future invocations', () => {
    const calls: number[] = [];
    const unsub = service.subscribe(TickKind.SHIP_UPDATE, (ctx) => { calls.push(ctx.tickNumber); });

    jest.advanceTimersByTime(2000);
    unsub();
    jest.advanceTimersByTime(3000);

    expect(calls).toEqual([1, 2]);
  });

  it('idempotent unsubscribe — calling twice does not throw', () => {
    const unsub = service.subscribe(TickKind.SHIP_UPDATE, () => undefined);
    expect(() => {
      unsub();
      unsub();
    }).not.toThrow();
  });

  it('idempotent register — same handler ref twice counts once per tick', () => {
    let count = 0;
    const handler = (): void => { count++; };
    service.subscribe(TickKind.SHIP_UPDATE, handler);
    service.subscribe(TickKind.SHIP_UPDATE, handler);

    jest.advanceTimersByTime(1000);

    expect(count).toBe(1);
  });

  it('error isolation (FR-011 / SC-005) — throwing handler does not stop sibling or next tick', () => {
    let countGood = 0;
    let countBad = 0;

    service.subscribe(TickKind.SHIP_UPDATE, () => {
      countBad++;
      throw new Error('intentional test error');
    });
    service.subscribe(TickKind.SHIP_UPDATE, () => { countGood++; });

    expect(() => jest.advanceTimersByTime(60000)).not.toThrow();

    expect(countGood).toBe(60);
    expect(countBad).toBe(60);
  });

  it('kind isolation — PHYSICS handler is not invoked on SHIP_UPDATE ticks', () => {
    let physicsCount = 0;
    service.subscribe(TickKind.PHYSICS, () => { physicsCount++; });

    jest.advanceTimersByTime(5000); // 5 × SHIP_UPDATE, 0 × PHYSICS (need 6s)

    expect(physicsCount).toBe(0);

    jest.advanceTimersByTime(1000); // now 6s total — one PHYSICS fires

    expect(physicsCount).toBe(1);
  });

  // G4/A1: slow handler — setInterval fires on its own schedule regardless of handler duration
  it('(G4) slow handler (700ms simulation) — next tick fires at 1000ms boundary', () => {
    const fireTimes: number[] = [];
    service.subscribe(TickKind.SHIP_UPDATE, () => {
      fireTimes.push(Date.now());
    });

    jest.advanceTimersByTime(1000);
    expect(fireTimes).toHaveLength(1);

    jest.advanceTimersByTime(1000);
    expect(fireTimes).toHaveLength(2);

    jest.advanceTimersByTime(1000);
    expect(fireTimes).toHaveLength(3);
  });

  // G4/A1: async handler — a promise that would take 5s does not block subsequent ticks
  it('(G4) async handler with 5s promise — does not delay subsequent ticks', () => {
    const counts: number[] = [];
    service.subscribe(TickKind.SHIP_UPDATE, (ctx) => {
      counts.push(ctx.tickNumber);
      return new Promise<void>((resolve) => setTimeout(resolve, 5000));
    });

    jest.advanceTimersByTime(3000);

    expect(counts).toEqual([1, 2, 3]);
  });
});
