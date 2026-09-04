/**
 * A test fixture may not SILENTLY contain a value no real ship could hold.
 *
 * This is the guard for the failure that hid the Cybertron movement bug for
 * 339 commits. `createSpawn` never wrote `topspeed`, so every Cybertron in the
 * live galaxy had Prisma's `@default(0)` and could not move. Nine specs hand-
 * built a ShipState with `topspeed: 8000` already set, so the AI was always
 * tested against a ship carrying the field production never wrote — and
 * carrying it in the WRONG UNIT, since `topspeed` is a warp factor (real ships
 * have 8, 10, 15) and 8000 means eight million raw units a tick.
 *
 * Nothing asserted how far a Cybertron travelled, only that the logic ran, so
 * 4,600 tests passed against a ship that cannot exist. Correcting all twenty
 * occurrences to 8 changed no test outcome whatsoever, which is the proof that
 * the value was never load-bearing — it was just noise, and the noise hid a bug.
 *
 * The domains below come from canon, not from taste. A test that deliberately
 * uses an out-of-domain value — proving a bound is enforced, or that an invalid
 * class is rejected — is legitimate and declares itself with a `domain-ok:`
 * comment on the line or the line above. The requirement is not that fixtures
 * are always in range; it is that going out of range is a conscious act with a
 * reason attached, rather than a number nobody looked at.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TEST_ROOT = resolve(__dirname, '..');

interface Domain {
  min: number;
  max: number;
  why: string;
}

const DOMAINS: Record<string, Domain> = {
  // S**WARP {Maximum Warp: n} ... N 0 255 — a warp FACTOR, not raw units.
  // @see GE/REL/MBMGESHP.MSG:4694 (S21WARP), GEFUNCS.C:278
  topspeed: { min: 0, max: 255, why: 'warp factor, S**WARP is `N 0 255`' },
  // 0 means none fitted; 1..19 are the purchasable marks (GEMAIN.H:201, :203);
  // 20 is the SYSOP type and is real, not a boundary probe — a type-20 phaser
  // is fixed at 101 damage and a type-20 shield sets `dmax = 0`, i.e.
  // impenetrable (GEFUNCS.C:2445, :2479, :2508). Reading TOPPHASOR 19 as the
  // hard ceiling is a mistake this guard made first time out, and it broke
  // three suites that were correct.
  phasrtype: { min: 0, max: 20, why: 'GEMAIN.H:203 TOPPHASOR 19, plus the sysop type 20' },
  shieldtype: { min: 0, max: 20, why: 'GEMAIN.H:201 TOPSHIELD 19, plus the sysop type 20' },
  // 41 slots in MBMGESHP.MSG; our classNumber is 1-based.
  shpclass: { min: 0, max: 41, why: 'MBMGESHP.MSG ships 41 class slots' },
  // The 1 -> 2 -> 10 charge ramp, and NEGATIVE is the damaged device:
  // `ptr->cloak = 0 - (int)rndm((ptr->damage+10.0))` (GEFUNCS.C:2026), read
  // back as `if (ptr->cloak < 0)` (:1388). The first version of this guard
  // banned negatives and was wrong about canon, not about the fixtures.
  cloak: { min: -200, max: 10, why: 'GEFUNCS.C:2026 damaged cloak is negative' },
  // `imp <0-99>`. @see GECMDS.C:509 valpcnt(margv[1],0,99)
  percent: { min: 0, max: 99, why: 'GECMDS.C:509 valpcnt(...,0,99)' },
};

function specFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return specFiles(p);
    // This file's own prose quotes the bad value it exists to ban.
    if (e === 'fixture-domains.spec.ts') return [];
    return /\.spec\.ts$/.test(e) ? [p] : [];
  });
}

describe('test fixtures hold values a real ship could hold', () => {
  const files = specFiles(TEST_ROOT);

  it('finds the specs at all (guards the scanner itself)', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it.each(Object.entries(DOMAINS))('%s stays inside its canon domain', (field, domain) => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const m of lines[i].matchAll(new RegExp(`\\b${field}:\\s*(-?\\d+)`, 'g'))) {
          const v = Number(m[1]);
          if (v >= domain.min && v <= domain.max) continue;
          // Deliberate? It has to say so, here or on the line above.
          if (/domain-ok:/.test(lines[i]) || /domain-ok:/.test(lines[i - 1] ?? '')) continue;
          offenders.push(`${f.slice(TEST_ROOT.length + 1)}:${i + 1} → ${field}: ${v}`);
        }
      }
    }
    expect([domain.why, offenders]).toEqual([domain.why, []]);
  });
});
