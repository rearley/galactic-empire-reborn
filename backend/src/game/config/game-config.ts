/**
 * Sysop-tunable game options — the port's equivalent of the original `.cnf`.
 *
 * The original read 51 options at boot via `numopt(NAME, min, max)`
 * (GEMAIN.C:459-524), each clamped to a range. Two things follow, and keeping
 * them apart is the reason this file exists:
 *
 *   - The VALUE is not canon. It was whatever a given sysop chose, and the
 *     `.cnf` files are not part of the reference source, so there is nothing to
 *     recover. Any value inside the bounds is legitimate.
 *   - The BOUNDS are canon. A value outside them is one the original could
 *     never produce, which makes it a fidelity defect rather than a preference.
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
 * constant. Their defaults are provisional.
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
  MAXPLRS: { min: 1, max: 256, default: 256, cReference: 'GEMAIN.C:459', implemented: true },
  FREEBIES: { min: 0, max: 1, default: 0, cReference: 'GEMAIN.C:460', implemented: false },
  MAXLIST: { min: 3, max: 50, default: 20, cReference: 'GEMAIN.C:461', implemented: false },
  MAXSHIPS: { min: 1, max: 50, default: 10, cReference: 'GEMAIN.C:462', implemented: true },
  SE100DAM: { min: 1, max: 101, default: 101, cReference: 'GEMAIN.C:463', implemented: true },
  SHOWOPT: { min: 0, max: 5, default: 0, cReference: 'GEMAIN.C:464', implemented: false },
  MAXPLNTS: { min: 1, max: 256, default: 256, cReference: 'GEMAIN.C:468', implemented: true },
  NUMSHIPS: { min: 1, max: 500, default: 500, cReference: 'GEMAIN.C:470', implemented: false,
    note: 'Not enforced: in C this only SIZES the ship array (nships = nterms + numships, GEMAIN.C:697). There is no runtime gate on it, so adding one would be an invention rather than a port.' },
  MAXDROID: { min: 0, max: 500, default: 6, cReference: 'GEMAIN.C:471', implemented: true },
  PLODDS: { min: 1, max: 20, default: 4, cReference: 'GEMAIN.C:472', implemented: false },
  WORMODDS: { min: 1, max: 100, default: 10, cReference: 'GEMAIN.C:473', implemented: false },
  // Half-extent of the universe square: sectors run -UNIVMAX..+UNIVMAX on
  // both axes, so the galaxy is (2*UNIVMAX+1)^2 sectors with the neutral zone
  // at its centre. 10 gives 441 sectors, matching the density the AI population
  // was tuned against; raising it makes a larger, emptier galaxy.
  UNIVMAX: { min: 10, max: 32767, default: 10, cReference: 'GEMAIN.C:474', implemented: true },
  S00PLNUM: { min: 3, max: 9, default: 5, cReference: 'GEMAIN.C:476', implemented: false },
  MAXPLSE: { min: 1, max: 9, default: 9, cReference: 'GEMAIN.C:477', implemented: true, constant: 'MAXPLANETS' },
  TEAMBONU: { min: 0, max: 32000, default: 0, cReference: 'GEMAIN.C:478', implemented: true },
  TEAMMAX: { min: 0, max: 32000, default: 32000, cReference: 'GEMAIN.C:479', implemented: false },
  HPFIRDST: { min: 1, max: 20, default: 1, cReference: 'GEMAIN.C:491', implemented: true },
  HPDAMMAX: { min: 1, max: 200, default: 200, cReference: 'GEMAIN.C:492', implemented: true },
  PFIRDST: { min: 1, max: 20, default: 1, cReference: 'GEMAIN.C:493', implemented: true },
  PDAMMAX: { min: 1, max: 200, default: 25, cReference: 'GEMAIN.C:494', implemented: true },
  JAMTIME: { min: 1, max: 10, default: 10, cReference: 'GEMAIN.C:496', implemented: true },
  MAILDAYS: { min: 1, max: 7, default: 7, cReference: 'GEMAIN.C:497', implemented: false },
  TORPSPED: { min: 1, max: 10000, default: 500, cReference: 'GEMAIN.C:498', implemented: true },
  MISLSPED: { min: 1, max: 10000, default: 300, cReference: 'GEMAIN.C:499', implemented: true },
  NUMMINES: { min: 1, max: 200, default: 200, cReference: 'GEMAIN.C:501', implemented: false },
  USRMINES: { min: 1, max: 200, default: 200, cReference: 'GEMAIN.C:502', implemented: true, constant: 'USERMINES' },
  DECODDS: { min: 1, max: 20, default: 2, cReference: 'GEMAIN.C:504', implemented: true },
  TORFACT: { min: 1, max: 50, default: 1, cReference: 'GEMAIN.C:506', implemented: true },
  TDAMMAX: { min: 1, max: 100, default: 100, cReference: 'GEMAIN.C:508', implemented: true },
  MISFACT: { min: 1, max: 50, default: 1, cReference: 'GEMAIN.C:509', implemented: true },
  MDAMMAX: { min: 1, max: 100, default: 100, cReference: 'GEMAIN.C:511', implemented: true },
  IDAMMAX: { min: 1, max: 100, default: 100, cReference: 'GEMAIN.C:512', implemented: false },
  MNDAMMAX: { min: 1, max: 200, default: 150, cReference: 'GEMAIN.C:513', implemented: true, constant: 'MINEDAMMAX' },
  REPAIRRT: { min: 1, max: 50, default: 1, cReference: 'GEMAIN.C:514', implemented: false },
  TOOCLOSE: { min: 1, max: 32000, default: 3000, cReference: 'GEMAIN.C:517', implemented: false },
  CLENGUSE: { min: 1, max: 32000, default: 1000, cReference: 'GEMAIN.C:519', implemented: false },
  STRTCASH: { min: 1, max: 32000, default: 5000, cReference: 'GEMAIN.C:521', implemented: true, constant: 'START_CASH' },
  MAXPLREC: { min: 10, max: 32767, default: 32767, cReference: 'GEMAIN.C:524', implemented: false },
  CYBGOLD: { min: 0, max: 32000, default: 32000, cReference: 'GEMAIN.C:527', implemented: false },
  HYPDST1: { min: 1, max: 32000, default: 25, cReference: 'GEMAIN.C:529', implemented: false },
  HYPDST2: { min: 1, max: 32000, default: 10, cReference: 'GEMAIN.C:530', implemented: false },
  PLATTRF1: { min: 5, max: 1000, default: 100, cReference: 'GEMAIN.C:532', implemented: false },
  PLATTRF2: { min: 5, max: 1000, default: 100, cReference: 'GEMAIN.C:535', implemented: false },
  PLATTRF3: { min: 5, max: 1000, default: 100, cReference: 'GEMAIN.C:539', implemented: false },
  PLATTRT1: { min: 5, max: 1000, default: 100, cReference: 'GEMAIN.C:543', implemented: false },
  PLATTRT2: { min: 5, max: 1000, default: 100, cReference: 'GEMAIN.C:547', implemented: false },
  PHATOWRP: { min: 0, max: 100, default: 0, cReference: 'GEMAIN.C:598', implemented: true },
  MISENGFC: { min: 1, max: 2000, default: 10, cReference: 'GEMAIN.C:600', implemented: true },
  SCRBONUS: { min: 0, max: 32700, default: 0, cReference: 'GEMAIN.C:602', implemented: false },
  SCRFACT: { min: 0, max: 32700, default: 100, cReference: 'GEMAIN.C:603', implemented: false },
  CHGLOSER: { min: 0, max: 100, default: 100, cReference: 'GEMAIN.C:605', implemented: false },} as const satisfies Record<string, SysopOption>;

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
}

export type LoadResult = GameConfig & { warnings: string[] };

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

  return Object.assign(resolved, { warnings });
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
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) {
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
export function resolveGameConfig(
  opts: { path?: string; env?: Record<string, string | undefined> } = {},
): LoadResult {
  const env = opts.env ?? process.env;
  // require() rather than import so a missing file degrades to defaults.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const resolvedPath = opts.path ?? path.resolve(__dirname, '../../..', DEFAULT_CONFIG_PATH);

  let file: Partial<Record<string, number>> = {};
  if (fs.existsSync(resolvedPath)) {
    const raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as Record<string, unknown>;
    file = flattenConfigFile(raw);
  }

  return loadGameConfig({ file, env }, { collectWarnings: true });
}
