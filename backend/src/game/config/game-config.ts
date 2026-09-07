/**
 * Sysop-tunable game options — the port's equivalent of the original `.cnf`.
 *
 * The original read 51 options at boot via `numopt(NAME, min, max)`
 * (GEMAIN.C:459-524), each clamped to a range. Two things follow, and keeping
 * them apart is the reason this file exists:
 *
 *   - The BOUNDS are canon. A value outside them is one the original could
 *     never produce, which makes it a fidelity defect rather than a preference.
 *   - The SHIPPED DEFAULT is also canon, and is recorded here as
 *     `canonDefault`. A sysop could of course change it, but the value Murdock
 *     shipped is the one the game was balanced around, so it is the right
 *     starting point rather than an arbitrary pick inside the range.
 *
 * This file previously asserted the opposite -- that the values "are not part
 * of the reference source, so there is nothing to recover", and therefore that
 * "any value inside the bounds is legitimate". That was false, and expensive.
 * `MBMGEMSG.MSG` is the original's option database and carries the default
 * inside the braces of every block:
 *
 *     MAXPLRS {The maximum players in the game at once: 30} N 1 256
 *
 * Because nothing was thought to be recoverable, 44 of the 51 options had been
 * seeded by picking a bound or guessing a round number -- 20 of them sat
 * exactly ON a clamp bound. The errors ran in BOTH directions (HPDAMMAX at the
 * ceiling of 200 against a shipped 50; PFIRDST at the floor of 1 against 7),
 * which is the fingerprint of bounds-picking rather than deliberate tuning.
 * The audit behind that finding is docs/CANON_AUDIT_2026-09.md.
 *
 * Defaults are now generated from the .MSG and pinned: any drift between
 * `default` and `canonDefault` must be a DELIBERATE, documented deviation.
 * @see test/balance/sysop-options-canon.balance.spec.ts
 * @see tools/extract-sysop-options.mjs
 *
 * That second point was learned the hard way: TDAMMAX sat at 200 against a
 * ceiling of 100, MDAMMAX at 300 against 100, and JAMTIME at 20 against 10 —
 * torpedoes doing twice, missiles three times, and jammers lasting twice the
 * maximum the original permits. Each was found by hand and fixed after the
 * fact. Routing every option through one clamped loader makes that class of
 * defect structurally impossible instead of merely tested-for.
 *
 * `implemented: false` marks an option that is declared here — so its bounds
 * are recorded and the gap is visible — but does not yet back any gameplay
 * constant. Their defaults are provisional, and each carries a `note` saying
 * why nothing reads it.
 *
 * That flag WAS unreliable. An audit on 2026-09-03 walked every option back to
 * a real reference in src/ and found 14 of the 24 then marked `false` were
 * fully wired: PLODDS/WORMODDS (galaxy.config.ts), TEAMMAX (team.service.ts),
 * PLATTRF1/F2/F3 and PLATTRT1/T2 (planet-attack.service.ts), MAILDAYS and
 * CHGLOSER (midnight.config.ts), TOOCLOSE and CYBGOLD (cybertron.config.ts),
 * CLENGUSE (cloak.config.ts) and SCRBONUS (player-score.service.ts). None was
 * marked `true` while dead. The old guard was a count of wired options, which
 * cannot catch that: the total never moved. It is now a NAMED list plus a
 * scan of the comment-stripped source tree for each option's constant.
 * @see test/unit/config/game-config.spec.ts
 *
 * @see reference/ge-source/GEMAIN.C:459-524
 * @see backend/config/game.config.json — the values actually in force
 */

