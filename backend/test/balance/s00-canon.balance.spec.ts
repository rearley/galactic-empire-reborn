/**
 * The neutral-zone (sector 0,0) fixture must match the shipped S00P* blocks.
 *
 * GEMAIN.C:909-930 reads `s00plnum` planet entries out of the sysop option
 * database, eight options per entry (`#define NPL 8` at GEMAIN.C:905), in this
 * exact order: DEF (ynopt), NM, OWN, TYP, X, Y, ENV, RES. GEPLANET.C:497-528
 * then dispatches on `s00[i].type` -- 1 -> build_plan_1 (the weapons hub),
 * 2 -> build_plan_2 (the troops/men/food hub), 3 -> build_worm (a wormhole
 * portal), anything else -> build_other (a bare planet).
 *
 * The port's fixture was hand-authored -- five invented planets (Zygor-3,
 * Nexus Prime, Caldor IV, Minera, Draconis) at invented coordinates, with no
 * portals at all, and S00_PLNUM = 5 against a shipped S00PLNUM of 6. This test
 * re-parses MBMGEMSG.MSG itself rather than importing tools/extract-s00.mjs,
 * so a bug in the generator cannot hide behind a test that shares it.
 *
 * @see reference/ge-upstream/PROVENANCE.md
 * @see GEMAIN.C:476 s00plnum = numopt(S00PLNUM,3,9)
 * @see GEMAIN.C:909-930 the S00P* read loop
 * @see GEPLANET.C:497-528 type dispatch
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { S00, S00_PLNUM } from '../../src/game/galaxy/s00';
import { NEUTRAL_ZONE_OWNER } from '../../src/game/combat/neutral-zone';

const MSG = resolve(
  __dirname,
  '../../../reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG',
);

/**
 * The owner string the original shipped on every S00P*OWN block.
 *
 * The port stores NEUTRAL_ZONE_OWNER instead -- a sentinel that cannot collide
 * with a `usr_<hex>` player id, because this port resolves `userid` through a
 * real user table where C only ever printed the string.
 * @see src/game/combat/neutral-zone.ts
 */
const CANON_OWNER = '*EMPIRE*';

interface CanonEntry {
  defined: boolean;
  name: string;
  owner: string;
  type: number;
  xcoord: number;
  ycoord: number;
  env: number;
  res: number;
}

/** Pull the value out of an option block: `NAME {label: value} ...`. */
function readOption(text: string, id: string): string {
  const m = new RegExp(`^${id} \\{([^}]*)\\}`, 'm').exec(text);
  if (!m) throw new Error(`option ${id} not found in MBMGEMSG.MSG`);
  const inner = m[1];
  const c = inner.lastIndexOf(': ');
  const q = inner.lastIndexOf('? ');
  if (q > c) return inner.slice(q + 2).trim();
  if (c !== -1) return inner.slice(c + 2).trim();
  return inner.trim();
}

const text = readFileSync(MSG, 'utf8');

/** GEMAIN.C:476 -- numopt(S00PLNUM,3,9). */
const canonPlnum = Number(readOption(text, 'S00PLNUM'));

function canonEntry(n: number): CanonEntry {
  return {
    defined: readOption(text, `S00P${n}DEF`) === 'YES',
    name: readOption(text, `S00P${n}NM`),
    owner: readOption(text, `S00P${n}OWN`),
    type: Number(readOption(text, `S00P${n}TYP`)),
    // GEMAIN.C:922-925 -- the raw option is 100..9900 and is divided by 10000.
    xcoord: Number(readOption(text, `S00P${n}X`)) / 10000,
    ycoord: Number(readOption(text, `S00P${n}Y`)) / 10000,
    env: Number(readOption(text, `S00P${n}ENV`)),
    res: Number(readOption(text, `S00P${n}RES`)),
  };
}

describe('neutral-zone fixture matches the shipped S00P* blocks', () => {
  it('S00_PLNUM equals the shipped S00PLNUM', () => {
    expect(canonPlnum).toBe(6);
    expect(S00_PLNUM).toBe(canonPlnum);
    expect(S00).toHaveLength(canonPlnum);
  });

  for (let n = 1; n <= 6; n++) {
    describe(`planet #${n}`, () => {
      const canon = canonEntry(n);

      it('is defined in the shipped file', () => {
        expect(canon.defined).toBe(true);
      });

      it('matches name, type, coordinates, environment and resources', () => {
        const entry = S00[n - 1];
        expect(entry).toBeDefined();
        expect(entry.name).toBe(canon.name);
        expect(entry.type).toBe(canon.type);
        expect(entry.xcoord).toBeCloseTo(canon.xcoord, 10);
        expect(entry.ycoord).toBeCloseTo(canon.ycoord, 10);
        expect(entry.env).toBe(canon.env);
        expect(entry.res).toBe(canon.res);
      });

      it('carries the neutral-zone owner sentinel for the shipped *EMPIRE*', () => {
        expect(canon.owner).toBe(CANON_OWNER);
        expect(S00[n - 1].owner).toBe(NEUTRAL_ZONE_OWNER);
      });
    });
  }

  it('planet #7 onward is undefined in the shipped file', () => {
    for (let n = 7; n <= 9; n++) {
      expect(readOption(text, `S00P${n}DEF`)).toBe('NO');
    }
  });

  it('has exactly three type-3 wormhole portals', () => {
    // GEPLANET.C:517-520 -- s00[i].type == 3 dispatches to build_worm.
    expect(S00.filter((e) => e.type === 3).map((e) => e.name)).toEqual([
      'Kayriez Portal',
      'Lydorian Portal',
      'Tryklon Portal',
    ]);
  });

  it('repair depots are exactly planets 1 and 2', () => {
    // GECMDS.C:4500-4512 -- inside the neutral zone only plnum 1 or 2 will
    // repair; every other plnum prints MAINT4 and returns.
    expect(S00[0].name).toBe('Zygor');
    expect(S00[1].name).toBe('Tahanian Station');
    expect(S00[2].name).toBe('Enforcer Planet');
  });
});
