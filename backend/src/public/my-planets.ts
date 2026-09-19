import { NUMITEMS } from '../game/constants/items';
import { PlanetState } from '../game/planet/planet-state.types';
import { CalculatorInput } from './calculator';

/** One of the caller's colonies, already in the calculator's input shape. */
export interface MyPlanet {
  xsect: number;
  ysect: number;
  plnum: number;
  name: string;
  input: CalculatorInput;
}

/**
 * The signed-in player's own colonies, for the calculator's dropdown.
 *
 * PORT-ORIGINAL, like the calculator itself. Owner only — not team planets —
 * and only the figures the owner already reads in game: stock, rates, cash and
 * tax rate from `adm`, environment and resource from a scan. Nothing else on
 * the planet (password, beacon, spy owner) is copied, so nothing else can leak.
 *
 * Sorted by name and then by sector, because canon does not make planet names
 * unique and the sector is what tells two "Zygor"s apart in the dropdown.
 *
 * @see docs/DECISIONS.md 2026-09-19 — the calculator may read your own colonies
 */
export function ownedPlanetsFor(userid: string, planets: readonly PlanetState[]): MyPlanet[] {
  return planets
    .filter((p) => p.userid === userid)
    // Sorts filter()'s fresh array, never the service's — `.toSorted()` is not
    // in this lib target (see ship-class-cache.service.ts).
    .sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      || a.xsect - b.xsect || a.ysect - b.ysect || a.plnum - b.plnum)
    .map((p) => ({
      xsect: p.xsect,
      ysect: p.ysect,
      plnum: p.plnum,
      name: p.name,
      input: {
        stock: Array.from({ length: NUMITEMS }, (_, i) => Number(p.items[i]?.qty ?? 0n)),
        rates: Array.from({ length: NUMITEMS }, (_, i) => p.items[i]?.rate ?? 0),
        enviorn: p.enviorn,
        resource: p.resource,
        taxrate: p.taxrate,
        planetCash: Number(p.cash),
      },
    }));
}
