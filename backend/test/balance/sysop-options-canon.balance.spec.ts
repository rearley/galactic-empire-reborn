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
  '../../../reference/ge-upstream/mbmgemp/GE/MSG/MBMGEMSG.MSG',
);

/**
 * Options we deliberately ship away from canon. Each needs a reason and a
 * docs/DECISIONS.md entry. Keep this list SHORT -- it is the escape hatch that
 * let the original drift happen.
 */
const DEVIATIONS: Record<string, { value: number; reason: string }> = {};

/** Options MBMGEMSG.MSG does not declare; canonDefault is null for these. */
const NOT_IN_MSG = ['HYPDST1', 'HYPDST2'];

function parseMsgDefaults(): Map<string, number> {
  const text = readFileSync(MSG, 'utf8');
  const out = new Map<string, number>();
  const re = /^([A-Z][A-Z0-9]*) \{([^}]*)\}[ \t]+N[ \t]+(-?\d+)[ \t]+(-?\d+)[ \t]*$/gm;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const inner = m[2];
    const c = inner.lastIndexOf(': ');
    const q = inner.lastIndexOf('? ');
    const raw = (q > c ? inner.slice(q + 2) : c !== -1 ? inner.slice(c + 2) : inner).trim();
    const n = Number(raw);
    if (Number.isFinite(n)) out.set(m[1], n);
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

describe('defaults match canon unless a deviation is declared', () => {
  it.each(names.filter((n) => !NOT_IN_MSG.includes(n)))('%s', (name) => {
    const opt = SYSOP_OPTIONS[name as keyof typeof SYSOP_OPTIONS];
    const canon = msg.get(name)!;
    const dev = DEVIATIONS[name];
    if (dev) {
      expect(opt.default).toBe(dev.value);
      expect(dev.reason.length).toBeGreaterThan(20);
      return;
    }
    expect(opt.default).toBe(canon);
  });

  it('declares no deviation that is actually equal to canon', () => {
    // A stale entry here would mask a future real drift.
    for (const [name, dev] of Object.entries(DEVIATIONS)) {
      expect(dev.value).not.toBe(msg.get(name));
    }
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
