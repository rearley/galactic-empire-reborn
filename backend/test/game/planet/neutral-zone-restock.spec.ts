/**
 * The GE22e neutral-zone restock runs on the PLANET TICK, not at midnight.
 *
 * In C both patch blocks sit inside `plarti`'s continuous planet loop, on the
 * same pass and immediately AFTER `multiply()` has run for that record
 * (GEMAIN.C:2145-2178). So the storage clamp `multiply` applies —
 * `if (qty > maxpl[i] * fact) qty = maxpl[i] * fact` (GEPLANET.C:328-331) — is
 * undone the moment it happens, and the hub always holds 1,032,000 of every
 * item it sells.
 *
 * Our port ran production on the planet tick but only restored Zygor at
 * midnight, so for most of every day the shop sold what MAXPL allowed: spies
 * five at a time, ion cannons 250, and gold zero (the tick converts the whole
 * gold pile to planet cash, GEPLANET.C:261-265).
 */
import {
  applyEconomyTick,
  applyNeutralZoneRestock,
  isNeutralZoneRestockPlanet,
  NEUTRAL_RESTOCK_QTY,
} from '../../../src/game/planet/planet-economy';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { stateToPrismaUpdate } from '../../../src/game/planet/planet-state.mappers';
import { planetKey } from '../../../src/game/planet/planet-state.types';
import {
  BASEPRICE,
  I_FOOD,
  I_GOLD,
  I_MEN,
  I_SPY,
  I_TROOPS,
  MAXPL,
  NUMITEMS,
} from '../../../src/game/constants/items';

const HUB_OWNER = '**Neutral**';

function hubPlanet(plnum: number, overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: 0, ysect: 0, plnum,
    type: 2, xcoord: 0.5, ycoord: 0.5,
    userid: HUB_OWNER, name: plnum === 1 ? 'Zygor-3' : 'Nexus Prime',
    enviorn: 3, resource: 3,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0,
    warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, () => ({
      qty: NEUTRAL_RESTOCK_QTY,
      rate: 0,
      sell: true,
      reserve: 0,
      markup2a: 1,
      sold2a: 0n,
    })),
    ...overrides,
  };
}

describe('neutral-zone restock — GE22e patch fires on the planet tick', () => {
  it('recognises only the two hub trading posts', () => {
    expect(isNeutralZoneRestockPlanet(hubPlanet(1))).toBe(true);
    expect(isNeutralZoneRestockPlanet(hubPlanet(2))).toBe(true);
    expect(isNeutralZoneRestockPlanet(hubPlanet(3))).toBe(false);
    expect(isNeutralZoneRestockPlanet(hubPlanet(1, { xsect: 4, ysect: 7 }))).toBe(false);
  });

  it('undoes the MAXPL clamp the production tick just applied on Zygor-3', () => {
    const clamped = applyEconomyTick(hubPlanet(1));

    // Sanity: the tick really does clamp — this is the observed live damage.
    expect(Number(clamped.items[I_SPY].qty)).toBeLessThan(Number(NEUTRAL_RESTOCK_QTY));
    expect(Number(clamped.items[I_GOLD].qty)).toBe(0);

    const restocked = applyNeutralZoneRestock(clamped, () => 0);
    for (let i = 0; i < NUMITEMS; i++) {
      expect(restocked.items[i].qty).toBe(NEUTRAL_RESTOCK_QTY);
      expect(restocked.items[i].sell).toBe(true);
    }
    // Not a MAXPL figure anywhere — every slot is the flat 1,032,000.
    expect(Number(NEUTRAL_RESTOCK_QTY)).toBeGreaterThan(MAXPL[I_SPY]);
  });

  it('prices every slot as baseprice*2 + rnd%baseprice', () => {
    // rnd() -> 0.999... picks the top of the modulo range: baseprice-1.
    const restocked = applyNeutralZoneRestock(hubPlanet(1), () => 0.999999);
    for (let i = 0; i < NUMITEMS; i++) {
      expect(restocked.items[i].markup2a).toBe(BASEPRICE[i] * 2 + BASEPRICE[i] - 1);
    }
    const cheapest = applyNeutralZoneRestock(hubPlanet(1), () => 0);
    for (let i = 0; i < NUMITEMS; i++) {
      expect(cheapest.items[i].markup2a).toBe(BASEPRICE[i] * 2);
    }
  });

  it('restocks only troops, men and food at the T-station (plnum 2)', () => {
    const drained = hubPlanet(2);
    drained.items = drained.items.map((it) => ({ ...it, qty: 0n, sell: false }));
    const restocked = applyNeutralZoneRestock(drained, () => 0);

    for (const i of [I_TROOPS, I_MEN, I_FOOD]) {
      expect(restocked.items[i].qty).toBe(NEUTRAL_RESTOCK_QTY);
      expect(restocked.items[i].sell).toBe(true);
    }
    for (let i = 0; i < NUMITEMS; i++) {
      if (i === I_TROOPS || i === I_MEN || i === I_FOOD) continue;
      expect(restocked.items[i].qty).toBe(0n);
      expect(restocked.items[i].sell).toBe(false);
    }
  });

  it('leaves an ordinary colony alone', () => {
    const colony = hubPlanet(1, { xsect: 12, ysect: 4, userid: 'usr_abc' });
    const after = applyNeutralZoneRestock(applyEconomyTick(colony), () => 0);
    expect(after.items[I_SPY].qty).not.toBe(NEUTRAL_RESTOCK_QTY);
  });
});

describe('PlanetStateService.runEconomicTickFor — the hub never runs dry', () => {
  it('leaves Zygor-3 fully stocked after a production tick', async () => {
    const state = hubPlanet(1);
    const row = { ...stateToPrismaUpdate(state), ...state, ...toRowArrays(state) };
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      planet: { findMany: jest.fn().mockResolvedValue([row]), update },
    } as unknown as PrismaService;
    const ships = { get: () => undefined, mutate: () => undefined } as unknown as ShipStateService;

    const svc = new PlanetStateService(prisma, ships);
    await svc.onModuleInit();
    await svc.runEconomicTickFor(planetKey(0, 0, 1));

    const live = svc.get(0, 0, 1);
    expect(live).toBeDefined();
    for (let i = 0; i < NUMITEMS; i++) {
      expect(live!.items[i].qty).toBe(NEUTRAL_RESTOCK_QTY);
      expect(live!.items[i].sell).toBe(true);
    }
    expect(update).toHaveBeenCalled();
  });
});

/** The mapper reads six parallel arrays off the row. */
function toRowArrays(state: PlanetState) {
  return {
    itemsQty: state.items.map((i) => i.qty),
    itemsRate: state.items.map((i) => i.rate),
    itemsSell: state.items.map((i) => (i.sell ? 1 : 0)),
    itemsReserve: state.items.map((i) => i.reserve),
    itemsMarkup2a: state.items.map((i) => i.markup2a),
    itemsSold2a: state.items.map((i) => i.sold2a),
  };
}
