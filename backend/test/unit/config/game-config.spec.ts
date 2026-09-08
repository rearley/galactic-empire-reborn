/**
 * Sysop option registry + loader.
 *
 * The original exposed 51 tunables through `numopt(NAME, min, max)` read at
 * boot from a sysop `.cnf` (GEMAIN.C:459-524). The value itself is NOT canon —
 * it was each sysop's taste — but the CLAMP BOUNDS are: a value outside them is
 * one the original could never produce.
 *
 * That distinction is the point of centralising this. Three defects this
 * session (TDAMMAX 200 vs a ceiling of 100, MDAMMAX 300 vs 100, JAMTIME 20 vs
 * 10) were values the original cannot generate, and each was caught only by
 * writing a test after the fact. Routing every option through one clamped
 * loader makes an out-of-bounds value structurally impossible instead.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SYSOP_OPTIONS, loadGameConfig, flattenConfigFile, resolveGameConfig } from '../../../src/game/config/game-config';

describe('sysop option registry', () => {
  it('declares every numopt/lngopt option found in the C source', () => {
    // 52 since PLANTOCK joined them -- an lngopt (GEMAIN.C:469) held in
    // MINUTES, previously a hard-coded 1800 seconds under a comment calling 30
    // minutes canonical, where canon ships 360. 53 since UNIVWRAP joined, a
    // ynopt (GEMAIN.C:475) that had no representation at all while the port
    // unconditionally wrapped.
    expect(Object.keys(SYSOP_OPTIONS)).toHaveLength(53);
  });

  it('records the C clamp bounds for each option', () => {
    for (const [name, spec] of Object.entries(SYSOP_OPTIONS)) {
      expect(typeof spec.min).toBe('number');
      expect(typeof spec.max).toBe('number');
      expect(spec.min).toBeLessThanOrEqual(spec.max);
      expect(spec.cReference).toMatch(/^GEMAIN\.C:\d+$/);
      expect(name).toMatch(/^[A-Z0-9_]+$/);
    }
  });

  it('every default sits inside its own bounds', () => {
    for (const [name, spec] of Object.entries(SYSOP_OPTIONS)) {
      expect(spec.default).toBeGreaterThanOrEqual(spec.min);
      expect(spec.default).toBeLessThanOrEqual(spec.max);
      expect(name).toBeTruthy();
    }
  });

  it('pins the bounds that were violated before this existed', () => {
    expect(SYSOP_OPTIONS.TDAMMAX.max).toBe(100);
    expect(SYSOP_OPTIONS.MDAMMAX.max).toBe(100);
    expect(SYSOP_OPTIONS.JAMTIME.max).toBe(10);
    expect(SYSOP_OPTIONS.PDAMMAX.max).toBe(200);
  });
});

describe('loadGameConfig', () => {
  it('returns the declared defaults when given nothing', () => {
    const cfg = loadGameConfig({ file: {}, env: {} });
    expect(cfg.PDAMMAX).toBe(SYSOP_OPTIONS.PDAMMAX.default);
    expect(cfg.TDAMMAX).toBe(SYSOP_OPTIONS.TDAMMAX.default);
  });

  it('applies file values over defaults', () => {
    const cfg = loadGameConfig({ file: { PDAMMAX: 40 }, env: {} });
    expect(cfg.PDAMMAX).toBe(40);
  });

  it('lets env override the file — docker-compose must win', () => {
    const cfg = loadGameConfig({ file: { PDAMMAX: 40 }, env: { PDAMMAX: '55' } });
    expect(cfg.PDAMMAX).toBe(55);
  });

  it('CLAMPS above the maximum instead of accepting an impossible value', () => {
    // This is the TDAMMAX=200 defect, now structurally prevented.
    const cfg = loadGameConfig({ file: { TDAMMAX: 200 }, env: {} });
    expect(cfg.TDAMMAX).toBe(100);
  });

  it('clamps below the minimum too', () => {
    const cfg = loadGameConfig({ file: { JAMTIME: 0 }, env: {} });
    expect(cfg.JAMTIME).toBe(1);
  });

  it('reports what it clamped, so a bad config is visible rather than silent', () => {
    const { warnings } = loadGameConfig({ file: { TDAMMAX: 200 }, env: {} }, { collectWarnings: true });
    expect(warnings.join(' ')).toMatch(/TDAMMAX/);
    expect(warnings.join(' ')).toMatch(/200/);
    expect(warnings.join(' ')).toMatch(/100/);
  });

  it('rejects an unknown option rather than ignoring a typo', () => {
    expect(() => loadGameConfig({ file: { PDAMMMAX: 40 }, env: {} })).toThrow(/PDAMMMAX/);
  });

  it('rejects a non-numeric value', () => {
    expect(() => loadGameConfig({ file: { PDAMMAX: 'lots' as unknown as number }, env: {} })).toThrow(/PDAMMAX/);
  });

  it('ignores unrelated environment variables', () => {
    const cfg = loadGameConfig({ file: {}, env: { PATH: '/usr/bin', NODE_ENV: 'test' } });
    expect(cfg.PDAMMAX).toBe(SYSOP_OPTIONS.PDAMMAX.default);
  });

  it('names exactly the options that back no gameplay code', () => {
    // A NAMED list, not a count. The flag was hand-maintained against a bare
    // number and drifted badly: an audit on 2026-09-03 found 14 of the 24
    // options marked `implemented: false` were in fact fully wired
    // (PLODDS/WORMODDS in galaxy.config, TEAMMAX in team.service, the five
    // PLATTR* in planet-attack.service, CHGLOSER and MAILDAYS in
    // midnight.config, TOOCLOSE/CYBGOLD in cybertron.config, CLENGUSE in
    // cloak.config, SCRBONUS in player-score.service), and the count test
    // could not have caught it because the total never moved.
    //
    // That audit still missed SCRFACT, and could not have found it by this
    // method: it WAS wired, in score.config.ts, but under a private SCORE_F2
    // environment variable with its own hardcoded default. A search for the
    // option's own name found nothing. Merging the two config systems is what
    // surfaced it. @see docs/DECISIONS.md
    const unwired = Object.entries(SYSOP_OPTIONS)
      .filter(([, s]) => !s.implemented)
      .map(([n]) => n)
      .sort();
    // HYPDST1/HYPDST2 left this list on 2026-09-08. They were the subtlest
    // kind of dead option: cybertron.config.ts hard-coded 25 and 10, which are
    // canon's own values, so no behaviour was ever wrong and nothing a player
    // could see would have exposed them. They simply did not respond to being
    // set. The five that remain are not fixable — each configures something a
    // web port has no equivalent for, and NUMSHIPS only SIZES a C array
    // (`nships = nterms + numships`) with no runtime gate behind it, so
    // "implementing" it would mean inventing a limit canon does not have.
    expect(unwired).toEqual([
      'FREEBIES', 'MAXPLREC', 'NUMSHIPS', 'S00PLNUM', 'SHOWOPT',
    ]);
  });

  it('every unwired option explains itself', () => {
    for (const [name, spec] of Object.entries(SYSOP_OPTIONS)) {
      if (spec.implemented) continue;
      expect({ name, note: spec.note ?? '' }.note.length).toBeGreaterThan(30);
    }
  });

  describe('the flag is checked against the source tree, not trusted', () => {
    // The strongest available test: read every .ts under src/, strip comments,
    // and look for a real reference to the constant each option backs. A flag
    // can now only be wrong if someone writes a matching identifier and never
    // uses it, which is a far narrower failure than "nobody updated a number".
    const SRC = path.resolve(__dirname, '../../../src');
    const EXCLUDED = [
      path.join(SRC, 'game', 'constants.ts'),        // the re-export shim itself
      path.join(SRC, 'game', 'config', 'game-config.ts'),
    ];

    /**
     * Generated canon DATA is not a live reference. `canon-messages.generated.ts`
     * carries all 834 ids from MBMGEMSG.MSG, and canon's option names (SHOWOPT,
     * PLTVCASH ...) are message ids in that file too — so a bare string match
     * there reads as "the option is used" when it is only quoted.
     */
    const isGenerated = (f: string) => f.endsWith('.generated.ts');

    function walk(dir: string, out: string[] = []): string[] {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, out);
        else if (e.name.endsWith('.ts') && !EXCLUDED.includes(full) && !isGenerated(full)) out.push(full);
      }
      return out;
    }

    /** Source with block and line comments removed, so prose cannot vouch for a flag. */
    const code = walk(SRC)
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

    const symbolFor = (name: string, spec: unknown): string =>
      (spec as { constant?: string }).constant ?? name;
    const referenced = (sym: string): boolean => new RegExp(`\\b${sym}\\b`).test(code);

    it('finds a live reference for every option marked implemented', () => {
      const missing = Object.entries(SYSOP_OPTIONS)
        .filter(([, s]) => s.implemented)
        .map(([n, s]) => symbolFor(n, s))
        .filter((sym) => !referenced(sym));
      expect(missing).toEqual([]);
    });

    it('finds no live reference for any option marked unimplemented', () => {
      const stray = Object.entries(SYSOP_OPTIONS)
        .filter(([, s]) => !s.implemented)
        .map(([n, s]) => symbolFor(n, s))
        .filter((sym) => referenced(sym));
      expect(stray).toEqual([]);
    });
  });

  it('DECODDS is config-driven now that decoyIntercept uses the C 1-in-N form', () => {
    // The port used to read decodds as a 0-100 percentage, which made it
    // incomparable to the C bound of 1..20 and forced a special case here.
    // decoyIntercept now rolls gernd()%decodds==0 like C, so the option is
    // ordinary.
    //
    // The default is no longer pinned here. It was 2 -- chosen to reproduce
    // the port's old 50% intercept -- against a shipped DECODDS of 11 (~9%).
    // At 2, three decoys ate 87.5% of incoming rounds versus canon's 24%,
    // which made guided weapons nearly useless against any decoy carrier.
    // Defaults are owned by the canon conformance test; this one only asserts
    // that the option is wired and carries the C bounds.
    // @see test/balance/sysop-options-canon.balance.spec.ts
    expect(SYSOP_OPTIONS.DECODDS.implemented).toBe(true);
    expect(SYSOP_OPTIONS.DECODDS.canonDefault).toBe(11);
    expect(SYSOP_OPTIONS.DECODDS.max).toBe(20);
  });
});

