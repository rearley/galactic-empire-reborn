/**
 * `sca` must be a registered scan verb.
 *
 * GECMDS.C:158 registers the scan command as `{"sca", cmd_scan, 1}`, and the
 * original dispatcher matches on the first three characters
 * (GECMDS.C:267 `strncmp(ptr, md->command, 3)`), so `sca`, `scan` and longer
 * forms all resolve. The port registered only `scan`/`sc`, so the canonical
 * three-letter verb — the one documented in README.md — returned
 * "Unknown command".
 *
 * @see GECMDS.C:158 command table
 * @see GECMDS.C:249 gesearch
 */

import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';

describe('scan command verbs', () => {
  const service = new ScanHandlerService(
    {} as never, {} as never, {} as never, {} as never,
  );

  const registered = [
    service.command.keyword,
    ...service.command.aliases,
  ].map((v) => v.toLowerCase());

  it('registers the canonical GECMDS.C verb "sca"', () => {
    expect(registered).toContain('sca');
  });

  it('still accepts the long form "scan"', () => {
    expect(registered).toContain('scan');
  });

  it('does not register the 2-character "sc" — the original rejected it', () => {
    // gesearch does strncmp(ptr, "sca", 3): for "sc" that compares '\0'
    // against 'a' and returns non-zero, so `sc` was never a scan verb.
    expect(registered).not.toContain('sc');
  });
});
