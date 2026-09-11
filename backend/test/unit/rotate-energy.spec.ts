/**
 * Turning costs energy, and a ship without the power to turn is told so.
 *
 *   if (useenergy(warsptr,usrnum,ROTENGUSE) == 1) { ...turn... }
 *   else { prfmsg(NOROTPW); outprfge(ALWAYS,usrnum); }
 *
 * @see GECMDS.C:660 (hyperspace branch) and :702 (normal branch)
 * @see GEMAIN.H:73 `#define ROTENGUSE 30`
 *
 * `useenergy` refuses unless the ship can pay the cost AND keep a 500-unit
 * reserve — the comment in the original is literally `/* fudge a bit *\/`:
 *
 *   if (ptr->energy >= amount+500) { ptr->energy -= amount; return(1); }
 *   else return(0);
 *
 * @see GEFUNCS.C:1500-1515
 *
 * The port charged nothing. ROTENGUSE was exported from constants.ts and used
 * by no production code, and rotate.handler.ts carried three TODO(006) comments
 * sitting exactly where canon's gates go. A drained ship could still spin to
 * any heading — so it could always turn to run, or turn to bring phasers to
 * bear, with no power at all.
 */
import { rotateCommand } from '../../src/game/commands/handlers/rotate.handler';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { ROTENGUSE } from '../../src/game/constants';
import { CommandContext, CommandResult } from '../../src/game/commands/command.types';
import { NUMITEMS } from '../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

/** `useenergy`'s reserve: the debit is refused unless energy >= amount + 500. */
const FUDGE = 500;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 20,
    ycoord: 20,
    energy: 50_000,
    phasrtype: 1,
    items: new Array(NUMITEMS).fill(0n),
    topspeed: 10,
    ...over,
  });
}

const ctx: CommandContext = {};
const rot = (ship: ShipState, arg: string) =>
  rotateCommand.handler(ship, [arg], ctx) as CommandResult;

describe('rotation costs ROTENGUSE (GECMDS.C:660, :702)', () => {
  it('debits 30 energy for a turn', () => {
    const ship = makeShip({ energy: 50_000 });

    rot(ship, '90');

    expect(ship.energy).toBe(50_000 - ROTENGUSE);
  });

  it('refuses with NOROTPW when the ship cannot pay', () => {
    const ship = makeShip({ energy: 10, heading: 0, head2b: 0 });

    const res = rot(ship, '90');

    expect(res.lines[0].text).toBe(formatMessage(MessageId.NOROTPW));
  });

  it('does not turn on a refusal — the helm is locked, not merely silent', () => {
    const ship = makeShip({ energy: 10, heading: 0, head2b: 0 });

    rot(ship, '90');

    expect({ head2b: ship.head2b, energy: ship.energy }).toEqual({ head2b: 0, energy: 10 });
  });

  it('keeps canon 500-unit reserve: exactly amount+500 still turns', () => {
    // `if (ptr->energy >= amount+500)` — the boundary is inclusive.
    const ship = makeShip({ energy: ROTENGUSE + FUDGE });

    const res = rot(ship, '90');

    expect(res.lines[0].text).toBe(formatMessage(MessageId.NOWTURN, 90));
    expect(ship.energy).toBe(FUDGE);
  });

  it('one unit below the reserve is refused', () => {
    const ship = makeShip({ energy: ROTENGUSE + FUDGE - 1 });

    const res = rot(ship, '90');

    expect(res.lines[0].text).toBe(formatMessage(MessageId.NOROTPW));
  });
});
