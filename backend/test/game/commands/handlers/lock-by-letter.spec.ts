/**
 * `loc B` must lock ship B — canon addresses ships by scan LETTER, not name.
 *
 * GECMDS.C:1473-1487 findshp:
 *
 *   letter = toupper(*ptr);
 *   for (i=0;i<NOSCANTAB;++i)
 *       if (scantab[usrnum].ship[i].letter == letter)
 *           { shpnum = scantab[usrnum].ship[i].shipno; break; }
 *   if (i>=NOSCANTAB) return(-1);
 *
 * It takes the FIRST CHARACTER, uppercases it, and looks it up in the caller's
 * scan table. Names never enter into it — which is exactly what HLPLOC
 * describes: "lock A would lock onto the closest ship, lock B the second
 * closest."
 *
 * Our findShip prefix-matched ship NAMES and had no letter branch, so `loc B`
 * answered "No such ship: B." while `sca sh B` worked — the owner hit this and
 * reasonably concluded the help was wrong. `sca sh` grew a letter branch of
 * its own when it was written; the shared helper never did.
 *
 * The same helper backs `tor` and `mis`, so `tor B` was broken identically —
 * which matters more in a fight than the lock does.
 */
import { findShip } from '../../../../src/game/commands/helpers/find-ship';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'u',
    shipname: 'Nameless',
    xcoord: 5,
    ycoord: 5,
    phasrtype: 1,
    shieldtype: 1,
    items: new Array(NUMITEMS).fill(0n),
    topspeed: 8,
    ...over,
  });
}

const me = makeShip({ userid: 'me', shipno: 1, shipname: 'WildCat' });
const alpha = makeShip({ userid: 'ai1', shipno: 1, shipname: 'Cybertron 41303', xcoord: 5.1 });
const bravo = makeShip({ userid: 'ai2', shipno: 1, shipname: 'Cybertron 42478', xcoord: 5.2 });
const all = [me, alpha, bravo];

/** What `sca lo` assigned: A -> alpha, B -> bravo. */
const scantab = [
  { shipKey: 'ai1#1', letter: 'A' },
  { shipKey: 'ai2#1', letter: 'B' },
];

const RANGE = 100_000;

describe('addressing a ship by its scan letter', () => {
  it('resolves B to the ship the scan called B', () => {
    const r = findShip('B', me, all, RANGE, scantab);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ship.shipname).toBe('Cybertron 42478');
  });

  it('is case-insensitive, as toupper(*ptr) is', () => {
    const r = findShip('b', me, all, RANGE, scantab);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ship.shipname).toBe('Cybertron 42478');
  });

  it('takes only the FIRST character, as canon does', () => {
    // `toupper(*ptr)` reads one char; "Bravo" and "B" are the same query.
    const r = findShip('Bravo', me, all, RANGE, scantab);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ship.shipname).toBe('Cybertron 42478');
  });

  it('reports no such ship for a letter nothing was assigned', () => {
    expect(findShip('Z', me, all, RANGE, scantab).ok).toBe(false);
  });

  it('still finds a ship by name when the letter misses', () => {
    // Our own extension, kept: a name is more use than a letter when the
    // scan table is stale, and canon never had to type on a web page.
    const r = findShip('Cybertron 41303', me, all, RANGE, scantab);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ship.shipname).toBe('Cybertron 41303');
  });

  it('works with no scan table at all — falls back to names', () => {
    const r = findShip('Cybertron 41303', me, all, RANGE);
    expect(r.ok).toBe(true);
  });

  it('never resolves a letter to yourself', () => {
    const selfTab = [{ shipKey: 'me#1', letter: 'A' }];
    expect(findShip('A', me, all, RANGE, selfTab).ok).toBe(false);
  });

  it('refuses a lettered ship that has drifted out of scanner range', () => {
    const far = makeShip({ userid: 'ai3', shipno: 1, shipname: 'Far', xcoord: 500 });
    const r = findShip('C', me, [...all, far], RANGE, [{ shipKey: 'ai3#1', letter: 'C' }]);
    expect(r.ok).toBe(false);
  });
});
