/**
 * T060 — Balance constant pin enumeration.
 *
 * Parses every gameplay-affecting `#define` from `reference/ge-source/GEMAIN.H`
 * and asserts each one is pinned in `backend/src/game/constants.ts` with the
 * correct value.  Also asserts the reverse: every entry in `GEMAIN_GAMEPLAY_PINS`
 * appears in GEMAIN.H with the same value, so neither side can silently drift.
 *
 * Exclusion list — hard-coded below and comment-justified.  These defines are
 * present in GEMAIN.H but are NOT gameplay-balance constants:
 *
 *   TRUE / FALSE         — boolean aliases, not gameplay constants
 *   GETRAINER            — runtime trainer mode flag
 *   GELOOKUP..GEGETNOW   — BTRIEVE record-access operation codes
 *   PI                   — math constant, not a game-balance value
 *   SNMSIZ               — ship-name buffer size (I/O)
 *   GEMSGSIZ             — message buffer size (I/O)
 *   FIXEDMSGSIZ          — fixed-message buffer (I/O)
 *   BEACONMSGSZ          — beacon string buffer (I/O)
 *   NOSCANTAB            — scantab slot count (I/O buffer)
 *   MAXTEAMS             — team table size (I/O buffer)
 *   METHOD               — I/O access method code
 *   SEED                 — Btrieve key seed string (I/O)
 *   KEY                  — Btrieve key literal (I/O)
 *   FUNC                 — compiler _export directive
 *   GESTAT_AVAIL/USER/AUTO — ship status codes (operation codes, not balance values)
 *   CLASSTYPE_USER..NONE — ship category codes (operation codes)
 *   MAIL_CLASS_*         — mail category codes
 *   ALWAYS/FILTER/BLOCK  — output filter mode codes
 *   HOMEY / CLEAR        — ANSI cursor-home codes
 *   SCANNAMES..DUMMY2    — User.options[] byte-index constants (indices, not balance values)
 *   I_MEN..I_SPY         — item-index constants (indices, not balance values)
 *   SHIELDUP/DN/DM       — shield state codes
 *   CYB_GO_WARP          — Cybertron AI movement flag
 *   CYB_TOUGH_0/1        — Cybertron toughness level codes
 *   NEUTRAL_X/Y          — origin coordinates, not a balance constant
 *   SSMAX                — sector-space coordinate maximum (same as UNIVMAX*2 scaled)
 *
 * @see GEMAIN.H gameplay-affecting constants
 * @see backend/src/game/constants.ts GEMAIN_GAMEPLAY_PINS
 */

import * as fs from 'fs';
import * as path from 'path';
import { GEMAIN_GAMEPLAY_PINS } from '../../src/game/constants';

const GEMAIN_H_PATH = path.resolve(__dirname, '../../..', 'reference/ge-source/GEMAIN.H');

/** Constants present in GEMAIN.H that are NOT gameplay-balance values. */
const EXCLUDED: ReadonlySet<string> = new Set([
  'TRUE', 'FALSE',
  'GETRAINER',
  'GELOOKUP', 'GEADD', 'GEDELETE', 'GEUPDATE', 'GEGET', 'GENEXT', 'GELOOKUPNAME', 'GEGETNOW',
  'PI',
  'SNMSIZ',
  'GEMSGSIZ', 'FIXEDMSGSIZ', 'BEACONMSGSZ',
  'NOSCANTAB', 'MAXTEAMS',
  'METHOD',
  'GESTAT_AVAIL', 'GESTAT_USER', 'GESTAT_AUTO', 'GESTAT_IDLE',
  'SHOWDOC', 'RNDDOC',
  'CLASSTYPE_USER', 'CLASSTYPE_CYBORG', 'CLASSTYPE_DROID', 'CLASSTYPE_NONE',
  'MAIL_CLASS_DISTRESS', 'MAIL_CLASS_MAXOUT', 'MAIL_CLASS_PRODRPT', 'MAIL_CLASS_GAMESTATS', 'MAIL_CLASS_PLSTATS',
  'ALWAYS', 'FILTER', 'BLOCK',
  'HOMEY', 'CLEAR',
  'SCANNAMES', 'SCANHOME', 'SCANFULL', 'MSG_FILTER', 'DUMMY1', 'DUMMY2',
  'I_MEN', 'I_MISSILE', 'I_TORPEDO', 'I_IONCANNON', 'I_FLUXPOD', 'I_FOOD',
  'I_FIGHTER', 'I_DECOYS', 'I_TROOPS', 'I_ZIPPERS', 'I_JAMMERS', 'I_MINE', 'I_GOLD', 'I_SPY',
  'SHIELDUP', 'SHIELDDN', 'SHIELDDM',
  'CYB_GO_WARP', 'CYB_TOUGH_0', 'CYB_TOUGH_1',
  'NEUTRAL_X', 'NEUTRAL_Y',
  'SSMAX',
]);

/**
 * Parse GEMAIN.H and return a map of { NAME -> number } for every
 * non-excluded `#define NAME <int|float>` line.
 */