/** One tunable, with the clamp range the original enforced. */
export interface SysopOption {
  /** Inclusive lower bound from numopt. */
  min: number;
  /** Inclusive upper bound from numopt. */
  max: number;
  /** Value used when neither the config file nor the environment supplies one. */
  default: number;
  /**
   * The default the original shipped, from MBMGEMSG.MSG. `null` for the two
   * options that file does not declare (HYPDST1/HYPDST2).
   *
   * `default` should equal this. Where it deliberately does not, the reason
   * belongs in docs/DECISIONS.md and in the deviation list of the conformance
   * test -- not in a comment here, which is how the last drift went unnoticed.
   */
  canonDefault: number | null;
  /** Where the numopt call lives in the original source. */
  cReference: string;
  /** Whether this option currently backs a gameplay constant. */
  implemented: boolean;
  /** Our constant name, when it differs from the C option name. */
  constant?: string;
  /** Why this option is not wired, when that needs explaining. */
  note?: string;
}

export const SYSOP_OPTIONS = {
  MAXPLRS: { min: 1, max: 256, default: 30, canonDefault: 30, cReference: 'GEMAIN.C:459', implemented: true },
  FREEBIES: { min: 0, max: 1, default: 0, canonDefault: 0, cReference: 'GEMAIN.C:460', implemented: false,
    note: 'No consumer. C uses it to hand out free items at signup (GEMAIN.C:460); the port has no equivalent giveaway path.' },
  MAXLIST: { min: 3, max: 50, default: 10, canonDefault: 10, cReference: 'GEMAIN.C:461', implemented: true },
  MAXSHIPS: { min: 1, max: 50, default: 8, canonDefault: 8, cReference: 'GEMAIN.C:462', implemented: true },
  SE100DAM: { min: 1, max: 101, default: 10, canonDefault: 10, cReference: 'GEMAIN.C:463', implemented: true },
  SHOWOPT: { min: 0, max: 5, default: 0, canonDefault: 0, cReference: 'GEMAIN.C:464', implemented: false,
    note: 'No consumer. Selects which sysop stats the C menu displays — an operator UI we do not have.' },
  MAXPLNTS: { min: 1, max: 256, default: 20, canonDefault: 20, cReference: 'GEMAIN.C:468', implemented: true },
  NUMSHIPS: { min: 1, max: 500, default: 30, canonDefault: 30, cReference: 'GEMAIN.C:470', implemented: false,
    note: 'Not enforced: in C this only SIZES the ship array (nships = nterms + numships, GEMAIN.C:697). There is no runtime gate on it, so adding one would be an invention rather than a port.' },
  MAXDROID: { min: 0, max: 500, default: 6, canonDefault: 6, cReference: 'GEMAIN.C:471', implemented: true },
  PLODDS: { min: 1, max: 20, default: 3, canonDefault: 3, cReference: 'GEMAIN.C:472', implemented: true },
  WORMODDS: { min: 1, max: 100, default: 6, canonDefault: 6, cReference: 'GEMAIN.C:473', implemented: true },
  // Half-extent of the universe square: sectors run -UNIVMAX..+UNIVMAX on
  // both axes, so the galaxy is (2*UNIVMAX+1)^2 sectors with the neutral zone
  // at its centre.
  //
  // The canon default is 300 -- a 601x601 galaxy. The previous comment here
  // credited 10 to the C source and justified it as "the density the AI
  // population was tuned against"; 10 is simply numopt's LOWER CLAMP
  // (GEMAIN.C:474), not a value anyone chose. config/game.config.json deploys
  // 100, which IS a deliberate tune: canon's galaxy assumed a busy BBS, and at
  // 300 a handful of concurrent players would never meet. Scan ranges are
  // absolute, so UNIVMAX and scanRange must be chosen together.
  // @see docs/DECISIONS.md
  UNIVMAX: { min: 10, max: 32767, default: 300, canonDefault: 300, cReference: 'GEMAIN.C:474', implemented: true },
  S00PLNUM: { min: 3, max: 9, default: 6, canonDefault: 6, cReference: 'GEMAIN.C:476', implemented: false,
    note: 'No consumer: src/game/galaxy/s00.ts exports S00_PLNUM = 6 as a fixed fixture, so the option cannot vary it. The value now matches canon (it read 5 until 2026-09-03) and is pinned by test/balance/s00-canon.balance.spec.ts.' },
  // lngopt, not numopt, and stored in MINUTES: GEMAIN.C:469 multiplies by 60.
  // ynopt, so 0/1. GEMAIN.C:475 univwrap = ynopt(UNIVWRAP); canon ships NO.
  UNIVWRAP: { min: 0, max: 1, default: 0, canonDefault: 0, cReference: 'GEMAIN.C:475', implemented: true, constant: 'UNIVWRAP' },
  PLANTOCK: { min: 1, max: 32760, default: 360, canonDefault: 360, cReference: 'GEMAIN.C:469', implemented: true, constant: 'PLANTOCK_SECONDS' },
  MAXPLSE: { min: 1, max: 9, default: 5, canonDefault: 5, cReference: 'GEMAIN.C:477', implemented: true, constant: 'MAXPLSE' },
  TEAMBONU: { min: 0, max: 32000, default: 5, canonDefault: 5, cReference: 'GEMAIN.C:478', implemented: true },
  TEAMMAX: { min: 0, max: 32000, default: 10, canonDefault: 10, cReference: 'GEMAIN.C:479', implemented: true },
  // 5, not 9. The 9 came from GE/MSG/MBMGEMSG.MSG, an earlier partial snapshot;
  // the shipped file is GE/REL/MBMGEMSG.MSG. @see reference/ge-upstream/PROVENANCE.md
  HPFIRDST: { min: 1, max: 20, default: 5, canonDefault: 5, cReference: 'GEMAIN.C:491', implemented: true },
  HPDAMMAX: { min: 1, max: 200, default: 50, canonDefault: 50, cReference: 'GEMAIN.C:492', implemented: true },
  // 5, not 7 — same stale-copy story as HPFIRDST. This is the exponent in the
  // dd^factor range falloff (GEFUNCS.C:2080-2087), so it is the single number
  // that decides how fast phaser damage dies with distance.
  PFIRDST: { min: 1, max: 20, default: 5, canonDefault: 5, cReference: 'GEMAIN.C:493', implemented: true },
  PDAMMAX: { min: 1, max: 200, default: 50, canonDefault: 50, cReference: 'GEMAIN.C:494', implemented: true },
  JAMTIME: { min: 1, max: 10, default: 3, canonDefault: 3, cReference: 'GEMAIN.C:496', implemented: true },
  MAILDAYS: { min: 1, max: 7, default: 3, canonDefault: 3, cReference: 'GEMAIN.C:497', implemented: true },
  TORPSPED: { min: 1, max: 10000, default: 2441, canonDefault: 2441, cReference: 'GEMAIN.C:498', implemented: true },
  MISLSPED: { min: 1, max: 10000, default: 1212, canonDefault: 1212, cReference: 'GEMAIN.C:499', implemented: true },
  NUMMINES: { min: 1, max: 200, default: 12, canonDefault: 12, cReference: 'GEMAIN.C:501', implemented: true },
  USRMINES: { min: 1, max: 200, default: 3, canonDefault: 3, cReference: 'GEMAIN.C:502', implemented: true, constant: 'USERMINES' },
  DECODDS: { min: 1, max: 20, default: 11, canonDefault: 11, cReference: 'GEMAIN.C:504', implemented: true },
  TORFACT: { min: 1, max: 50, default: 40, canonDefault: 40, cReference: 'GEMAIN.C:506', implemented: true },
  TDAMMAX: { min: 1, max: 100, default: 35, canonDefault: 35, cReference: 'GEMAIN.C:508', implemented: true },
  MISFACT: { min: 1, max: 50, default: 21, canonDefault: 21, cReference: 'GEMAIN.C:509', implemented: true },
  MDAMMAX: { min: 1, max: 100, default: 25, canonDefault: 25, cReference: 'GEMAIN.C:511', implemented: true },
  IDAMMAX: { min: 1, max: 100, default: 50, canonDefault: 50, cReference: 'GEMAIN.C:512', implemented: true },
  MNDAMMAX: { min: 1, max: 200, default: 75, canonDefault: 75, cReference: 'GEMAIN.C:513', implemented: true, constant: 'MINEDAMMAX' },
  REPAIRRT: { min: 1, max: 50, default: 6, canonDefault: 6, cReference: 'GEMAIN.C:514', implemented: true, constant: 'REPAIRRATE' },
  TOOCLOSE: { min: 1, max: 32000, default: 2500, canonDefault: 2500, cReference: 'GEMAIN.C:517', implemented: true },
  CLENGUSE: { min: 1, max: 32000, default: 7500, canonDefault: 7500, cReference: 'GEMAIN.C:519', implemented: true },
  STRTCASH: { min: 1, max: 32000, default: 100, canonDefault: 100, cReference: 'GEMAIN.C:521', implemented: true, constant: 'START_CASH' },
  MAXPLREC: { min: 10, max: 32767, default: 32767, canonDefault: 32767, cReference: 'GEMAIN.C:524', implemented: false,
    note: 'No consumer. Sizes the C player-record file; Postgres has no equivalent preallocation.' },
  CYBGOLD: { min: 0, max: 32000, default: 1200, canonDefault: 1200, cReference: 'GEMAIN.C:527', implemented: true },
  // Recovered 2026-09-03: these read canonDefault null on the belief that no
  // shipped value existed. It did — we were reading GE/MSG, which has no
  // HYPDST blocks. GE/REL:512, :522.
  HYPDST1: { min: 1, max: 32000, default: 25, canonDefault: 25, cReference: 'GEMAIN.C:529', implemented: false,
    note: 'No consumer. cybertron.config.ts hard-codes hyperdist1: 25 (the same number) rather than reading this option, so a sysop tune has no effect.' },
  HYPDST2: { min: 1, max: 32000, default: 10, canonDefault: 10, cReference: 'GEMAIN.C:530', implemented: false,
    note: 'No consumer. cybertron.config.ts hard-codes hyperdist2: 10 rather than reading this option.' },
  PLATTRF1: { min: 5, max: 1000, default: 18, canonDefault: 18, cReference: 'GEMAIN.C:532', implemented: true },
  PLATTRF2: { min: 5, max: 1000, default: 100, canonDefault: 100, cReference: 'GEMAIN.C:535', implemented: true },
  PLATTRF3: { min: 5, max: 1000, default: 55, canonDefault: 55, cReference: 'GEMAIN.C:539', implemented: true },
  PLATTRT1: { min: 5, max: 1000, default: 125, canonDefault: 125, cReference: 'GEMAIN.C:543', implemented: true },
  PLATTRT2: { min: 5, max: 1000, default: 35, canonDefault: 35, cReference: 'GEMAIN.C:547', implemented: true },
  PHATOWRP: { min: 0, max: 100, default: 5, canonDefault: 5, cReference: 'GEMAIN.C:598', implemented: true },
  MISENGFC: { min: 1, max: 2000, default: 100, canonDefault: 100, cReference: 'GEMAIN.C:600', implemented: true },
  SCRBONUS: { min: 0, max: 32700, default: 1000, canonDefault: 1000, cReference: 'GEMAIN.C:602', implemented: true },
  SCRFACT: { min: 0, max: 32700, default: 35, canonDefault: 35, cReference: 'GEMAIN.C:603', implemented: false,
    note: 'No consumer. src/game/player/score.config.ts reads its own SCORE_F2 env var and defaults to 100, not to this option (canon 35), so the shipped score_f2 is not in force. Wiring it means editing score.config.ts.' },
  CHGLOSER: { min: 0, max: 100, default: 2, canonDefault: 2, cReference: 'GEMAIN.C:605', implemented: true },} as const satisfies Record<string, SysopOption>;

