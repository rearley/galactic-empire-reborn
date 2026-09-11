/**
 * `x` leaves the game — canon's exit, and the one the port never had.
 *
 * GEMAIN.C:2859 mnu_fightsub:
 *
 *   if (sameas(input,"x"))
 *     if (warsptr->cantexit == 0)
 *       { cleartm(usrnum); ...save...; prfmsg(EXIWAR2, shipname);
 *         outsect(ALWAYS,&coord,usrnum,0); warsptr->status = GESTAT_AVAIL; }
 *     else
 *       { prfmsg(CANTEXT); }
 *
 * Two things follow that the port was missing entirely.
 *
 * There was no way to leave. The `cantexit` RESTRICTION was implemented — a
 * client-side disconnect mid-combat kills the hull, per warhupa — but nothing
 * it could restrict, so the only exit was closing the tab. That also made a
 * second ship unreachable: the ship-select menu is only offered on connect, so
 * switching hulls meant dropping the connection.
 *
 * And leaving is VISIBLE. Canon announces EXIWAR2 to the sector — "Scanners
 * can no longer locate The %s, Sir!" — so a pilot you were fighting sees you
 * go rather than simply losing you off the scan.
 */
import { ExitHandlerService } from '../../../../src/game/commands/handlers/exit.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'WildCat',
    xcoord: 5,
    ycoord: 5,
    phasrtype: 1,
    shieldtype: 1,
    items: new Array(NUMITEMS).fill(0n),
    topspeed: 8,
    ...over,
  });
}

const run = (ship: ShipState) =>
  new ExitHandlerService().command.handler(ship, [], {} as never) as {
    lines: Array<{ text: string }>;
    broadcasts?: Array<{ room: string; event: string; payload: { text: string } }>;
    exitGame?: boolean;
  };

describe('the `x` command', () => {
  it('refuses while the guns are still hot, with canon\'s reason', () => {
    const r = run(makeShip({ cantexit: 5 }));

    expect(r.exitGame).toBeFalsy();
    expect(r.lines[0].text).toBe(formatMessage(MessageId.CANTEXT));
    expect(r.lines[0].text).toContain('Galactic Codes of Engagement');
  });

  it('warns that hanging up instead destroys the ship', () => {
    // Canon says so in the refusal itself, and the port already implements it
    // (warhupa: cantexit > 0 on a client disconnect kills the hull).
    expect(run(makeShip({ cantexit: 3 })).lines[0].text).toContain('destroyed');
  });

  it('leaves when the ship is out of combat', () => {
    const r = run(makeShip({ cantexit: 0 }));
    expect(r.exitGame).toBe(true);
  });

  it('tells the SECTOR you have gone, naming the ship', () => {
    const r = run(makeShip({ cantexit: 0, shipname: 'WildCat' }));
    const announced = (r.broadcasts ?? []).map((b) => b.payload.text).join('\n');
    expect(announced).toBe(formatMessage(MessageId.EXIWAR2, 'WildCat'));
    expect(announced).toContain('WildCat');
  });

  it('does not announce anything when the exit is refused', () => {
    expect(run(makeShip({ cantexit: 9 })).broadcasts ?? []).toHaveLength(0);
  });
});