function parseGemainH(): Map<string, number> {
  const src = fs.readFileSync(GEMAIN_H_PATH, 'utf-8');
  const result = new Map<string, number>();

  for (const rawLine of src.split('\n')) {
    const line = rawLine.trim();

    // Must be a #define
    if (!line.startsWith('#define')) continue;

    // Strip C comment suffix so we only parse the tokens
    const noComment = line.replace(/\/\*.*/, '').trim();

    // Tokenize: ['#define', 'NAME', 'VALUE']
    const tokens = noComment.split(/\s+/);
    if (tokens.length < 3) continue;

    const name = tokens[1];
    const rawValue = tokens[2].replace(/[ULul]+$/, ''); // strip C type suffixes

    // Skip excluded names
    if (EXCLUDED.has(name)) continue;

    // Skip if value is not a plain number (could be a macro expression or string)
    const value = parseFloat(rawValue);
    if (isNaN(value)) continue;

    result.set(name, value);
  }

  return result;
}

describe('T060 — GEMAIN.H ↔ TS balance constant pins', () => {
  let gemainDefines: Map<string, number>;

  beforeAll(() => {
    gemainDefines = parseGemainH();
    expect(gemainDefines.size).toBeGreaterThan(10); // sanity: parser must find at least 10 constants
  });

  it('GEMAIN_GAMEPLAY_PINS is exported from constants.ts', () => {
    expect(GEMAIN_GAMEPLAY_PINS).toBeDefined();
    expect(typeof GEMAIN_GAMEPLAY_PINS).toBe('object');
  });

  it('every gameplay #define in GEMAIN.H is in GEMAIN_GAMEPLAY_PINS with the correct value', () => {
    const mismatches: string[] = [];
    const missing: string[] = [];

    for (const [name, cValue] of gemainDefines) {
      if (!(name in GEMAIN_GAMEPLAY_PINS)) {
        missing.push(`${name} (C value: ${cValue})`);
      } else if (GEMAIN_GAMEPLAY_PINS[name] !== cValue) {
        mismatches.push(`${name}: TS=${GEMAIN_GAMEPLAY_PINS[name]} C=${cValue}`);
      }
    }

    expect(missing).toEqual([]);
    expect(mismatches).toEqual([]);
  });

  it('every entry in GEMAIN_GAMEPLAY_PINS exists in GEMAIN.H with the same value', () => {
    const mismatches: string[] = [];
    const notInC: string[] = [];

    for (const [name, tsValue] of Object.entries(GEMAIN_GAMEPLAY_PINS)) {
      if (!gemainDefines.has(name)) {
        notInC.push(`${name} (TS value: ${tsValue})`);
      } else if (gemainDefines.get(name) !== tsValue) {
        mismatches.push(`${name}: TS=${tsValue} C=${gemainDefines.get(name)}`);
      }
    }

    expect(notInC).toEqual([]);
    expect(mismatches).toEqual([]);
  });
});

import { PDAMMAX, PFIRDST, TORFACT, MISFACT, SE100DAM, PHATOWRP, MAXSHIPS } from '../../src/game/constants';

describe('combat balance constants (Plan 1)', () => {
  /**
   * These are sysop OPTIONS, not GEMAIN.H defines — C supplies only the bounds
   * via numopt (GEMAIN.C:463, 493, 494, 598), and the deployment picks a value
   * in `config/game.config.json`. Pinning the deployed number froze a knob the
   * original exists to expose: tuning PFIRDST from 1 to 3 to stop Sartern
   * Obliterators one-shotting starter hulls from five sectors broke this test,
   * which is the opposite of what a balance guard should do.
   *
   * What is worth guarding is that every value stays inside C's range, so a
   * typo in the config file is caught rather than clamped silently.
   */
  it('keeps phaser, lock and self-zap options inside C\'s ranges', () => {
    expect(PDAMMAX).toBeGreaterThanOrEqual(1);
    expect(PDAMMAX).toBeLessThanOrEqual(200);      // numopt(PDAMMAX,1,200)
    expect(PFIRDST).toBeGreaterThanOrEqual(1);
    expect(PFIRDST).toBeLessThanOrEqual(20);       // numopt(PFIRDST,1,20)
    expect(SE100DAM).toBeGreaterThanOrEqual(1);
    expect(SE100DAM).toBeLessThanOrEqual(101);     // numopt(SE100DAM,1,101)
    expect(PHATOWRP).toBeGreaterThanOrEqual(0);
    expect(PHATOWRP).toBeLessThanOrEqual(100);     // numopt(PHATOWRP,0,100)
    // TORFACT/MISFACT are NOT sysop options — these stay pinned.
    expect(TORFACT).toBeCloseTo(0.1, 10);
    expect(MISFACT).toBeCloseTo(0.1, 10);
  });
});

import { MAXSHIPS as _MAXSHIPS } from '../../src/game/constants';

describe('multi-ship constants (030)', () => {
  it('pins MAXSHIPS default (P-007)', () => {
    expect(_MAXSHIPS).toBe(10);
  });
});
