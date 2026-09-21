/**
 * A Cybertron that lays a mine must actually lay one.
 *
 * The code spent the mine and produced nothing:
 *
 *     // Mine lay — US4 full impl; decrement inventory only for now
 *     ship.items[I_MINE] = BigInt(Math.max(0, Number(ship.items[I_MINE]) - 1));
 *
 * No registry entry, no row — so a Cybertron burned its whole magazine over a
 * session and left an empty galaxy behind it. Droids lay real mines
 * (droid-tick.service.ts), so the two AI families disagreed on whether mines
 * exist.
 *
 * Canon, in the "they are running and cannot see me, mine the area" branch:
 *
 *     if (shipclass[ptr->shpclass].has_mine && ptr->items[I_MINE] > 0
 *         && gernd()%5 == 0)
 *         laymine(ptr,usrn,10);
 *
 * (GECYBS.C:311-315.) `laymine` sets `cantexit = FIRETICKS`, claims a free
 * slot, writes the layer's channel and the ship's coordinates, and decrements
 * `items[I_MINE]` INSIDE the success branch — a refused lay costs nothing
 * (GECMDS.C:1805-1818).
 *
 * Timer 10: this mine is dropped by something fleeing and is meant to be a
 * short-lived hazard behind it. Droids get the same 10 (GEDROIDS.C:512) — an
 * earlier version of this comment said "not the droids' 100", repeating the
 * belief that our 100 was canon. It was not; see docs/PROGRESS.md.
 */
import { I_MINE } from '../../../src/game/constants/items';
import { FIRETICKS } from '../../../src/game/constants';

import { MineTableFullError } from '../../../src/game/combat/mine.repository';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import type { Mock } from 'vitest';
import { AiWeapons } from '../../../src/game/ai/ai-weapons';

const cyb = (over: Partial<ShipState> = {}): ShipState => {
  const items = Array(14).fill(0n) as bigint[];
  items[I_MINE] = 3n;
  return {
    userid: 'Cybrg-1', shipno: 1, shpclass: 21, channel: 7,
    xcoord: 4.25, ycoord: -1.5, cantexit: 0, items, status: 2,
    ...over,
  } as ShipState;
};

/** The AI weapons, with only what `laymine` touches. */
function build(create: Mock) {
  const added: unknown[] = [];
  const weapons = new AiWeapons({
    mineRepo: { create },
    mineRegistry: { add: (m: unknown) => added.push(m) },
    shipState: {
      mutate: (_u: string, _n: number, fn: (s: ShipState) => void) => { fn(current); return current; },
    },
    logger: { error: vi.fn() },
  } as unknown as ConstructorParameters<typeof AiWeapons>[0]);
  let current: ShipState;
  return {
    added,
    lay: async (ship: ShipState) => {
      current = ship;
      weapons.laymine(ship);
      await new Promise((r) => setImmediate(r));
    },
  };
}

describe('Cybertron mine laying', () => {
  it('creates a real mine at the ship, with the LAYER\'s channel', async () => {
    // The channel is how a mine kill names who left it: the victim's
    // `lastfired` is set to it. @see GECMDS.C:1810
    const create = vi.fn().mockResolvedValue({ id: 1, channel: 7, timer: 10, xcoord: 4.25, ycoord: -1.5 });
    const h = build(create);
    await h.lay(cyb());

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      channel: 7, timer: 10, xcoord: 4.25, ycoord: -1.5,
    }));
    expect(h.added).toHaveLength(1);
  });

  it('spends the mine and takes the combat lock, but only on success', async () => {
    const ship = cyb();
    const h = build(vi.fn().mockResolvedValue({ id: 1, channel: 7, timer: 10, xcoord: 0, ycoord: 0 }));
    await h.lay(ship);

    expect(ship.items[I_MINE]).toBe(2n);
    expect(ship.cantexit).toBe(FIRETICKS);
  });

  it('spends nothing when the galaxy mine table is full', async () => {
    // C reaches `--ptr->items[I_MINE]` only inside the free-slot branch.
    const ship = cyb();
    const h = build(vi.fn().mockRejectedValue(new MineTableFullError(12)));
    await h.lay(ship);

    expect(ship.items[I_MINE]).toBe(3n);
    expect(ship.cantexit).toBe(0);
    expect(h.added).toEqual([]);
  });

  it('pins the constants the lay depends on', () => {
    expect(FIRETICKS).toBe(10);
    expect(I_MINE).toBe(11);
  });
});
