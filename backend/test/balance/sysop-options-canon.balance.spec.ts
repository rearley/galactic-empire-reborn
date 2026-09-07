/**
 * Sysop option defaults must match the originals shipped in MBMGEMSG.MSG.
 *
 * This parses the original option database at test time and asserts that every
 * `SYSOP_OPTIONS[name].default` equals the value inside that option's braces.
 * Like the ship-class conformance test, it re-implements the parse rather than
 * importing tools/extract-sysop-options.mjs, so a bug in the generator cannot
 * hide behind a test that shares it.
 *
 * WHY THIS EXISTS. game-config.ts used to state that the option values "are
 * not part of the reference source, so there is nothing to recover", and that
 * "any value inside the bounds is legitimate". Both are false: MBMGEMSG.MSG is
 * the original's option database and ships a default for every option. Working
 * from that premise, 44 of 51 defaults were set by picking a clamp bound or
 * guessing -- 20 sat exactly ON a bound, in BOTH directions (HPDAMMAX at the
 * ceiling of 200 against a shipped 50; PFIRDST at the floor of 1 against 7).
 * That single unchallenged comment produced roughly a third of the findings in
 * docs/CANON_AUDIT_2026-09.md.
 *
 * A deliberate deviation is allowed, but it must be declared in DEVIATIONS
 * below with a reason and a docs/DECISIONS.md entry. Silence is not an option:
 * an undeclared difference fails.
 *
 * NOTE ON PRECEDENCE: where the .MSG's declared range disagrees with the
 * numopt()/lngopt() arguments in the C, the C wins -- it is what actually
 * clamped the value at boot. So this test checks DEFAULTS against the .MSG and
 * deliberately does not check min/max against it.
 *
 * @see reference/ge-upstream/PROVENANCE.md
 * @see GEMAIN.C:459-524
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SYSOP_OPTIONS } from '../../src/game/config/game-config';

const MSG = resolve(
  __dirname,
  '../../../reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG',
);

/**
 * Options we deliberately ship away from canon, in config/game.config.json.
 * Each needs a reason and a docs/DECISIONS.md entry. Keep this list SHORT --
 * an unexamined escape hatch is what let the original drift happen.
 */
const DEVIATIONS: Record<string, { value: number; reason: string }> = {
  UNIVMAX: {
    value: 100,
    reason:
      "Canon's 601x601 galaxy assumed a busy BBS; with a handful of concurrent " +
      'players they would never meet. Scan ranges are absolute, so galaxy size ' +
      'and scanner reach must be chosen together. See docs/DECISIONS.md.',
  },
  SCRFACT: {
    value: 100,
    reason:
      'Canon deducts 35% of the loser\'s score; this port has always deducted ' +
      '100%. It was never a decision — score.config.ts implemented the option ' +
      'privately as SCORE_F2 with a hardcoded default of 100, while SCRFACT sat ' +
      'in this table marked implemented:false, so setting it did nothing. The ' +
      'two halves were merged and the value KEPT, because changing it would ' +
      'retroactively revalue every kill in a live game. Declared here rather ' +
      'than left as an accident of a second code path. See docs/DECISIONS.md.',
  },
};

/**
 * Options MBMGEMSG.MSG does not declare; canonDefault is null for these.
 *
 * Empty, and it should stay that way. It held HYPDST1/HYPDST2 until
 * 2026-09-03, when it turned out we were reading GE/MSG/MBMGEMSG.MSG -- an
 * earlier partial snapshot with no HYPDST blocks. The shipped file declares
 * both (GE/REL:512, :522). Before adding a name here, check the OTHER copy.
 */
const NOT_IN_MSG: string[] = [];

function parseMsgDefaults(): Map<string, number> {
  const text = readFileSync(MSG, 'utf8');
  const out = new Map<string, number>();

  /** Value after the trailing `: ` or `? ` label. */
  const tail = (inner: string): string => {
    const c = inner.lastIndexOf(': ');
    const q = inner.lastIndexOf('? ');
    return (q > c ? inner.slice(q + 2) : c !== -1 ? inner.slice(c + 2) : inner).trim();
  };

  // Numeric options: NAME {label: value} N min max
  const numeric = /^([A-Z][A-Z0-9]*) \{([^}]*)\}[ \t]+N[ \t]+(-?\d+)[ \t]+(-?\d+)[ \t]*$/gm;
  for (let m = numeric.exec(text); m !== null; m = numeric.exec(text)) {
    const n = Number(tail(m[2]));
    if (Number.isFinite(n)) out.set(m[1], n);
  }

  // Boolean options: NAME {label? YES|NO} B. C reads these with ynopt, so they
  // are 0/1 on our side -- UNIVWRAP is one, and omitting the B form would have
  // left it silently unchecked.
  const bool = /^([A-Z][A-Z0-9]*) \{([^}]*)\}[ \t]+B[ \t]*$/gm;
  for (let m = bool.exec(text); m !== null; m = bool.exec(text)) {
    out.set(m[1], tail(m[2]) === 'YES' ? 1 : 0);
  }

  return out;
}

