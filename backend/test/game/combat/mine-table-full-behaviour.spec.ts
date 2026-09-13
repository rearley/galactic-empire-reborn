/**
 * A refused mine costs nothing — canon spends the mine only on success.
 *
 * `laymine` scans for a free slot in the galaxy-wide table and, only inside the
 * branch that finds one, sets `cantexit` and does `--ptr->items[I_MINE]`, then
 * `return(1)`. Falling off the end returns 0 and the caller prints MINE2,
 * "The mine launcher is temporarly jammed, Sir!" (GECMDS.C:1772-1780 for the
 * caller, :1805-1818 for laymine).
 *
 * Wiring NUMMINES made that refusal reachable for the first time and both call
 * sites got it wrong in different ways: the player path let the rejection
 * escape as "Internal error processing command.", and the droid path spent the
 * mine before asking.
 */
import { MineHandlerService } from '../../../src/game/commands/handlers/mine.handler';
import { MineTableFullError } from '../../../src/game/combat/mine.repository';
import { MessageId, formatMessage } from '../../../src/game/commands/messages';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

const I_MINE_IDX = 11; // GEMAIN.H:154

function makeShip(over: Partial<ShipState> = {}): ShipState {
  const items = Array(14).fill(0n) as bigint[];
  items[I_MINE_IDX] = 5n;
  return baseMakeShip({
    shipname: 'Layer',
    channel: 3,
    xcoord: 5.5,
    ycoord: 5.5,
    energy: 60000,
    phasrtype: 1,
    lastfired: -1,
    shieldtype: 1,
    items: items,
    topspeed: 10,
    ...over,
  });
}

describe('mine — galaxy table full', () => {
  const build = (ship: ShipState) => {
    const shipState = {
      mutate: (_u: string, _n: number, fn: (s: ShipState) => void) => { fn(ship); return ship; },
      get: () => ship,
    } as never;
    const mineRepo = {
      create: vi.fn().mockRejectedValue(new MineTableFullError(12)),
    } as never;
    const mineRegistry = {
      countByDeployer: () => 0,
      add: vi.fn(),
      isFull: () => true,
      capacity: 12,
    } as never;
    return new MineHandlerService(shipState, mineRepo, mineRegistry, { get: () => ({ hasMine: true }) } as never);
  };

  it('answers MINE2 rather than leaking an internal error', async () => {
    const ship = makeShip();
    const res = await build(ship).command.handler(ship, ['30'], {} as never);
    expect(res.lines.map((l) => l.text)).toEqual([formatMessage(MessageId.MIN_JAMMED)]);
  });

  it('spends no mine and sets no combat lock when refused', async () => {
    // C reaches `--ptr->items[I_MINE]` and `cantexit = FIRETICKS` only inside
    // the free-slot branch (GECMDS.C:1809-1814).
    const ship = makeShip();
    await build(ship).command.handler(ship, ['30'], {} as never);
    expect(ship.items[I_MINE_IDX]).toBe(5n);
    expect(ship.cantexit).toBe(0);
  });
});
