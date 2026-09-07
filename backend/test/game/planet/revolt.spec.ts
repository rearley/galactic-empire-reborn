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
import { FREE_PLANET_OWNER } from '../../../src/game/planet/planet-economy';

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
    // taxrate=60 → taxrate/120 = 0.5 → revoltPressure = 0.175 * men.
    // men=10000 → pressure 1750 > troops 1000 → revolt eligible.
    // First draw 0.0 → floor(0*10) = 0 → revolt fires.
    // Second draw 0.0 → divisor = floor(0*8)+2 = 2; newTroops = 1000/2 = 500.
    //
    // NOTE: taxrate must stay under 120 here. `taxfact = 1 - taxrate/120`
    // (GEPLANET.C:257) and the storage ceiling is `maxpl[i] * fact`
    // (GEPLANET.C:294-296), so a 120% rate makes every ceiling zero and wipes
    // the planet's stockpiles outright — including the population the revolt
    // pressure is computed from.
    const planet = makePlanet({
      userid: 'owner1', taxrate: 60,
    });
    planet.items[I_MEN].qty = 10000n;
    planet.items[I_TROOPS].qty = 1000n;

    const mailCreate = jest.fn().mockResolvedValue({});
    const prisma = { mailStat: { create: mailCreate } } as never;
    const events = new EventEmitter2();
    const emitted: string[] = [];
    events.onAny((ev: string | string[]) => {
      emitted.push(Array.isArray(ev) ? ev.join('.') : ev);
    });

    const random = new FixedRandom([0, 0]);
    const svc = new PlanetEconomyService(random, prisma);

    const { state: next, revolted } = await svc.applyTick(planet);

    expect(revolted).toBe(true);
    // "**Free**", not null. C writes the sentinel (GEPLANET.C:377) so the
    // planet stays economically alive: the economy gate is `userid[0] != 0`
    // (GEMAIN.C:2129), which the sentinel passes. Writing null froze a revolted
    // colony forever — population never grew, never starved, and it could never
    // recover or become worth reclaiming.
    expect(next.userid).toBe(FREE_PLANET_OWNER);
    // applyEconomyTick may run starvation/production first — but with rate=0
    // and food=1000, troops/100 = 10 < food (1000), so no starvation. Troops
    // remain 1000 going into the revolt branch, then get divided by 2.
    expect(Number(next.items[I_TROOPS].qty)).toBe(500);

    // Distress mail queued for the deposed owner — into MailStat, which is the
    // table `mai` reads; a row in Mail would never reach the player.
    // queueDistressMail is fire-and-forget; await one microtask to let it run.
    await new Promise((r) => setImmediate(r));
    expect(mailCreate).toHaveBeenCalledTimes(1);
    const arg = mailCreate.mock.calls[0][0];
    expect(arg.data.userid).toBe('owner1');
    expect(arg.data.class).toBe(MAIL_CLASS_DISTRESS);
    expect(arg.data.int1).toBe(5);
    expect(arg.data.int2).toBe(7);
    // MESG30 — C's revolt notice type (GEPLANET.C:368). It rendered as
    // "Attacker: REVOLT" while it shared the attack payload shape.
    expect(arg.data.type).toBe(30);
    expect(arg.data.cash).toBe(500n); // troops remaining

    // No combat events emitted.
    const combatEvents = emitted.filter((e) => e.startsWith('combat.'));
    expect(combatEvents).toHaveLength(0);
  });

  it('skips revolt when randVal % 10 !== 0', async () => {
    const planet = makePlanet({ userid: 'owner1', taxrate: 120 });
    planet.items[I_MEN].qty = 10000n;
    planet.items[I_TROOPS].qty = 1000n;

    const mailCreate = jest.fn().mockResolvedValue({});
    const prisma = { mailStat: { create: mailCreate } } as never;
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
    const prisma = { mailStat: { create: mailCreate } } as never;
    const random = new FixedRandom([0, 0]);
    const svc = new PlanetEconomyService(random, prisma);

    const { state: next, revolted } = await svc.applyTick(planet);
    expect(revolted).toBe(false);
    // A NEVER-CLAIMED planet stays null. The "**Free**" sentinel marks a planet
    // that revolted and is now ownerless-but-alive; the two are distinct, and
    // only the revolt path writes it.
    expect(next.userid).toBeNull();
    expect(mailCreate).not.toHaveBeenCalled();
  });

  /**
   * Canon gates the whole revolt block on the planet not ALREADY being free:
   *
   *   if (!sameas(plptr->userid,"**Free**"))   -- GEPLANET.C:342
   *
   * A colony revolts once. After that it keeps producing and feeding itself
   * (GEMAIN.C:2129 gates the economy on `userid[0] != 0`, and "**Free**"
   * passes) but there is no government left to overthrow and no owner to
   * mail.
   *
   * The port gated only on `userid === null`, so a free planet revolted again
   * on every qualifying tick — dividing its garrison by 2..9 each time, and
   * addressing a distress letter to "**Free**", which has no User row and
   * threw a foreign-key error four times a day per colony.
   *
   * Observed on the live server: two abandoned test colonies ground down to
   * 0 and 1 troops, with the matching errors in the log.
   */
  it('skips revolt when the planet has ALREADY revolted (GEPLANET.C:342)', async () => {
    // taxrate 60, as in the first case — 120 zeroes `taxfact` and the storage
    // ceilings wipe the stockpiles before the revolt branch is even reached,
    // which would make this pass for the wrong reason.
    const planet = makePlanet({ userid: FREE_PLANET_OWNER, taxrate: 60 });
    planet.items[I_MEN].qty = 10000n;
    planet.items[I_TROOPS].qty = 1000n;

    const mailCreate = jest.fn().mockResolvedValue({});
    const prisma = { mailStat: { create: mailCreate } } as never;
    // Draws that WOULD revolt an owned planet: 1-in-10 gate hits, divisor roll.
    const random = new FixedRandom([0, 0]);
    const svc = new PlanetEconomyService(random, prisma);

    const { state: next, revolted } = await svc.applyTick(planet);

    expect(revolted).toBe(false);
    expect(next.userid).toBe(FREE_PLANET_OWNER);
    // The garrison is NOT cut a second time.
    expect(next.items[I_TROOPS].qty).toBe(1000n);
    expect(mailCreate).not.toHaveBeenCalled();
  });

  it('skips revolt when troops sufficient to suppress (pressure <= troops)', async () => {
    // pressure = 0.35 * men = 0.35 * 100 = 35; troops = 1000 — easily suppressed.
    const planet = makePlanet({ userid: 'owner1', taxrate: 120 });
    planet.items[I_MEN].qty = 100n;
    planet.items[I_TROOPS].qty = 1000n;

    const mailCreate = jest.fn().mockResolvedValue({});
    const prisma = { mailStat: { create: mailCreate } } as never;
    const random = new FixedRandom([0, 0]);
    const svc = new PlanetEconomyService(random, prisma);

    const { state: next, revolted } = await svc.applyTick(planet);
    expect(revolted).toBe(false);
    expect(next.userid).toBe('owner1');
    expect(mailCreate).not.toHaveBeenCalled();
  });
});