export type SysopOptionName = keyof typeof SYSOP_OPTIONS;
export type GameConfig = Record<SysopOptionName, number>;

export interface LoadSources {
  /** Parsed contents of game.config.json (or any subset). */
  file: Partial<Record<string, number>>;
  /** Process environment; only keys matching an option name are read. */
  env: Record<string, string | undefined>;
}

export interface LoadOptions {
  /** Collect clamp warnings instead of only returning values. */
  collectWarnings?: boolean;
  /** The tuning file this load came from, surfaced on the result. */
  configPath?: string | null;
}

export type LoadResult = GameConfig & {
  warnings: string[];
  /**
   * The tuning file actually read, or null when none was found.
   *
   * A missing file is legitimate and falls back to canon defaults, which is
   * why two separate bugs hid here — wrong path arithmetic from a compiled
   * tree, then a Dockerfile that never shipped the file. Both ran on defaults
   * in silence. Making a missing file fatal would break fresh checkouts; making
   * the ANSWER visible costs nothing.
   */
  configPath: string | null;
};

/**
 * Resolve every option: default -> config file -> environment, then clamp.
 *
 * Environment wins so a container can be retuned without editing a mounted
 * file. Precedence is deliberate and matches how MAXSHIPS/PDAMMAX already
 * behaved before this existed.
 *
 * Throws on an unknown key or a non-numeric value rather than ignoring it — a
 * typo in a tuning file should fail loudly, not silently leave the default in
 * place and look like the setting had no effect.
 */
