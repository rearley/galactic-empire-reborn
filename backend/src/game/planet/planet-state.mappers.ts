import { Planet, Prisma } from '../../prisma/client';
import { NUMITEMS } from '../constants/items';
import { PlanetItem, PlanetState } from './planet-state.types';

/**
 * Convert a Prisma Planet row to the in-memory PlanetState,
 * exploding the six parallel item arrays into a 14-slot PlanetItem array.
 */
export function prismaPlanetToState(row: Planet): PlanetState {
  const items: PlanetItem[] = [];
  for (let i = 0; i < NUMITEMS; i++) {
    items.push({
      qty: row.itemsQty[i] ?? 0n,
      rate: row.itemsRate[i] ?? 0,
      sell: (row.itemsSell[i] ?? 0) !== 0,
      reserve: row.itemsReserve[i] ?? 0,
      markup2a: row.itemsMarkup2a[i] ?? 0,
      sold2a: row.itemsSold2a[i] ?? 0n,
    });
  }

  return {
    xsect: row.xsect,
    ysect: row.ysect,
    plnum: row.plnum,
    type: row.type,
    xcoord: row.xcoord,
    ycoord: row.ycoord,
    userid: row.userid,
    name: row.name,
    enviorn: row.enviorn,
    resource: row.resource,
    cash: row.cash,
    debt: row.debt,
    tax: row.tax,
    taxrate: row.taxrate,
    warnings: row.warnings,
    password: row.password,
    lastattack: row.lastattack,
    beacon: row.beacon,
    spyowner: row.spyowner,
    technology: row.technology,
    teamcode: row.teamcode,
    lastTickAt: row.lastTickAt,
    items,
  };
}

/**
 * Convert an in-memory PlanetState back to a Prisma update payload,
 * re-assembling the six parallel item arrays.
 */
export function stateToPrismaUpdate(state: PlanetState): Prisma.PlanetUpdateInput {
  return {
    userid: state.userid,
    name: state.name,
    enviorn: state.enviorn,
    resource: state.resource,
    cash: state.cash,
    debt: state.debt,
    tax: state.tax,
    taxrate: state.taxrate,
    warnings: state.warnings,
    password: state.password,
    lastattack: state.lastattack,
    beacon: state.beacon,
    spyowner: state.spyowner,
    technology: state.technology,
    teamcode: state.teamcode,
    lastTickAt: state.lastTickAt ?? null,
    itemsQty: state.items.map((it) => it.qty),
    itemsRate: state.items.map((it) => it.rate),
    itemsSell: state.items.map((it) => (it.sell ? 1 : 0)),
    itemsReserve: state.items.map((it) => it.reserve),
    itemsMarkup2a: state.items.map((it) => it.markup2a),
    itemsSold2a: state.items.map((it) => it.sold2a),
  };
}
