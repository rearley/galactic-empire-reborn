import { PlanetTickService, MAXTIC } from '../../src/game/planet/planet-tick.service';
import { PLANTIME, PLANTOCK_SECONDS } from '../../src/game/constants';

/**
 * A planet is updated once per PLANTOCK — 30 minutes by default — not once per
 * PLANTIME.
 *
 * C paces a cursor over the planet file: `plarti` processes at most MAXTIC (20)
 * records per kick and reschedules itself `plantime` seconds later, where
 * `plantime = plantock / numrecs` (GEMAIN.C:656). PLANTIME (55) is only the
 * initial value of that variable before it is recomputed at boot; the invariant
 * the economy is balanced around is `plantock = lngopt(PLANTOCK,1,32760)*60`,
 * one `multiply()` per planet per 30 minutes (GEMAIN.C:469).
 *
 * The port ran the whole owned-planet list every 55 seconds — roughly 33x too
 * fast. A colony of 29,664 grew by ~200 people a minute, which a playtester
 * spotted immediately: "at that rate they would be able to populate earth soon".
 */
class FakePlanets {
  readonly ticked: string[] = [];
  constructor(
    private readonly planets: Array<{
      xsect: number; ysect: number; plnum: number; userid: string | null;
      items: Array<{ qty: bigint }>;
    }>,
  ) {}
  all() { return this.planets; }
  async runEconomicTickFor(key: string): Promise<void> { this.ticked.push(key); }
}

function makeService(count: number, nowMs = 0) {
  // A populated planet — the tick skips zero-population worlds outright
  // (GEMAIN.C:2132), so slot 0 (I_MEN) has to be non-zero for these
  // scheduling tests to see any work at all.
  const planets = Array.from({ length: count }, (_, i) => ({
    xsect: i, ysect: 0, plnum: 1, userid: 'owner',
    items: Array.from({ length: 14 }, () => ({ qty: 1000n })),
  }));
  const fake = new FakePlanets(planets);
  let clock = nowMs;
  const svc = new PlanetTickService(
    fake as never,
    { subscribe: jest.fn(), startPlanetUpdateTimer: jest.fn() } as never,
    () => clock,
  );
  return { svc, fake, advanceClock: (secs: number) => { clock += secs * 1000; } };
}

describe('planet economy cadence — one multiply per PLANTOCK', () => {
  it('updates a planet on the first sweep', async () => {
    const { svc, fake } = makeService(1);
    await (svc as unknown as { advance(): Promise<void> }).advance();
    expect(fake.ticked).toHaveLength(1);
  });

  it('does NOT update it again on the next PLANTIME sweep', async () => {
    const { svc, fake, advanceClock } = makeService(1);
    await (svc as unknown as { advance(): Promise<void> }).advance();
    advanceClock(PLANTIME);
    await (svc as unknown as { advance(): Promise<void> }).advance();
    expect(fake.ticked).toHaveLength(1);
  });

  it('updates it again once PLANTOCK has elapsed', async () => {
    const { svc, fake, advanceClock } = makeService(1);
    await (svc as unknown as { advance(): Promise<void> }).advance();
    advanceClock(PLANTOCK_SECONDS);
    await (svc as unknown as { advance(): Promise<void> }).advance();
    expect(fake.ticked).toHaveLength(2);
  });

  it('gives roughly PLANTOCK/PLANTIME sweeps between updates', async () => {
    const { svc, fake, advanceClock } = makeService(1);
    for (let i = 0; i < Math.floor(PLANTOCK_SECONDS / PLANTIME); i++) {
      await (svc as unknown as { advance(): Promise<void> }).advance();
      advanceClock(PLANTIME);
    }
    // One update at the start; the next is not due until the full period passes.
    expect(fake.ticked).toHaveLength(1);
  });

  it('processes at most MAXTIC planets per sweep, as C does', async () => {
    const { svc, fake } = makeService(MAXTIC * 3);
    await (svc as unknown as { advance(): Promise<void> }).advance();
    expect(fake.ticked).toHaveLength(MAXTIC);
  });

  it('works through the backlog on later sweeps rather than dropping it', async () => {
    const { svc, fake, advanceClock } = makeService(MAXTIC * 2);
    await (svc as unknown as { advance(): Promise<void> }).advance();
    advanceClock(PLANTIME);
    await (svc as unknown as { advance(): Promise<void> }).advance();
    expect(fake.ticked).toHaveLength(MAXTIC * 2);
    expect(new Set(fake.ticked).size).toBe(MAXTIC * 2); // each planet once
  });

  it('ignores unowned planets', async () => {
    const { svc, fake } = makeService(2);
    (fake.all() as Array<{ userid: string | null }>)[0].userid = null;
    await (svc as unknown as { advance(): Promise<void> }).advance();
    expect(fake.ticked).toHaveLength(1);
  });
});
