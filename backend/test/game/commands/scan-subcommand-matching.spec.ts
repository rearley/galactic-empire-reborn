/**
 * Scan sub-commands match by prefix, and a bare `sca` asks for the format.
 *
 * GECMDS.C:2157-2172 dispatches with `genearas`, the same prefix matcher the
 * item keywords use, so `sca ship`, `sca planets` and `sca range 5` all work.
 * GECMDS.C:2154 and 2495-2501 print SCANFMT when no sub-command is given and
 * when `sca ra` arrives without a level.
 *
 * The port matched sub-commands exactly and defaulted a bare `sca` to a full
 * local scan — and its own `argMissingMessage` was unreachable because
 * `minArgs` is 0. The prefix matcher already exists in this codebase for item
 * keywords (validators.ts), so this was inconsistency rather than policy.
 */

import { resolveScanSubcommand } from '../../../src/game/commands/handlers/helpers/scan-subcommand';

describe('resolveScanSubcommand — GECMDS.C:2157-2172', () => {
  it('accepts the canonical two-letter forms', () => {
    expect(resolveScanSubcommand('lo')).toBe('lo');
    expect(resolveScanSubcommand('sh')).toBe('sh');
    expect(resolveScanSubcommand('pl')).toBe('pl');
    expect(resolveScanSubcommand('ra')).toBe('ra');
    expect(resolveScanSubcommand('se')).toBe('se');
  });

  it('accepts the words a player would actually type', () => {
    expect(resolveScanSubcommand('ship')).toBe('sh');
    expect(resolveScanSubcommand('planets')).toBe('pl');
    expect(resolveScanSubcommand('range')).toBe('ra');
    expect(resolveScanSubcommand('sector')).toBe('se');
    expect(resolveScanSubcommand('local')).toBe('lo');
  });

  it('is case-insensitive', () => {
    expect(resolveScanSubcommand('Ship')).toBe('sh');
    expect(resolveScanSubcommand('PLANETS')).toBe('pl');
  });

  it('returns null for a bare scan, so the caller prints the format line', () => {
    expect(resolveScanSubcommand(undefined)).toBeNull();
    expect(resolveScanSubcommand('')).toBeNull();
  });

  it('returns null for something that is not a sub-command', () => {
    expect(resolveScanSubcommand('bogus')).toBeNull();
  });

  it('does not let a one-letter prefix pick arbitrarily', () => {
    // 's' is ambiguous between sh and se — C's genearas compares against the
    // full keyword, so a partial shorter than the keyword does not match.
    expect(resolveScanSubcommand('s')).toBeNull();
  });
});
