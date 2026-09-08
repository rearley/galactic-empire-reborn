/**
 * The pure half of the sysop toolkit: canon's argument parsing and validity
 * checks, with no effects.
 *
 * The command list comes from `sys help`'s own output (GECMDS.C:4762-4776),
 * NOT from the header comment above cmd_sysop. That comment is stale — it
 * advertises `cyborg`, `cyborgoff` and `cybmine`, all three of which sit inside
 * `#ifdef NOTHING` (GECMDS.C:4850-4878) and were never compiled into the
 * shipped binary. `sys help` is what a sysop could actually run.
 *
 * @see GECMDS.C:4742-4987 cmd_sysop
 */

/** Verbatim from `sys help`, which is canon's own documentation of itself. */
export const SYS_HELP_LINES: readonly string[] = Object.freeze([
  'sys help                    - Produces this list',
  'sys get nnn <itemname>      - Creates items on this ship',
  'sys kill <username>         - Kills the ship commanded by username',
  'sys cash nnn                - Creates nnn cash',
  'sys goto xsector ysector    - Teleports ship to sector',
  'sys class nnn               - Changes ship to class number nnn',
  'sys shieldtype nnn          - Changes shields to class number nnn',
  'sys phasertype nnn          - Changes phaser to class number nnn',
  'sys maint                   - Starts FAST maintenance',
  'sys unjam                   - Clears jamming',
  'sys list nn                 - Lists 50 ships in game beginning with nn',
  'sys classlist               - Lists index of ship classes',
  'sys cybpause nnn            - pauses the cybertrons for nnn secs',
]);

export interface ParsedSysArgs {
  sub: string;
  rest: string[];
  /** The nth `rest` element as an integer, or null if absent or not a clean integer. */
  int(index: number): number | null;
}

export function parseSysArgs(args: readonly string[]): ParsedSysArgs {
  const sub = (args[0] ?? '').toLowerCase();
  const rest = args.slice(1);
  return {
    sub,
    rest,
    int(index: number): number | null {
      const raw = rest[index]?.trim();
      if (!raw) return null;
      // Number(), not parseInt(): parseInt('12abc') is 12, which turns an
      // operator's typo into a live value. Same reasoning as score.config.ts.
      const n = Number(raw);
      return Number.isInteger(n) ? n : null;
    },
  };
}

/**
 * `atoi(margv[2]) <= tot_classes && atoi(margv[2]) > 0` — GECMDS.C:4882.
 *
 * Canon stores `shpclass` zero-based and subtracts one from the input; this
 * port stores the class NUMBER directly, so no adjustment is needed here.
 */
export function sysClassIsValid(classNumber: number, totalClasses: number): boolean {
  return Number.isInteger(classNumber) && classNumber > 0 && classNumber <= totalClasses;
}

/**
 * Shield and phaser type, `atoi(margv[2]) < 255` — GECMDS.C:4894, :4905.
 *
 * DELIBERATE DEVIATION: canon checks only the upper bound, so `-5` passes and
 * writes a negative type. That is a bug rather than a feature — the value
 * indexes per-type tables and drives shieldchg arithmetic, so a negative
 * silently corrupts combat instead of doing anything a sysop wanted. A tool
 * that can quietly break a ship is not worth the fidelity.
 */
export function sysTypeIsValid(type: number): boolean {
  return Number.isInteger(type) && type >= 0 && type < 255;
}

/**
 * `if (i < univmax && j < univmax)` — GECMDS.C:4832.
 *
 * DELIBERATE DEVIATION: canon checks only the upper bound. `sys goto -9999
 * -9999` passes it and drops a ship outside the galaxy, off every scan and
 * outside the perimeter logic. Canon simply forgot the other half of the
 * comparison; we check both edges.
 */
export function sysGotoIsValid(x: number, y: number, univmax: number): boolean {
  return (
    Number.isInteger(x) && Number.isInteger(y) &&
    x >= -univmax && x <= univmax &&
    y >= -univmax && y <= univmax
  );
}
