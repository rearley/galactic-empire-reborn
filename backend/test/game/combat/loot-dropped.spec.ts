/**
 * A stack that will not fit is dropped whole — canon's `chkweight` gate
 * (GEFUNCS.C:1129 `chkweight(wptr,i,amt)`,
 * :2541 `chkweight(wptr,itm,amt)`) — and until now nothing recorded that it happened.
 *
 * A player reported five Cybertron kills paying "little to no gold". The
 * manifests showed 255-1,166 gold aboard every wreck; the answer was his own
 * hold, full of mines, with the wreck's mines looted just ahead of its gold.
 * Nothing in the log could say so. `onDropped` is how it can.
 */
import { resolveKillSpoils, KillSpoilsDeps, LootTransfer } from '../../../src/game/combat/kill-resolution';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { I_GOLD, I_MINE, NUMITEMS } from '../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'T',
    items: Array(NUMITEMS).fill(0n) as bigint[],
    ...over,
  });
}

function harness(ships: ShipState[], maxTons: number): KillSpoilsDeps {
  const map = new Map<string, ShipState>();
  for (const s of ships) map.set(shipKey(s.userid, s.shipno), s);
  return {
    mutate: (userid, shipno, fn) => {
      const s = map.get(shipKey(userid, shipno));
      if (s) fn(s);
    },
    maxTonsFor: () => maxTons,
    // divisor 1: the whole stack comes across
    random: { next: () => 0 },
  };
}

describe('resolveKillSpoils reports what the hold could not take', () => {
  it('names the gold stack that the wreck\'s mines crowded out', () => {
    // 1,000-ton hold carrying 190 mines (950 t). The wreck's 10 mines (50 t)
    // fill it exactly; its 400 gold (200 t) then has nowhere to go.
    const killerItems = Array(NUMITEMS).fill(0n) as bigint[];
    killerItems[I_MINE] = 190n;
    const attacker = makeShip({ userid: 'hunter', shipno: 1, items: killerItems });
    const wreckItems = Array(NUMITEMS).fill(0n) as bigint[];
    wreckItems[I_MINE] = 10n;
    wreckItems[I_GOLD] = 400n;
    const victim = makeShip({ userid: 'Cybrg-205', shipno: 205, items: wreckItems });

    const dropped: LootTransfer[] = [];
    const loot = resolveKillSpoils(victim, attacker, {
      ...harness([attacker, victim], 1000),
      onDropped: (t) => dropped.push(t),
    });

    expect(loot).toEqual([{ itemIndex: I_MINE, amount: 10n }]);
    expect(dropped).toEqual([{ itemIndex: I_GOLD, amount: 400n }]);
    expect(attacker.items[I_GOLD]).toBe(0n);
  });

  it('reports nothing when everything fits', () => {
    const attacker = makeShip({ userid: 'hunter', shipno: 1 });
    const wreckItems = Array(NUMITEMS).fill(0n) as bigint[];
    wreckItems[I_GOLD] = 400n;
    const victim = makeShip({ userid: 'Cybrg-205', shipno: 205, items: wreckItems });

    const dropped: LootTransfer[] = [];
    resolveKillSpoils(victim, attacker, {
      ...harness([attacker, victim], 1000),
      onDropped: (t) => dropped.push(t),
    });

    expect(dropped).toEqual([]);
  });
});
