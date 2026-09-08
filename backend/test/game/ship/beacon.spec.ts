import { isPrintableBeacon, shouldAnnounceBeacon, BEACON_ODDS } from '../../../src/game/ship/beacon';

/**
 * Planet beacons were settable and invisible. `adm beacon <message>` wrote the
 * text and stored it; nothing ever showed it to a passing ship, so the admin
 * command advertised a feature that did nothing — worse than a missing one,
 * because it looks implemented.
 *
 * Canon (GEFUNCS.C:808-813):
 *
 *   if (samesect(&beacon[usrn].coord, &ptr->coord))
 *     if (beacon[usrn].beacon[0] != 0 && gernd()%10 == 0)
 *       prfmsg(BEAC01, beacon[usrn].plnum, beacon[usrn].beacon);
 *
 * and on sector load (GEMAIN.C:1813-1831) it validates the text is printable,
 * BLANKING the beacon outright if any character is not.
 */
describe('isPrintableBeacon', () => {
  it('accepts ordinary text', () => {
    expect(isPrintableBeacon('Trade welcome. No warships.')).toBe(true);
  });

  it('rejects a control character, as canon does', () => {
    // GEMAIN.C:1819 — `plptr->beacon[i] < ' ' || plptr->beacon[i] > '~'`.
    // Canon does not merely skip such a beacon, it BLANKS it: the check exists
    // to stop a terminal escape sequence reaching every ship in the sector.
    expect(isPrintableBeacon('hello\u001b[2Jworld')).toBe(false);
    expect(isPrintableBeacon('line\nbreak')).toBe(false);
    expect(isPrintableBeacon('tab\there')).toBe(false);
  });

  it('rejects characters above ~', () => {
    expect(isPrintableBeacon('caf\u00e9')).toBe(false);
  });

  it('treats empty as printable — it is simply no beacon', () => {
    expect(isPrintableBeacon('')).toBe(true);
  });
});

describe('shouldAnnounceBeacon', () => {
  it('is a 1-in-10 roll, matching gernd()%10 == 0', () => {
    expect(BEACON_ODDS).toBe(10);
    expect(shouldAnnounceBeacon({ next: () => 0 })).toBe(true);
    expect(shouldAnnounceBeacon({ next: () => 0.05 })).toBe(true);
    expect(shouldAnnounceBeacon({ next: () => 0.15 })).toBe(false);
    expect(shouldAnnounceBeacon({ next: () => 0.99 })).toBe(false);
  });

  it('does not fire on every tick — the point is an occasional hail', () => {
    // A beacon on every 1s tick would be spam, not atmosphere.
    let hits = 0;
    for (let i = 0; i < 1000; i++) {
      if (shouldAnnounceBeacon({ next: () => i / 1000 })) hits++;
    }
    expect(hits).toBeGreaterThan(50);
    expect(hits).toBeLessThan(150);
  });
});
