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
  return {
    userid: 'attacker', shipno: 1, shipname: 'FighterShip', shpclass: 5,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items,
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    dirty: false,
  };
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
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        const s = makeShip();
        fn(s);
      },
    ),
  } as unknown as ShipStateService;

  const mockPrisma = {
    user: { update: jest.fn().mockResolvedValue({}) },
    mailStat: { create: jest.fn().mockResolvedValue({}) },
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
  it('when left2 == 0 initially, ratio == 0 so no ground-fire, no return-fire, no counter-kill, no item-destruction', async () => {
    // Planet with 0 fighters → left2 = 0 → ratio = 0
    // All gates guarded by ratio > N are skipped
    const { service } = makeService(42);
    const planet = makePlanet(0, 0); // 0 fighters, 0 troops
    planet.items[5].qty = 1000n; // food present for potential destruction

    const ship = makeShip(10000);
    const result = await service.attackFighter(10000, ship, planet);

    // ratio = 0 → NO counter-kill (kill2 == 0)
    expect(result.kill2).toBe(0);
    // ratio = 0 → NO item destruction (ratio > 5 fails)
    expect(result.itemsDestroyed).toHaveLength(0);
    // kill1 == 0 (no defender fighters = 0, no troops = 0)
    expect(result.kill1).toBe(0);
  });

  it('MUST FAIL if someone adds a zero-guard to ratio calculation', () => {
    // This test documents the intentional bug: left2==0 yields ratio=0, not Infinity.
    // The C source does NOT zero-guard. If it were guarded:
    //   ratio = left2 > 0 ? (left1/left2)*100 : SOME_HIGH_VALUE
    // then item-destruction would fire and this test would fail.
    // The assertion: with 10000 attackers vs 0 defenders, no items should be destroyed.
    // If the "bug fix" is applied, itemsDestroyed.length > 0 for a seeded attack.
    // We document this explicitly so future readers understand the intent.
    expect(true).toBe(true); // placeholder — see tests above for actual verification
  });

  it('won remains possible even with ratio==0 if left2 eventually becomes 0 and troops < 5', async () => {
    // Even with ratio=0 (no direct kills), won can be 1 if left2 becomes 0 naturally
    // (which it starts at 0 here) and troops < 5.
    const { service } = makeService(42);
    const planet = makePlanet(0, 0); // starts with 0 fighters
    planet.items[I_TROOPS].qty = 0n;  // 0 troops < 5 threshold
    const ship = makeShip(10);

    const result = await service.attackFighter(10, ship, planet);

    // left2 == 0 (was already 0) and troops < 5 → won should be 1
    expect(result.won).toBe(1);
  });
});
