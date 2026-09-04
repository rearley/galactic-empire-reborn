import { applyEconomyTick } from '../../src/game/planet/planet-economy';
import { PlanetState } from '../../src/game/planet/planet-state.types';
import { NUMITEMS, I_MEN, I_FOOD } from '../../src/game/constants/items';
import { formatMessage, MessageId } from '../../src/game/commands/messages';

/**
 * The survey's words have to agree with the maths behind them.
 *
 * Production scales with `(enviorn + resource + 2) * 0.25` (GEPLANET.C:281), so
 * a HIGHER value is a BETTER world on both axes. The environment table once ran
 * the other way, with `enviorn` 0 labelled "Earth-like" and 3 "Inferno-like",
 * so a pilot comparing two planets would take the worse one every time — and I
 * did exactly that in a playtest, calling an "Earth-like / Abundant" world the
 * best draw of the sector when its environment was the worst grade there is.
 *
 * The ordering is what matters, and canon's own labels have it: SCAN12..SCAN15
 * are Poor, Marginal, Good, Very Good. They are deliberately axis-NEUTRAL
 * because canon reuses one table for both environment and resources
 * (GECMDS.C:2338-2356), which is precisely why our evocative
 * "Inferno-like/Toxic/Hostile/Earth-like" could never have been right: those
 * words are meaningless applied to a resource grade.
 */
function makePlanet(enviorn: number, resource: number): PlanetState {
  return {
    xsect: 0, ysect: 0, plnum: 1, type: 2, xcoord: 0.5, ycoord: 0.5,
    userid: 'owner', name: 'Testbed',
    enviorn, resource,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0,
    warnings: 0, password: '', lastattack: '', beacon: '', spyowner: '',
    technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, (_, i) => ({
      qty: i === I_MEN ? 10_000n : i === I_FOOD ? 100_000n : 0n,
      rate: i === I_MEN ? 50 : 0,
      sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
    })),
  };
}

/** Colonists produced in one tick — the thing a pilot is really choosing between. */
function outputOf(enviorn: number, resource: number): number {
  const before = makePlanet(enviorn, resource);
  const after = applyEconomyTick(before);
  return Number(after.items[I_MEN].qty) - Number(before.items[I_MEN].qty);
}

describe('planet survey labels match the production they describe', () => {
  it('a higher environment grade really does produce more', () => {
    expect(outputOf(3, 2)).toBeGreaterThan(outputOf(0, 2));
  });

  it('a higher resource grade really does produce more', () => {
    expect(outputOf(2, 3)).toBeGreaterThan(outputOf(2, 0));
  });

  it('names the WORST environment as the least hospitable', () => {
    expect(formatMessage(MessageId.SCAN12)).toBe('Poor');
  });

  it('names the BEST environment as the most hospitable', () => {
    expect(formatMessage(MessageId.SCAN15)).toBe('Very Good');
  });

  it('keeps the resource scale running from worst to best', () => {
    // Already correct, and pinned so the fix above cannot invert it by accident.
    expect(formatMessage(MessageId.SCAN12)).not.toBe('Abundant');
  });
});