describe('flattenConfigFile', () => {
  it('flattens the grouped on-disk shape into option names', () => {
    const flat = flattenConfigFile({
      weapons: { PDAMMAX: 30, TDAMMAX: 90 },
      world: { UNIVMAX: 20 },
    });
    expect(flat).toEqual({ PDAMMAX: 30, TDAMMAX: 90, UNIVMAX: 20 });
  });

  it('accepts an already-flat file', () => {
    expect(flattenConfigFile({ PDAMMAX: 30 })).toEqual({ PDAMMAX: 30 });
  });

  it('rejects a duplicated option across two groups', () => {
    expect(() =>
      flattenConfigFile({ weapons: { PDAMMAX: 30 }, limits: { PDAMMAX: 40 } }),
    ).toThrow(/PDAMMAX/);
  });

  it('returns an empty object for an empty file', () => {
    expect(flattenConfigFile({})).toEqual({});
  });
});

describe('resolveGameConfig', () => {
  it('works with no config file present, falling back to declared defaults', () => {
    const cfg = resolveGameConfig({ path: '/nonexistent/game.config.json', env: {} });
    expect(cfg.PDAMMAX).toBe(SYSOP_OPTIONS.PDAMMAX.default);
  });

  it('reads the repository config file and every value is inside its bounds', () => {
    const cfg = resolveGameConfig({ env: {} });
    for (const [name, spec] of Object.entries(SYSOP_OPTIONS)) {
      const value = cfg[name as keyof typeof cfg];
      expect(value).toBeGreaterThanOrEqual(spec.min);
      expect(value).toBeLessThanOrEqual(spec.max);
    }
  });

  it('the shipped config file needs no clamping — it is already valid', () => {
    expect(resolveGameConfig({ env: {} }).warnings).toEqual([]);
  });
});
