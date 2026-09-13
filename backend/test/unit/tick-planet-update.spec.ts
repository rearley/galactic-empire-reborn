/**
 * T007 — Tests for TickService.startPlanetUpdateTimer.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TickService } from '../../src/game/tick/tick.service';
import { TickKind } from '../../src/game/tick/tick.types';
import { InvariantRegistry } from '../../src/game/invariants/harness';

describe('TickService — PLANET_UPDATE timer', () => {
  let service: TickService;
  let app: TestingModule;

  beforeEach(async () => {
    vi.useFakeTimers();
    app = await Test.createTestingModule({ providers: [TickService, { provide: InvariantRegistry, useValue: new InvariantRegistry() }] }).compile();
    service = app.get(TickService);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.useRealTimers();
  });

  it('startPlanetUpdateTimer fires PLANET_UPDATE subscribers on the given interval', () => {
    const calls: number[] = [];
    service.subscribe(TickKind.PLANET_UPDATE, (ctx) => { calls.push(ctx.tickNumber); });

    service.startPlanetUpdateTimer(500);
    vi.advanceTimersByTime(1500);

    expect(calls).toEqual([1, 2, 3]);
  });

  it('calling startPlanetUpdateTimer twice replaces the timer (idempotent)', () => {
    const calls: number[] = [];
    service.subscribe(TickKind.PLANET_UPDATE, () => { calls.push(1); });

    service.startPlanetUpdateTimer(200);
    vi.advanceTimersByTime(100);
    // Before any firing, replace with a new interval
    service.startPlanetUpdateTimer(500);
    vi.advanceTimersByTime(500);

    // First timer (200ms) would have fired at 200ms but was replaced;
    // second timer (500ms) fires once at t=600ms total.
    expect(calls).toEqual([1]);
  });

  it('PLANET_UPDATE TickContext.kind is PLANET_UPDATE', () => {
    const kinds: string[] = [];
    service.subscribe(TickKind.PLANET_UPDATE, (ctx) => { kinds.push(ctx.kind); });

    service.startPlanetUpdateTimer(1000);
    vi.advanceTimersByTime(1000);

    expect(kinds).toEqual([TickKind.PLANET_UPDATE]);
  });

  it('PLANET_UPDATE timer is cleared on onModuleDestroy', async () => {
    const calls: number[] = [];
    service.subscribe(TickKind.PLANET_UPDATE, () => { calls.push(1); });

    service.startPlanetUpdateTimer(1000);
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(1);

    await app.close();
    vi.advanceTimersByTime(5000);
    expect(calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
