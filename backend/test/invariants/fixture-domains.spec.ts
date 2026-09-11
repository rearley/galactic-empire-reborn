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
 *
 * GAP — a bare field name is not a domain. `percent` is `ShipState.percent`
 * (the `imp` throttle, GECMDS.C:509 `valpcnt(margv[1],0,99)`) in most
 * fixtures, but the SAME name is also `ShipShieldChargeEvent.percent` and
 * `CombatPhaserFiredEvent.percent` — a shield/phaser charge level, 0-100
 * (GEFUNCS.C:2513 `wptr->shield += (type*3);`). Keying on the name alone made a canon-correct
 * `percent: 100` shield fixture fail, and it would have let a canon-incorrect
 * `percent: 150` shield fixture pass had nobody happened to name a field
 * `percent` for it. Both are wrong for the same reason: the rule was checking
 * a NAME instead of a TYPE.
 *
 * Fields with exactly one canon domain stay in `DOMAINS`, checked by name as
 * before. A field whose meaning depends on which object it lives in moves to
 * `SCOPED_DOMAINS`: each candidate domain there carries a `scope` pattern that
 * must appear in the value's own object literal (or an ancestor literal, for
 * a fixture built as `makeShip({ percent: 0, ... })` where the type-bearing
 * fields sit in the base object, not the override) before that candidate may
 * claim the occurrence. An occurrence that scopes to zero or to more than one
 * candidate is reported, not guessed at — that keeps this file honest about
 * what it actually knows, per the file-header rule.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { maskComments } from './mask-comments';

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
};

interface ScopedCandidate extends Domain {
  /** A human label for this candidate, distinct from the field name, used in
   * offender messages so a failure says WHICH domain rejected the value. */
  label: string;
  /** Must appear in the enclosing object literal (see `resolveScope` below)
   * for this candidate to claim an occurrence of the field. */
  scope: RegExp;
}

// `ShipState` fixtures in this suite are built either inline or via a
// `makeShip`/`buildShip*`-style factory, but every one of them — base object
// or override — ends up carrying at least one of these ShipState-only field
// names somewhere in its literal. None of these names collides with the
// event types below.
const SHIP_STATE_SCOPE =
  /\b(shpclass|speed2b|head2b|phasrtype|shieldtype|topspeed|xcoord|ycoord|cybmine|cybskill|ltorpsChannel|holdcourse|minesnear|hypha)\s*:/;

// `ShipShieldChargeEvent` (shield-events.ts) and `CombatPhaserFiredEvent`
// (combat-events.ts) are the two event shapes that also carry `percent`.
// Neither is a ShipState, and both are recognisable by fields ShipState does
// not have.
const CHARGE_EVENT_SCOPE = /\b(shipId|bearing|hyper)\s*:|kind:\s*'(?:charging|full)'/;

const SCOPED_DOMAINS: Record<string, ScopedCandidate[]> = {
  percent: [
    {
      // `imp <0-99>`. @see GECMDS.C:509 `valpcnt(margv[1],0,99)`
      label: 'percent — ShipState.percent (imp)',
      min: 0,
      max: 99,
      why: 'GECMDS.C:509 `valpcnt(margv[1],0,99)`',
      scope: SHIP_STATE_SCOPE,
    },
    {
      // @see GEFUNCS.C:2513 `wptr->shield += (type*3);` — the shield charge ramp
      label: 'percent — shield/phaser charge event (ShipShieldChargeEvent / CombatPhaserFiredEvent)',
      min: 0,
      max: 100,
      why: 'GEFUNCS.C:2513 `wptr->shield += (type*3);` — shield charge is 0-100, not the imp 0-99',
      scope: CHARGE_EVENT_SCOPE,
    },
  ],
};

/**
 * The object literal enclosing a character offset, found by counting braces
 * outward from it. Returns the literal's own text and the offset of its `{`,
 * so a caller can step one level further out when the immediate literal does
 * not settle the question (a `makeShip({ percent: 0 })` override literal, for
 * instance, does not itself repeat `shpclass`).
 */