export function loadGameConfig(sources: LoadSources, options: LoadOptions = {}): LoadResult {
  const warnings: string[] = [];
  const resolved = {} as GameConfig;

  for (const key of Object.keys(sources.file)) {
    if (!(key in SYSOP_OPTIONS)) {
      throw new Error(
        `Unknown game option '${key}' in config file. Valid options: ${Object.keys(SYSOP_OPTIONS).join(', ')}`,
      );
    }
  }

  for (const [name, spec] of Object.entries(SYSOP_OPTIONS) as Array<[SysopOptionName, SysopOption]>) {
    let raw: number = spec.default;
    let origin = 'default';

    const fromFile = sources.file[name];
    if (fromFile !== undefined) {
      if (typeof fromFile !== 'number' || !Number.isFinite(fromFile)) {
        throw new Error(`Game option '${name}' must be a finite number, got ${JSON.stringify(fromFile)}`);
      }
      raw = fromFile;
      origin = 'config file';
    }

    const fromEnv = sources.env[name];
    if (fromEnv !== undefined && fromEnv !== '') {
      const parsed = Number(fromEnv);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Game option '${name}' from the environment must be numeric, got '${fromEnv}'`);
      }
      raw = parsed;
      origin = 'environment';
    }

    const clamped = Math.min(spec.max, Math.max(spec.min, raw));
    if (clamped !== raw) {
      warnings.push(
        `${name}=${raw} (${origin}) is outside the original's range ${spec.min}..${spec.max} ` +
          `(${spec.cReference}); clamped to ${clamped}.`,
      );
    }
    resolved[name] = clamped;
  }

  if (!options.collectWarnings && warnings.length > 0) {
    for (const w of warnings) console.warn(`[game-config] ${w}`);
  }

  return Object.assign(resolved, { warnings, configPath: options.configPath ?? null });
}