/**
 * C makes two independent `gernd()` calls in the revolt branch:
 *
 *   if (gernd()%10 == 0)
 *     cnt = plptr->items[I_TROOPS].qty / ((gernd()%8)+2);
 *
 * The port drew ONCE and derived both from it — gating on `randVal % 10` and
 * then taking `(randVal % 8) + 2` as the divisor. The survivors of the first
 * test are {0,10,...,90}, whose residues mod 8 are only {0,2,4,6}, so the
 * divisor could only ever be 2, 4, 6 or 8 — and unevenly: 3/10, 3/10, 2/10,
 * 2/10. C's divisor is uniform over 2..9.
 *
 * @see GEPLANET.C:359-361
 */
describe('revolt severity is an independent roll (GEPLANET.C:359-361)', () => {
  async function revoltWith(draws: number[]): Promise<bigint> {
    const planet = makePlanet({ userid: 'owner1', taxrate: 60 });
    planet.items[I_MEN].qty = 10000n;
    planet.items[I_TROOPS].qty = 720n; // divisible by 2..9, so no flooring noise
    const prisma = { mailStat: { create: jest.fn().mockResolvedValue({}) } } as never;
    const svc = new PlanetEconomyService(new FixedRandom(draws), prisma);
    const { state } = await svc.applyTick(planet);
    return state.items[I_TROOPS].qty;
  }

  it('reaches divisors the single-draw version could never produce', async () => {
    // Second draw picks the divisor: floor(0.4 * 8) = 3 -> divisor 5.
    expect(await revoltWith([0, 0.4])).toBe(144n); // 720 / 5
  });

  it('spans the full 2..9 range', async () => {
    // floor(r * 8) + 2 for r at the bottom and top of the range.
    expect(await revoltWith([0, 0])).toBe(360n);      // divisor 2
    expect(await revoltWith([0, 0.999])).toBe(80n);   // divisor 9
  });

  it('still gates the revolt itself on the first draw', async () => {
    // floor(0.55 * 10) = 5, not 0 -> no revolt, garrison intact.
    expect(await revoltWith([0.55, 0])).toBe(720n);
  });
});
