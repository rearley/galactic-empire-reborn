/**
 * A flush that keeps failing must get louder, not quieter.
 *
 * `flush()` catches per-ship and logs. That is right for a transient error —
 * one ship's row is briefly locked, the next sweep gets it — but it is exactly
 * wrong for a persistent one. Adding `channel` to ShipState put an unknown
 * column in the Prisma payload and made EVERY flush throw; the world ran on
 * memory while Postgres quietly stopped updating, and the only trace was a log
 * line repeated every thirty seconds among thousands. All 3,196 backend tests
 * passed through it because Prisma is mocked in every one.
 *
 * The DMMF guard test covers that specific cause. This covers the shape: after
 * a run of consecutive failures the service escalates once, so a persistent
 * fault is distinguishable from noise.
 */

import { ShipStateService, FLUSH_FAILURE_ALARM } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: -1, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: true, ...over,
  };
}

function build(update: jest.Mock) {
  const prisma = { ship: { update }, shipClass: { findMany: jest.fn().mockResolvedValue([]) } } as unknown as PrismaService;
  const tick = { subscribe: jest.fn(() => jest.fn()) } as unknown as TickService;
  const svc = new ShipStateService(prisma, tick);
  const errors: string[] = [];
  (svc as unknown as { logger: { error: (m: string) => void; warn: (m: string) => void } }).logger = {
    error: (m: string) => errors.push(String(m)),
    warn: (m: string) => errors.push(String(m)),
  } as never;
  return { svc, errors };
}

const runFlush = async (svc: ShipStateService, times: number) => {
  for (let i = 0; i < times; i++) {
    await (svc as unknown as { flush(): Promise<void> }).flush();
  }
};

describe('ShipStateService flush failure escalation', () => {
  it('does not cry wolf over a single transient failure', async () => {
    const update = jest.fn()
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockResolvedValue({});
    const { svc, errors } = build(update);
    svc.loadShip(makeShip());

    await runFlush(svc, 3);

    expect(errors.some((e) => e.includes(FLUSH_FAILURE_ALARM))).toBe(false);
  });

  it('raises the alarm once a run of flushes has all failed', async () => {
    const update = jest.fn().mockRejectedValue(new Error('Unknown arg `channel`'));
    const { svc, errors } = build(update);
    svc.loadShip(makeShip());

    await runFlush(svc, 12);

    expect(errors.filter((e) => e.includes(FLUSH_FAILURE_ALARM)).length).toBe(1);
  });

  it('names the persistence risk, not just the error', async () => {
    const update = jest.fn().mockRejectedValue(new Error('Unknown arg `channel`'));
    const { svc, errors } = build(update);
    svc.loadShip(makeShip());
    await runFlush(svc, 12);

    const alarm = errors.find((e) => e.includes(FLUSH_FAILURE_ALARM))!;
    expect(alarm.toLowerCase()).toContain('not being persisted');
  });

  /**
   * Round 6: 34,772 flushes threw over four hours and this alarm never fired.
   * The condition was `failed === attempted` — EVERY dirty ship — and the world
   * held two brand-new hulls that flushed fine, because the field that poisoned
   * the payload (`userKills`) is only written when a captain boards an existing
   * ship. So every sweep was a partial failure, the counter reset every time,
   * and the one safeguard against a silent total outage stayed quiet while
   * three pilots lost everything they had bought.
   *
   * A fault that hits some ships forever is not less serious than one that hits
   * all of them. Every test above this used a single ship, which is why the
   * distinction never showed up.
   */
  it('alarms when a fault hits only SOME ships, sweep after sweep', async () => {
    const update = jest.fn(({ where }: { where: { userid_shipno: { userid: string } } }) =>
      where.userid_shipno.userid === 'doomed'
        ? Promise.reject(new Error('Unknown argument `userKills`'))
        : Promise.resolve({}),
    );
    const { svc, errors } = build(update as unknown as jest.Mock);
    const doomed = makeShip({ userid: 'doomed', shipno: 1 });
    const healthy = makeShip({ userid: 'healthy', shipno: 1 });
    svc.loadShip(doomed);
    svc.loadShip(healthy);

    for (let i = 0; i < 12; i++) {
      doomed.dirty = true;
      healthy.dirty = true;
      await (svc as unknown as { flush(): Promise<void> }).flush();
    }

    expect(errors.filter((e) => e.includes(FLUSH_FAILURE_ALARM))).toHaveLength(1);
  });

  it('resets once flushes succeed again, so a later fault re-alarms', async () => {
    const update = jest.fn().mockRejectedValue(new Error('boom'));
    const { svc, errors } = build(update);
    const ship = makeShip();
    svc.loadShip(ship);

    await runFlush(svc, 12);
    expect(errors.filter((e) => e.includes(FLUSH_FAILURE_ALARM))).toHaveLength(1);

    update.mockResolvedValue({});
    ship.dirty = true;
    await runFlush(svc, 1);

    update.mockRejectedValue(new Error('boom again'));
    ship.dirty = true;
    await runFlush(svc, 12);
    expect(errors.filter((e) => e.includes(FLUSH_FAILURE_ALARM))).toHaveLength(2);
  });
});
