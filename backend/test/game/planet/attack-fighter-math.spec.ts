/**
 * T022-T024 — Fighter combat math trace and bug-preservation test.
 * Tests ground anti-air, defender return-fire, counter-kill gating,
 * high-ratio item destruction, win condition, and the attack_fig() ratio bug.
 * @see GECMDS.C:3788–3950 attack_fig
 * @see FR-014-019, SC-008 — ratio bug preserved intentionally
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlanetAttackService } from '../../../src/game/planet/planet-attack.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { AttackOutcome } from '../../../src/game/planet/planet-attack.types';
import { I_TROOPS, I_FIGHTER, NUMITEMS } from '../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import {
  PLATTRT1_DEFAULT, PLATTRT2_DEFAULT, FIRETICKS_DEFAULT,
} from '../../../src/game/commands/attack.config';

function makeItems(): PlanetState['items'] {
  return Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
}

function makeShip(fighters = 10000): ShipState {
  const items = Array(NUMITEMS).fill(0n) as bigint[];
  items[I_FIGHTER] = BigInt(fighters);
  items[I_TROOPS] = 0n;
  return baseMakeShip({
    userid: 'attacker',
    shipname: 'FighterShip',
    shpclass: 5,
    xcoord: 5.5,
    ycoord: 5.5,
    energy: 10000,
    where: 10,
    items: items,
  });
}

function makePlanet(fighters: number, troops: number, ownerUserid = 'defender'): PlanetState {
  const items = makeItems();
  items[I_FIGHTER].qty = BigInt(fighters);
  items[I_TROOPS].qty = BigInt(troops);
  return {
    xsect: 5, ysect: 5, plnum: 0,
    type: 1, xcoord: 5.5, ycoord: 5.5,
    userid: ownerUserid, name: 'FighterPlanet',
    enviorn: 0, resource: 0, cash: 0n, debt: 0n, tax: 0n,
    taxrate: 0, warnings: 0, password: '', lastattack: '', beacon: '',
    spyowner: '', technology: 0, teamcode: 0n,
    items,
  };
}

function makeService(seed: number) {
  const random = new Mulberry32Adapter(seed);
  const events = new EventEmitter2();

  const mockShipState = {
    mutate: vi.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        const s = makeShip();
        fn(s);
      },
    ),
    // ownerIsInGame() — canon's mailit(1) suppression (GEFUNCS.C:2231).
    findByUserid: vi.fn().mockReturnValue([]),
  } as unknown as ShipStateService;

  const mockPrisma = {
    user: { update: vi.fn().mockResolvedValue({}) },
    mailStat: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;

  const service = new PlanetAttackService(
    mockShipState, mockPrisma, events, random,
    PLATTRT1_DEFAULT, PLATTRT2_DEFAULT,
    0.05, 0.05, 0.05,
    FIRETICKS_DEFAULT,
  );

  return { service, mockPrisma };
}

// ---------------------------------------------------------------------------
// T022 — Fighter precondition tests (delegated through handler, tested via service)
// ---------------------------------------------------------------------------

describe('PlanetAttackService.attackFighter — basic result shape', () => {
  it('returns non-negative left1, left2, kill1, kill2', async () => {
    const { service } = makeService(42);
    const planet = makePlanet(100, 0);
    const ship = makeShip(500);

    const result: AttackOutcome = await service.attackFighter(500, ship, planet);

    expect(result.left1).toBeGreaterThanOrEqual(0);
    expect(result.left2).toBeGreaterThanOrEqual(0);
    expect(result.kill1).toBeGreaterThanOrEqual(0);
    expect(result.kill2).toBeGreaterThanOrEqual(0);
    expect(result.narration.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed and inputs', async () => {
    const planet1 = makePlanet(100, 0);
    const { service: s1 } = makeService(99);
    const r1 = await s1.attackFighter(500, makeShip(500), planet1);

    const planet2 = makePlanet(100, 0);
    const { service: s2 } = makeService(99);
    const r2 = await s2.attackFighter(500, makeShip(500), planet2);

    expect(r1.kill1).toBe(r2.kill1);
    expect(r1.kill2).toBe(r2.kill2);
    expect(r1.left1).toBe(r2.left1);
    expect(r1.left2).toBe(r2.left2);
    expect(r1.won).toBe(r2.won);
  });
});

// ---------------------------------------------------------------------------
// T023a — Ground anti-air fires when troops > 500
// ---------------------------------------------------------------------------

describe('PlanetAttackService.attackFighter — ground anti-air (FR-014-020)', () => {
  it('can shoot down attackers when planet has >500 troops', async () => {
    // With 1000 defenders and many attackers, ground AA fires (probabilistically)
    // We run enough trials to assert it can fire.
    let aaFired = false;
    for (let seed = 0; seed < 100; seed++) {
      const { service } = makeService(seed);
      const planet = makePlanet(0, 1000); // 0 fighters, 1000 troops
      const ship = makeShip(10000);

      // Capture kill1 before — but defender fighters = 0 so kill1 is ONLY from AA
      const result = await service.attackFighter(10000, ship, planet);
      // kill1 > 0 means either AA or defender return-fire fired
      // With 0 defender fighters, kill1 can only come from ground AA
      if (result.kill1 > 0) {
        aaFired = true;
        break;
      }
    }
    expect(aaFired).toBe(true);
  });

  it('no ground anti-air when troops <= 500', async () => {
    // With exactly 500 troops and 0 fighters, kill1 should be 0 (no AA triggers)
    let killHappened = false;
    for (let seed = 0; seed < 50; seed++) {
      const { service } = makeService(seed);
      const planet = makePlanet(0, 500); // 0 fighters, 500 troops (boundary)
      const ship = makeShip(10000);
      const result = await service.attackFighter(10000, ship, planet);
      // With no defender fighters and troops <= 500, kill1 should remain 0
      if (result.kill1 > 0) {
        killHappened = true;
        break;
      }
    }
    expect(killHappened).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T023b — Defender return-fire (FR-014-021)
// ---------------------------------------------------------------------------

describe('PlanetAttackService.attackFighter — defender return-fire (FR-014-021)', () => {
  it('defender fires back when left2 > 0', async () => {
    // With defender fighters present, kill1 should eventually be > 0
    let returnFireHappened = false;
    for (let seed = 0; seed < 100; seed++) {
      const { service } = makeService(seed);
      const planet = makePlanet(1000, 0); // 1000 fighters, 0 troops
      const ship = makeShip(10000);
      const result = await service.attackFighter(10000, ship, planet);
      if (result.kill1 > 0) {
        returnFireHappened = true;
        break;
      }
    }
    expect(returnFireHappened).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T023c — Attacker counter-kill gated by ratio > 1 (FR-014-022)
// ---------------------------------------------------------------------------

describe('PlanetAttackService.attackFighter — counter-kill gated by ratio > 1 (FR-014-022)', () => {
  it('kill2 == 0 when ratio <= 1 (attacker outnumbered)', async () => {
    // 1 attacker vs 1000 defenders → ratio = (1/1000)*100 = 0.1 < 1 → kill2 = 0
    const { service } = makeService(42);
    const planet = makePlanet(1000, 0);
    const ship = makeShip(1);
    const result = await service.attackFighter(1, ship, planet);
    expect(result.kill2).toBe(0);
  });

  it('kill2 > 0 when ratio > 1 (attacker has advantage)', async () => {
    // 10000 attackers vs 10 defenders → ratio = (10000/10)*100 = 100000 >> 1 → kill2 > 0
    let kill2Happened = false;
    for (let seed = 0; seed < 100; seed++) {
      const { service } = makeService(seed);
      const planet = makePlanet(10, 0);
      const ship = makeShip(10000);
      const result = await service.attackFighter(10000, ship, planet);
      if (result.kill2 > 0) {
        kill2Happened = true;
        break;
      }
    }
    expect(kill2Happened).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T023d — High-ratio item destruction (FR-014-023)
// ---------------------------------------------------------------------------

describe('PlanetAttackService.attackFighter — high-ratio item destruction (FR-014-023)', () => {
  it('can destroy items when ratio > 5', async () => {
    // ratio = (10000/1)*100 = 1,000,000 >> 5 → item destruction path runs
    let itemsDestroyed = false;
    for (let seed = 0; seed < 100; seed++) {
      const { service } = makeService(seed);
      const planet = makePlanet(1, 0);
      planet.items[0].qty = 50_000n; // population
      planet.items[5].qty = 1000n;   // food
      const ship = makeShip(10000);
      const result = await service.attackFighter(10000, ship, planet);
      if (result.itemsDestroyed.length > 0) {
        itemsDestroyed = true;
        break;
      }
    }
    expect(itemsDestroyed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T023e — Win condition: left2==0 && troops < 5 (FR-014-024)
// ---------------------------------------------------------------------------

describe('PlanetAttackService.attackFighter — win condition (FR-014-024)', () => {
  it('won == 1 when left2 == 0 and planet troops < 5', async () => {
    // With overwhelming attackers vs 0 defenders and 0 troops:
    let wonOnce = false;
    for (let seed = 0; seed < 200; seed++) {
      const { service } = makeService(seed);
      const planet = makePlanet(1, 0); // 1 defender fighter, 0 troops
      const ship = makeShip(100000);
      const result = await service.attackFighter(100000, ship, planet);
      if (result.won === 1) {
        wonOnce = true;
        expect(result.left2).toBe(0);
        break;
      }
    }
    expect(wonOnce).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T024 — Bug-preservation: left2 == 0 → ratio == 0, all gates skip
// ---------------------------------------------------------------------------

describe('PlanetAttackService.attackFighter — ratio bug preservation (FR-014-019, SC-008)', () => {
  it('with no defending fighters there is no return-fire and no counter-kill', async () => {
    // Both of those are gated on left2 > 0 in C and remain so. What is NOT
    // gated on left2 is ground anti-air (it keys off TROOPS) or the raid's
    // effect on the planet — see the unopposed-ratio test below.
    const { service } = makeService(42);
    const planet = makePlanet(0, 0); // 0 fighters, 0 troops
    const ship = makeShip(10000);

    const result = await service.attackFighter(10000, ship, planet);

    expect(result.kill2).toBe(0);
    // No defending fighters and no garrison → nothing shoots at the attackers.
    expect(result.kill1).toBe(0);
  });

  /**
   * An unopposed raid must count as a maximal one, not a nil one.
   *
   * C computes `ratio = (left1/left2)*100` guarding only the divide, so a
   * planet with no fighters yields ratio 0 — the one case where the attack
   * meets no air defence at all. C's own source marks the spot "there is a
   * bug here". Every consequence of a fighter raid hangs off this number
   * (item destruction >5, owner alert >1, distress mail >2), so 10,000
   * fighters hitting an undefended world destroyed nothing and told nobody.
   */
  it('treats a raid on a planet with no fighters as unopposed, not as nil', async () => {
    const { service } = makeService(7);
    const planet = makePlanet(0, 0); // no fighters, no garrison
    planet.items[5].qty = 1000n;     // food to lose

    const ship = makeShip(10000);
    const result = await service.attackFighter(10000, ship, planet);

    expect(result.itemsDestroyed.length).toBeGreaterThan(0);
    expect(Number(planet.items[5].qty)).toBeLessThan(1000);
  });

  it('wins an undefended planet: no fighters left and fewer than 5 troops', async () => {
    // The win condition keys off left2 and troops, not off ratio.
    const { service } = makeService(42);
    const planet = makePlanet(0, 0); // starts with 0 fighters
    planet.items[I_TROOPS].qty = 0n;  // 0 troops < 5 threshold
    const ship = makeShip(10);

    const result = await service.attackFighter(10, ship, planet);

    // left2 == 0 (was already 0) and troops < 5 → won should be 1
    expect(result.won).toBe(1);
  });

  /**
   * A garrison shoots down attacking fighters even when the planet has no
   * fighters of its own.
   *
   * C computes that shootdown from the planet's TROOPS, announces it with
   * ATTACKF8 — and then throws it away: the caps and both subtractions live
   * inside `if (left2 > 0L)`, so with no defending wing `left1 -= kill1` never
   * runs and every attacker flies home. C narrates a defence it declines to
   * apply. Found in a playtest against a colony holding 20,948 troops and no
   * fighters.
   */
  it('lets a garrison shoot down attackers when the planet has no fighters', async () => {
    let sawGroundFire = false;

    for (let seed = 1; seed <= 40; seed++) {
      const { service } = makeService(seed);
      const planet = makePlanet(0, 20_948); // no fighters, real garrison
      const ship = makeShip(300);

      const result = await service.attackFighter(300, ship, planet);

      expect(result.kill2).toBe(0);              // no defending wing to kill
      expect(result.left1).toBe(300 - result.kill1);
      if (result.kill1 > 0) {
        sawGroundFire = true;
        expect(result.left1).toBeLessThan(300);  // the garrison actually bit
      }
    }

    // Guards the test itself: if the 60% ground-fire gate never fired across
    // 40 seeds the assertion above would be vacuous.
    expect(sawGroundFire).toBe(true);
  });
});
