import { buildScantab } from '../../../../src/game/commands/handlers/helpers/scantab';
import { ScanHandlerService } from '../../../../src/game/commands/handlers/scan.handler';
import { shipLetter } from '../../../../src/game/commands/helpers/find-ship';
import { shipKey } from '../../../../src/game/ship/ship-state.types';
import { makeShip } from '../../../helpers/make-ship';

/**
 * The letter a scan assigned must be findable by the key everything else uses.
 *
 * `ScantabEntry.shipKey` is `userid#shipno`; every consumer of `lettersFor`
 * asks with `userid:shipno`, the `ShipState` key — the torpedo and missile
 * handlers, and the gateway's three hit-report call sites. `shipLetter`
 * compares the two strings exactly, so it never matched and every report read
 * `?`:
 *
 *     Fire control scanners cannot get a positive lock on ship ?, Sir!
 *     Sensors indicate our hyper-missile has hit ship ?, The SADx348006.
 *
 * Canon returns `?` only when the ship is genuinely absent from your scan table
 * (GEFUNCS.C:2591 `return('?');` shpltr), which is a real state — a named `sca sh` assigns no
 * letter. This was every hit on every ship, including one the player had just
 * scanned and locked. Reported from play.
 *
 * `findShip`, the letter → ship direction in the same file, already tolerates
 * both formats. Only this direction did not.
 */
describe('a scanned ship can be named by its letter', () => {
  const scanner = makeShip({ userid: 'rick', shipno: 1, xcoord: 5, ycoord: 5, shpclass: 1 });
  const target = makeShip({
    userid: 'Cybrg-241', shipno: 241, shipname: 'SADx348006',
    xcoord: 5.05, ycoord: 5, shpclass: 24, status: 2,
  });

  /**
   * Through the real public seam, not a hand-built array: `lettersFor` is what
   * every consumer calls, and the translation it performs is the fix.
   */
  const lettersFor = (): ReadonlyArray<{ shipKey: string; letter: string }> => {
    const handler = Object.create(ScanHandlerService.prototype) as ScanHandlerService;
    (handler as unknown as { scantabMap: Map<string, unknown> }).scantabMap = new Map([
      [`${scanner.userid}#${scanner.shipno}`, buildScantab(scanner, [scanner, target], null, 500_000)],
    ]);
    return handler.lettersFor(scanner.userid, scanner.shipno);
  };

  it('assigns the target a letter at all', () => {
    const entries = lettersFor().filter((e) => e.letter !== '?');
    expect(entries.length).toBeGreaterThan(0);
  });

  it('finds that letter by the ShipState key every caller holds', () => {
    const letter = shipLetter(lettersFor(), shipKey(target.userid, target.shipno));
    expect(letter).not.toBe('?');
    expect(letter).toMatch(/^[A-Z]$/);
  });

  it('still answers ? for a ship that was never scanned', () => {
    // The canon state this stands for: `sca sh <name>` assigns no letter, so a
    // pilot who has only done that has no letter for the target.
    expect(shipLetter(lettersFor(), 'someone-else:9')).toBe('?');
  });

  it('answers ? for an empty table rather than throwing', () => {
    expect(shipLetter([], shipKey(target.userid, target.shipno))).toBe('?');
    expect(shipLetter(undefined, shipKey(target.userid, target.shipno))).toBe('?');
  });
});