function enclosingLiteral(text: string, offset: number): { text: string; start: number } | null {
  let depth = 0;
  let start = -1;
  for (let i = offset; i >= 0; i--) {
    const c = text[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start === -1) return null;
  depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  return { text: text.slice(start, end + 1), start };
}

/** How many enclosing literals to try before giving up on scoping an occurrence. */
const MAX_SCOPE_HOPS = 6;

/**
 * Which of `candidates` claims the field occurrence at `offset`, walking
 * outward through enclosing object literals until exactly one candidate's
 * `scope` matches. Zero or more-than-one matches (checked at the SAME hop,
 * so a literal that happens to carry both kinds of marker is caught too) is
 * reported as `null` — the caller must not guess.
 *
 * Two further properties of this search are deliberate, and both are
 * load-bearing:
 *
 * **It commits to the FIRST hop that resolves.** An outer hop is never
 * consulted once an inner one has matched exactly one candidate. That is what
 * makes a nested override literal bind to the type it sits inside rather than
 * to whatever encloses it. The cost: a bare `percent` override nested inside a
 * literal carrying an event marker binds to the event domain even if the value
 * semantically belongs to the ship built by an outer factory. No such fixture
 * exists today — every one of the current occurrences resolves unambiguously —
 * but if one appears, it binds to the wider domain and a genuinely
 * out-of-range value slips through. Prefer writing the type marker into the
 * same literal as the value over relying on the walk.
 *
 * **It fails CLOSED.** Zero matches and more-than-one match both return null,
 * and a null scope is reported as an offender rather than skipped. A new or
 * ambiguous fixture therefore breaks this test and forces someone to extend
 * the scope patterns deliberately. When that happens, extend the markers to
 * describe the new type — do NOT loosen an existing marker regex until it
 * happens to match, which converts a loud failure into a silent blind spot.
 */
function resolveScope(text: string, offset: number, candidates: ScopedCandidate[]): ScopedCandidate | null {
  let literal = enclosingLiteral(text, offset);
  for (let hop = 0; literal && hop < MAX_SCOPE_HOPS; hop++) {
    const hits = candidates.filter((c) => c.scope.test(literal!.text));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
    literal = enclosingLiteral(text, literal.start - 1);
  }
  return null;
}

function specFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return specFiles(p);
    return /\.spec\.ts$/.test(e) ? [p] : [];
  });
}

/**
 * The text a scan should look at, and the text a `domain-ok:` marker lives in.
 *
 * Values are matched against the COMMENT-MASKED source, so prose describing a
 * banned value is no longer indistinguishable from a fixture holding one. The
 * marker is matched against the ORIGINAL, because the marker is itself written
 * in a comment and masking would erase it.
 *
 * This file used to exempt itself from the scan — its own header has to name
 * the value it exists to ban — and every other file in the suite had the same
 * need with no exemption. Masking removes the need, so the exemption is gone
 * and the guard finally scans itself. @see issue #13
 */
function readForScan(f: string): { masked: string; maskedLines: string[]; rawLines: string[] } {
  const text = readFileSync(f, 'utf8');
  const masked = maskComments(text);
  return { masked, maskedLines: masked.split('\n'), rawLines: text.split('\n') };
}

describe('test fixtures hold values a real ship could hold', () => {
  const files = specFiles(TEST_ROOT);

  it('finds the specs at all (guards the scanner itself)', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it.each(Object.entries(DOMAINS))('%s stays inside its canon domain', (field, domain) => {
    const offenders: string[] = [];
    for (const f of files) {
      const { maskedLines, rawLines } = readForScan(f);
      for (let i = 0; i < maskedLines.length; i++) {
        for (const m of maskedLines[i].matchAll(new RegExp(`\\b${field}:\\s*(-?\\d+)`, 'g'))) {
          const v = Number(m[1]);
          if (v >= domain.min && v <= domain.max) continue;
          // Deliberate? It has to say so, here or on the line above.
          if (/domain-ok:/.test(rawLines[i]) || /domain-ok:/.test(rawLines[i - 1] ?? '')) continue;
          offenders.push(`${f.slice(TEST_ROOT.length + 1)}:${i + 1} → ${field}: ${v}`);
        }
      }
    }
    expect([domain.why, offenders]).toEqual([domain.why, []]);
  });

  it.each(Object.entries(SCOPED_DOMAINS))(
    '%s stays inside whichever canon domain its own type claims',
    (field, candidates) => {
      const offenders: string[] = [];
      for (const f of files) {
        const { masked, maskedLines, rawLines } = readForScan(f);
        let runningOffset = 0;
        for (let i = 0; i < maskedLines.length; i++) {
          const line = maskedLines[i];
          for (const m of line.matchAll(new RegExp(`\\b${field}:\\s*(-?\\d+)`, 'g'))) {
            const v = Number(m[1]);
            const offset = runningOffset + m.index!;
            const domain = resolveScope(masked, offset, candidates);
            const rel = `${f.slice(TEST_ROOT.length + 1)}:${i + 1}`;
            if (!domain) {
              // Not a domain violation — a SCOPING gap. Extend SHIP_STATE_SCOPE
              // or CHARGE_EVENT_SCOPE (or add a new candidate) rather than
              // guessing which one this occurrence means.
              offenders.push(`${rel} → ${field}: ${v} did not scope to exactly one known domain`);
              continue;
            }
            if (v >= domain.min && v <= domain.max) continue;
            // Deliberate? It has to say so, here or on the line above.
            if (/domain-ok:/.test(rawLines[i]) || /domain-ok:/.test(rawLines[i - 1] ?? '')) continue;
            offenders.push(`${rel} → ${domain.label}: ${v}`);
          }
          runningOffset += line.length + 1;
        }
      }
      const whys = candidates.map((c) => c.why).join(' / ');
      expect([whys, offenders]).toEqual([whys, []]);
    },
  );
});