/**
 * Collapse the grouped on-disk shape (`{ weapons: { PDAMMAX: 25 }, ... }`) into
 * a flat option map. Grouping exists purely so the file reads well; the loader
 * only cares about option names.
 *
 * A name appearing in two groups is an error rather than a last-one-wins race —
 * the file is hand-edited, and a silently ignored duplicate is exactly the kind
 * of thing that looks like "my setting had no effect".
 */
export function flattenConfigFile(
  raw: Record<string, unknown>,
): Partial<Record<string, number>> {
  const flat: Record<string, number> = {};
  const place = (key: string, value: unknown): void => {
    if (key in flat) {
      throw new Error(`Game option '${key}' appears more than once in the config file`);
    }
    flat[key] = value as number;
  };

  for (const [key, value] of Object.entries(raw)) {
    // JSON has no comment syntax, and a deviations-only file needs to explain
    // itself, so keys beginning with `_` are documentation and are skipped.
    // Section names are not validated, only the option names inside them, so a
    // `_`-prefixed key at either level is safe to ignore.
    if (key.startsWith('_')) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (inner.startsWith('_')) continue;
        place(inner, innerValue);
      }
    } else {
      place(key, value);
    }
  }
  return flat;
}

/** Default location of the tuning file, relative to the backend package root. */
export const DEFAULT_CONFIG_PATH = 'config/game.config.json';

