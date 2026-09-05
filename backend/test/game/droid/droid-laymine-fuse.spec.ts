/**
 * A droid's mine burns the same short fuse a Cybertron's does.
 *
 *     if (ptr->items[I_MINE] > 0)
 *         laymine(ptr,usrn,10);        GEDROIDS.C:512
 *
 * Ours passed 100. In a galaxy-wide table of twelve slots (NUMMINES), that is
 * ten times the occupancy per mine — and the >75%-damage branch this sits in
 * has no per-tick roll, so a damaged droid lays one every physics tick until
 * its magazine is empty. Ten minutes of held slots per mine instead of one is
 * the bulk of the "AI crowds players out of the mine table" question.
 */
import { DroidTickService } from '../../../src/game/droid/droid-tick.service';
import { MineRefusedError } from '../../../src/game/combat/mine.repository';
import { AI_MINE_TIMER } from '../../../src/game/constants';
import { I_MINE } from '../../../src/game/constants/items';
import type { ShipState } from '../../../src/game/ship/ship-state.types';

const droid = (over: Partial<ShipState> = {}): ShipState => {
  const items = Array(14).fill(0n) as bigint[];
  items[I_MINE] = 2n;
  return {
    userid: '@Droid-3', shipno: 1, shpclass: 33, channel: 4,
    xcoord: -8.5, ycoord: 2.25, items, status: 2,
    ...over,
  } as ShipState;
};

function build(create: jest.Mock) {
  const svc = Object.create(DroidTickService.prototype) as object;
  const added: unknown[] = [];
  Object.assign(svc, {
    mineRepo: { create },
    mineRegistry: { add: (m: unknown) => added.push(m) },
    logger: { error: jest.fn() },
  });
  return {
    added,
    lay: async (ship: ShipState) => {
      (svc as { layMine: (s: ShipState) => void }).layMine(ship);
      await new Promise((r) => setImmediate(r));
    },
  };
}

describe('droid mine laying', () => {
  it('sets canon\'s fuse of 10, not 100', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1, channel: 4, timer: 10, xcoord: -8.5, ycoord: 2.25 });
    const h = build(create);
    await h.lay(droid());

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      timer: 10, xcoord: -8.5, ycoord: 2.25,
    }));
    expect(AI_MINE_TIMER).toBe(10);
    expect(h.added).toHaveLength(1);
  });

  it('spends nothing when laymine is refused', async () => {
    // Either refusal — table full or this droid at its USRMINES cap.
    const ship = droid();
    const h = build(jest.fn().mockRejectedValue(new MineRefusedError('refused')));
    await h.lay(ship);

    expect(ship.items[I_MINE]).toBe(2n);
    expect(h.added).toEqual([]);
  });
});