const msg = parseMsgDefaults();
const names = Object.keys(SYSOP_OPTIONS);

describe('MBMGEMSG.MSG is readable as the original option database', () => {
  it('parses a substantial number of numeric options', () => {
    expect(msg.size).toBeGreaterThan(100);
  });

  it('parses a known option exactly', () => {
    // MAXPLRS {The maximum players in the game at once: 30} N 1 256
    expect(msg.get('MAXPLRS')).toBe(30);
  });
});

describe('every declared option records the shipped default', () => {
  it.each(names)('%s carries a canonDefault', (name) => {
    const opt = SYSOP_OPTIONS[name as keyof typeof SYSOP_OPTIONS];
    if (NOT_IN_MSG.includes(name)) {
      expect(opt.canonDefault).toBeNull();
      return;
    }
    expect(msg.has(name)).toBe(true);
    expect(opt.canonDefault).toBe(msg.get(name));
  });
});

describe('every default IS canon, without exception', () => {
  // Deliberate tuning belongs in config/game.config.json, checked separately
  // below -- never in the defaults. Keeping the two apart is the point: the
  // default records what the original shipped, the config records what we
  // chose, and the difference between them stays visible.
  it.each(names.filter((n) => !NOT_IN_MSG.includes(n)))('%s', (name) => {
    const opt = SYSOP_OPTIONS[name as keyof typeof SYSOP_OPTIONS];
    expect(opt.default).toBe(msg.get(name)!);
  });
});

describe('canon defaults sit inside the C clamp bounds', () => {
  // If a shipped default falls outside the numopt() range we transcribed, one
  // of the two is wrong and the loader would silently clamp canon itself.
  it.each(names.filter((n) => !NOT_IN_MSG.includes(n)))('%s', (name) => {
    const opt = SYSOP_OPTIONS[name as keyof typeof SYSOP_OPTIONS];
    expect(opt.canonDefault).toBeGreaterThanOrEqual(opt.min);
    expect(opt.canonDefault).toBeLessThanOrEqual(opt.max);
  });
});

describe('config/game.config.json holds deviations, and only declared ones', () => {
  // The defaults above are canon. This file is the OTHER half: what we actually
  // deploy. It previously restated all 51 options -- 44 at values that were
  // never canon -- and silently overrode every correction made to the defaults.
  // Nothing checked it, so nothing could notice. This does.
  const raw = JSON.parse(
    readFileSync(resolve(__dirname, '../../config/game.config.json'), 'utf8'),
  ) as Record<string, unknown>;

  /** Flatten sections, skipping `_`-prefixed documentation keys. */
  const deployed = new Map<string, number>();
  for (const [key, section] of Object.entries(raw)) {
    if (key.startsWith('_')) continue;
    if (section && typeof section === 'object' && !Array.isArray(section)) {
      for (const [name, value] of Object.entries(section as Record<string, unknown>)) {
        if (name.startsWith('_')) continue;
        deployed.set(name, value as number);
      }
    }
  }

  it('every deployed option is a declared deviation', () => {
    for (const name of deployed.keys()) {
      expect(DEVIATIONS[name]).toBeDefined();
    }
  });

  it('every deployed option actually differs from canon', () => {
    // An entry equal to canon is noise that makes the file look authoritative
    // over values nobody chose -- exactly how the previous drift stayed hidden.
    for (const [name, value] of deployed) {
      expect(value).not.toBe(msg.get(name));
    }
  });

  it('every deployed option matches its declared value and carries a reason', () => {
    for (const [name, value] of deployed) {
      expect(value).toBe(DEVIATIONS[name].value);
      expect(DEVIATIONS[name].reason.length).toBeGreaterThan(40);
    }
  });

  it('every declared deviation is actually deployed', () => {
    // A stale declaration would license a future drift that nothing deploys.
    for (const name of Object.keys(DEVIATIONS)) {
      expect(deployed.has(name)).toBe(true);
    }
  });

  it('every deployed value is inside the C clamp bounds', () => {
    for (const [name, value] of deployed) {
      const opt = SYSOP_OPTIONS[name as keyof typeof SYSOP_OPTIONS];
      expect(value).toBeGreaterThanOrEqual(opt.min);
      expect(value).toBeLessThanOrEqual(opt.max);
    }
  });
});