/**
 * Read the tuning file (if present) and resolve every option against the
 * environment. A missing file is not an error: the declared defaults are a
 * complete, playable configuration, which keeps tests and fresh checkouts
 * working without setup.
 */
/**
 * Every place the tuning file might live, in priority order.
 *
 * The single path this replaced was `resolve(__dirname, '../../..', ...)`,
 * which is correct from `src/game/config` and WRONG from
 * `dist/src/game/config` — it resolved to `dist/config/game.config.json`,
 * which no build produces. Every compiled deployment therefore ignored the
 * sysop config and ran on defaults, silently, because a missing file is a
 * legitimate state. ts-jest runs from source, so tests never saw it.
 *
 * Exported for tests: the bug was in path arithmetic, so the arithmetic is
 * what needs asserting.
 */
export function candidateConfigPaths(
  fromDir: string,
  env: Record<string, string | undefined> = process.env,
): string[] {
  /* eslint-disable-next-line @typescript-eslint/no-require-imports */
  const path = require('path') as typeof import('path');
  const out: string[] = [];
  const push = (p: string): void => { if (!out.includes(p)) out.push(p); };

  // An explicit deployment answer, ahead of all path arithmetic. Docker and
  // Plesk mount a volume and inject environment; they do not rebuild an image
  // to retune a galaxy. The derived paths below stay as fallbacks so source
  // runs, ts-jest and compiled runs all keep working with no setup.
  const explicit = env['GE_CONFIG_PATH'];
  if (explicit !== undefined && explicit !== '') push(path.resolve(explicit));

  // dist/src/game/config -> backend, and src/game/config -> backend
  push(path.resolve(fromDir, '../../../..', DEFAULT_CONFIG_PATH));
  push(path.resolve(fromDir, '../../..', DEFAULT_CONFIG_PATH));
  // a deployment that ships the file inside the build output
  push(path.resolve(fromDir, '../..', DEFAULT_CONFIG_PATH));
  // last resort: wherever the process was started
  push(path.resolve(process.cwd(), DEFAULT_CONFIG_PATH));
  return out;
}

export function resolveGameConfig(
  opts: { path?: string; env?: Record<string, string | undefined> } = {},
): LoadResult {
  const env = opts.env ?? process.env;
  // require() rather than import so a missing file degrades to defaults.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const candidates = opts.path ? [opts.path] : candidateConfigPaths(__dirname, env);
  const found = candidates.find((p) => fs.existsSync(p));

  let file: Partial<Record<string, number>> = {};
  if (found !== undefined) {
    const raw = JSON.parse(fs.readFileSync(found, 'utf8')) as Record<string, unknown>;
    file = flattenConfigFile(raw);
  }

  const result = loadGameConfig({ file, env }, { collectWarnings: true, configPath: found ?? null });

  // Say which file is in force, or that none is. Silence here is what let a
  // whole playtest be measured against a config the server never loaded.
  // eslint-disable-next-line no-console
  console.log(
    found !== undefined
      ? `[GameConfig] tuning file: ${found} (${Object.keys(file).length} options)`
      : `[GameConfig] no tuning file found — running on defaults. Looked in: ${candidates.join(', ')}`,
  );

  return result;
}
