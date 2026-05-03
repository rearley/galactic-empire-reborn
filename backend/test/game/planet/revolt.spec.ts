/**
 * T056 — planet revolt (SC-007, FR-028):
 *  - Setup: owned planet with `(taxrate/120) * 0.35 * men > troops` AND
 *    seeded RNG so `Math.floor(random.next() * 100) % 10 === 0`.
 *  - Run economy tick.
 *  - Assert: troops reduced to floor(troops / ((rand%8)+2));
 *           userid set to null; MAIL_CLASS_DISTRESS row created;
 *           no combat events emitted.
 *
 * @see specs/006b-combat/tasks.md T056
 * @see GEPLANET.C:341-380
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlanetEconomyService } from '../../../src/game/planet/planet-economy.service';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { Random } from '../../../src/game/combat/random.port';
import { I_MEN, I_TROOPS, NUMITEMS } from '../../../src/game/constants/items';
import { MAIL_CLASS_DISTRESS } from '../../../src/game/constants';

function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  const items = Array.from({ length: NUMITEMS }, () => ({
    qty: 1000n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
  return {
    xsect: 5, ysect: 7, plnum: 1,
    type: 2, xcoord: 5.5, ycoord: 7.5,
    userid: 'owner1', name: 'Testarosa',
    enviorn: 1, resource: 1,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0,
    warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items,
    ...overrides,
  };
}

class FixedRandom implements Random {
  private values: number[];
  private idx = 0;
  constructor(values: number[]) { this.values = values; }
  next(): number {
    const v = this.values[this.idx % this.values.length];
    this.idx += 1;
    return v;
  }
}

describe('PlanetEconomyService — revolt branch (T056, FR-028)', () => {
  it('triggers revolt when conditions met: troops cut, owner cleared, distress mail queued', async () => {
    // taxrate=120 → taxrate/120 = 1.0 → revoltPressure = 0.35 * men.
    // men=10000 → pressure 3500 > troops 1000 → revolt eligible.
    // random.next() = 0.0 → randVal = 0 → 0 % 10 == 0 → revolt fires.
    // divisor = (0 % 8) + 2 = 2; newTroops = floor(1000 / 2) = 500.
    const planet = makePlanet({
      userid: 'owner1', taxrate: 120,
    });
    planet.items[I_MEN].qty = 10000n;
    planet.items[I_TROOPS].qty = 1000n;

    const mailCreate = jest.fn().mockResolvedValue({});
    const prisma = { mail: { create: mailCreate } } as never;
    const events = new EventEmitter2();
    const emitted: string[] = [];
    events.onAny((ev: string | string[]) => {
      emitted.push(Array.isArray(ev) ? ev.join('.') : ev);
    });

    const random = new FixedRandom([0]);
    const svc = new PlanetEconomyService(random, prisma);

    const { state: next, revolted } = await svc.applyTick(planet);

    expect(revolted).toBe(true);
    expect(next.userid).toBeNull();
    // applyEconomyTick may run starvation/production first — but with rate=0
    // and food=1000, troops/100 = 10 < food (1000), so no starvation. Troops
    // remain 1000 going into the revolt branch, then get divided by 2.
    expect(Number(next.items[I_TROOPS].qty)).toBe(500);

    // Distress mail queued for the deposed owner.
    // queueDistressMail is fire-and-forget; await one microtask to let it run.
    await new Promise((r) => setImmediate(r));
    expect(mailCreate).toHaveBeenCalledTimes(1);
    const arg = mailCreate.mock.calls[0][0];
    expect(arg.data.userid).toBe('owner1');
    expect(arg.data.class).toBe(MAIL_CLASS_DISTRESS);
    expect(arg.data.int1).toBe(5);
    expect(arg.data.int2).toBe(7);

    // No combat events emitted.
    const combatEvents = emitted.filter((e) => e.startsWith('combat.'));
    expect(combatEvents).toHaveLength(0);
  });

  it('skips revolt when randVal % 10 !== 0', async () => {
    const planet = makePlanet({ userid: 'owner1', taxrate: 120 });
    planet.items[I_MEN].qty = 10000n;
    planet.items[I_TROOPS].qty = 1000n;

    const mailCreate = jest.fn().mockResolvedValue({});
    const prisma = { mail: { create: mailCreate } } as never;
    // 0.07 → randVal = 7 → 7 % 10 != 0 → no revolt.
    const random = new FixedRandom([0.07]);
    const svc = new PlanetEconomyService(random, prisma);

    const { state: next, revolted } = await svc.applyTick(planet);

    expect(revolted).toBe(false);
    expect(next.userid).toBe('owner1');
    expect(mailCreate).not.toHaveBeenCalled();
  });

  it('skips revolt when planet is unowned (userid=null)', async () => {
    const planet = makePlanet({ userid: null, taxrate: 120 });
    planet.items[I_MEN].qty = 10000n;
    planet.items[I_TROOPS].qty = 1000n;

    const mailCreate = jest.fn().mockResolvedValue({});
    const prisma = { mail: { create: mailCreate } } as never;
    const random = new FixedRandom([0]);
    const svc = new PlanetEconomyService(random, prisma);

    const { state: next, revolted } = await svc.applyTick(planet);
    expect(revolted).toBe(false);
    expect(next.userid).toBeNull();
    expect(mailCreate).not.toHaveBeenCalled();
  });

  it('skips revolt when troops sufficient to suppress (pressure <= troops)', async () => {
    // pressure = 0.35 * men = 0.35 * 100 = 35; troops = 1000 — easily suppressed.
    const planet = makePlanet({ userid: 'owner1', taxrate: 120 });
    planet.items[I_MEN].qty = 100n;
    planet.items[I_TROOPS].qty = 1000n;

    const mailCreate = jest.fn().mockResolvedValue({});
    const prisma = { mail: { create: mailCreate } } as never;
    const random = new FixedRandom([0]);
    const svc = new PlanetEconomyService(random, prisma);

    const { state: next, revolted } = await svc.applyTick(planet);
    expect(revolted).toBe(false);
    expect(next.userid).toBe('owner1');
    expect(mailCreate).not.toHaveBeenCalled();
  });
});
