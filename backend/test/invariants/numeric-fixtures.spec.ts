import { fixtureNumbers } from './numeric-fixtures';

/**
 * The one rule for reading a number out of a fixture line.
 *
 * `fixture-domains.spec.ts` built its extractor inline as
 * `new RegExp(`\\b${field}:\\s*(-?\\d+)`)`, and `\d+` stops at an underscore.
 * `topspeed: 8_000` was therefore read as **8** — which is inside the canon
 * domain for topspeed, so the guard did not skip the fixture, it CERTIFIED it.
 * The guard exists because `topspeed: 8000` (a wrong unit) hid for 339 commits;
 * writing the same wrong value as `8_000` walked straight past it.
 */
describe('fixtureNumbers', () => {
  it('reads a plain integer', () => {
    expect(fixtureNumbers('topspeed: 8000,', 'topspeed')).toEqual([{ value: 8000, index: 0 }]); // domain-ok: notation example
  });

  // domain-ok: the literals below are EXAMPLES of the notation, not ship fixtures —
  // this is the one file where an out-of-domain topspeed is the subject.
  it('reads a separated integer whole, not just its leading digits', () => {
    expect(fixtureNumbers('topspeed: 8_000,', 'topspeed')).toEqual([{ value: 8000, index: 0 }]); // domain-ok: notation example
    expect(fixtureNumbers('topspeed: 30_000,', 'topspeed')).toEqual([{ value: 30000, index: 0 }]); // domain-ok: notation example
  });

  it('reads a negative', () => {
    expect(fixtureNumbers('xcoord: -12,', 'xcoord')).toEqual([{ value: -12, index: 0 }]);
  });

  it('reports the offset of each match so the scoped scan can resolve it', () => {
    const line = '{ a: 1, topspeed: 2_000, b: 3, topspeed: 4 }'; // domain-ok: notation example
    expect(fixtureNumbers(line, 'topspeed')).toEqual([
      { value: 2000, index: line.indexOf('topspeed: 2_000') }, // domain-ok: notation example
      { value: 4, index: line.lastIndexOf('topspeed: 4') }, // domain-ok: notation example
    ]);
  });

  it('does not match a field whose name merely ends with the one asked for', () => {
    expect(fixtureNumbers('maxtopspeed: 9,', 'topspeed')).toEqual([]);
  });

  it('ignores a value that is not an integer literal', () => {
    expect(fixtureNumbers('topspeed: someVariable,', 'topspeed')).toEqual([]);
  });
});
