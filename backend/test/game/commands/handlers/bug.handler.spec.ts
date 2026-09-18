import { BugHandlerService } from '../../../../src/game/commands/handlers/bug.handler';
import { BugReportService } from '../../../../src/game/reports/bug-report.service';
import { CommandContext, CommandResult } from '../../../../src/game/commands/command.types';
import { makeShip } from '../../../helpers/make-ship';

/**
 * `bug` — report something from inside the game, while it is still fresh.
 *
 * PORT-ORIGINAL, and canon has no equivalent: `cmd_sysop` is the only sysop
 * surface in GECMDS.C, because on a BBS a player mailed the sysop one level up,
 * through the BBS itself rather than the game module.
 *
 * The point of filing it in-game rather than linking to an issue tracker is the
 * CONTEXT. A player writes "it killed me"; the server knows which hull they
 * were flying, where they were, how damaged, and — the one nobody ever includes
 * — which build it happened on. A report against a version that has since been
 * replaced is a different report, and without the build stamped on it nobody
 * can tell which.
 */
describe('the bug command', () => {
  const ctx: CommandContext = {};

  function build() {
    const filed: Parameters<BugReportService['file']>[0][] = [];
    const reports = {
      // The handler MINTS the id and hands it over, rather than reading one
      // back: the reply cannot await Postgres, and a player who is told
      // nothing has no way to refer to what they just filed.
      file: vi.fn((r: Parameters<BugReportService['file']>[0]) => {
        filed.push(r);
        return Promise.resolve();
      }),
    } as unknown as BugReportService;
    let now = 1_000_000;
    const handler = new BugHandlerService(reports, { now: () => now });
    return { handler, filed, reports, advance: (ms: number) => { now += ms; } };
  }

  const ship = () => makeShip({
    userid: 'u1', shipno: 2, shipname: 'Kestrel', shpclass: 4,
    xcoord: -12.5, ycoord: 40.25, damage: 63, username: 'Rick',
  });

  const run = (h: BugHandlerService, s = ship(), args = ['the', 'scanner', 'lied']) =>
    h.command.handler(s, args, ctx) as CommandResult;

  it('files what the player typed', () => {
    const { handler, filed } = build();

    run(handler);

    expect(filed).toHaveLength(1);
    expect(filed[0].text).toBe('the scanner lied');
  });

  it('attaches the context the player would never think to include', () => {
    const { handler, filed } = build();

    run(handler);

    expect(filed[0]).toMatchObject({
      userid: 'u1', username: 'Rick',
      shipno: 2, shipname: 'Kestrel', shpclass: 4,
      xcoord: -12.5, ycoord: 40.25, damage: 63,
    });
    // The build it happened ON — the field that decides whether a report is
    // still about the running code.
    expect(typeof filed[0].version).toBe('string');
    expect(typeof filed[0].sha).toBe('string');
  });

  it('tells the reporter it was received, and names the report it filed', () => {
    const { handler, filed } = build();

    const res = run(handler);

    // The id is minted by the handler and handed to the service, so the reply
    // can name it without awaiting the insert.
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].text).toContain(filed[0].id.slice(0, 8));
  });

  it('refuses an empty report rather than filing a blank row', () => {
    const { handler, filed } = build();

    const res = run(handler, ship(), []);

    expect(filed).toHaveLength(0);
    expect(res.lines[0].text).toMatch(/what went wrong/i);
  });

  it('throttles a flood without punishing a considered second report', () => {
    // Two in a minute is a player adding a detail they forgot. Ten is a script,
    // or somebody venting — and every one of them is a row somebody reads.
    const { handler, filed, advance } = build();

    run(handler);
    run(handler);
    const third = run(handler);

    expect(filed).toHaveLength(2);
    expect(third.lines[0].text).toMatch(/moment/i);

    advance(61_000);
    run(handler);
    expect(filed).toHaveLength(3);
  });

  it('never blocks on the database — the reply does not wait for the write', () => {
    // Handlers are synchronous; a report that awaited Postgres would stall the
    // player's command queue behind it.
    const { handler, reports } = build();

    const res = run(handler);

    expect(res.lines[0].text).toBeDefined();
    expect(reports.file).toHaveBeenCalled();
  });
});
