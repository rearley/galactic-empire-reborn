/**
 * `sys trace <name>` — read one Cybertron's decision trace.
 *
 * PORT-ORIGINAL, and read-only. Canon's `sys list` says where an AI is and whom
 * it has claimed; this says why. @see issue #60, src/game/cybertron/cyb-trace.service.ts
 */
import { CommandContext, CommandResult } from '../../../../src/game/commands/command.types';
import { SysHandlerService } from '../../../../src/game/commands/handlers/sys.handler';
import { SYS_HELP_LINES } from '../../../../src/game/commands/handlers/sys-commands';
import { CybertronControlService } from '../../../../src/game/cybertron/cybertron-control.service';
import { CybTraceService } from '../../../../src/game/cybertron/cyb-trace.service';
import { GESTAT_AUTO } from '../../../../src/game/constants';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { makeShip } from '../../../helpers/make-ship';

const ctx: CommandContext = {};
/** 2026-09-21 14:02:11 UTC */
const T = Date.UTC(2026, 8, 21, 14, 2, 11);

function cybertron(userid: string, shipno: number, shipname: string, over: Partial<ShipState> = {}): ShipState {
  const s = makeShip({ userid, shipno, shipname, shpclass: 25, status: GESTAT_AUTO, ...over });
  delete (s as { username?: string }).username;
  return s;
}

function harness(ships: ShipState[]) {
  const map = new Map(ships.map((s) => [shipKey(s.userid, s.shipno), s]));
  const shipState = { findAllShips: () => Array.from(map.values()) } as unknown as ShipStateService;
  const trace = new CybTraceService({ now: () => T });
  const sys = new SysHandlerService(
    shipState, {} as PrismaService, new CybertronControlService(), undefined, undefined, trace,
  );
  const run = async (who: ShipState, ...args: string[]): Promise<string[]> =>
    ((await sys.command.handler(who, ['trace', ...args], ctx)) as CommandResult).lines.map((l) => l.text);
  return { trace, run };
}

describe('sys trace', () => {
  const saved = process.env.GE_SYSOP_USERNAME;
  beforeEach(() => { process.env.GE_SYSOP_USERNAME = 'Sysop'; });
  afterEach(() => {
    if (saved === undefined) delete process.env.GE_SYSOP_USERNAME;
    else process.env.GE_SYSOP_USERNAME = saved;
  });
  const sysop = makeShip({ userid: 'usr_1', shipno: 1, username: 'Sysop' });

  it('prints the ship, then its decisions oldest first, in canon field names', async () => {
    const cyb = cybertron('Cybrg-205', 205, 'Obliterator4111', {
      xcoord: 0.54, ycoord: 0.29, cybmine: 18, speed2b: 284, head2b: 90,
    });
    const { trace, run } = harness([sysop, cyb]);
    trace.beginActivation('Cybrg-205:205');
    trace.transition('Cybrg-205:205', cyb, 'releaseZoneEntry', () => {
      cyb.cybmine = 255; cyb.speed2b = 1730; cyb.head2b = 211.43;
    }, 'Wasp is in the neutral zone');
    trace.note('Cybrg-205:205', 'scan', '1 pilot: 1 in zone → no target');

    expect(await run(sysop, 'Cybrg-205')).toEqual([
      'Cybrg-205 Obliterator4111  at (0.54, 0.29)  cybmine 255  speed2b 1730  tick 0',
      '14:02:11 act 1  releaseZoneEntry  cybmine 18→255 speed2b 284→1730 head2b 90→211.4  (Wasp is in the neutral zone)',
      '14:02:11 act 1  scan  1 pilot: 1 in zone → no target',
      'Times are UTC. Last 50 decisions, held in memory since the ship spawned or the server started.',
    ]);
  });

  it('matches a prefix of the userid or the ship name, case-insensitively', async () => {
    const cyb = cybertron('Cybrg-205', 205, 'Obliterator4111');
    const { run } = harness([sysop, cyb]);
    expect((await run(sysop, 'oblit'))[0]).toMatch(/^Cybrg-205 Obliterator4111/);
    expect((await run(sysop, 'cybrg-20'))[0]).toMatch(/^Cybrg-205 /);
  });

  it('asks for a narrower name when several ships match, listing them', async () => {
    const { run } = harness([
      sysop, cybertron('Cybrg-205', 205, 'Obliterator1'), cybertron('Cybrg-206', 206, 'Scout2'),
    ]);
    expect(await run(sysop, 'Cybrg-2')).toEqual([
      '2 Cybertrons match "Cybrg-2" — be more specific:',
      '  Cybrg-205 Obliterator1',
      '  Cybrg-206 Scout2',
    ]);
  });

  it('prefers an exact userid over the longer ones it is a prefix of', async () => {
    const { run } = harness([
      sysop, cybertron('Cybrg-20', 20, 'A'), cybertron('Cybrg-205', 205, 'B'),
    ]);
    expect((await run(sysop, 'Cybrg-20'))[0]).toMatch(/^Cybrg-20 A/);
  });

  it('does not look at players: a trace belongs to an AI', async () => {
    const { run } = harness([sysop, makeShip({ userid: 'usr_2', shipno: 1, username: 'Wasp' })]);
    expect(await run(sysop, 'Wasp')).toEqual(['No Cybertron matches "Wasp"']);
  });

  it('says so when a ship has decided nothing yet', async () => {
    const { run } = harness([sysop, cybertron('Cybrg-205', 205, 'Obliterator4111', { xcoord: 1, ycoord: 2 })]);
    expect((await run(sysop, 'Cybrg-205')).slice(1)).toEqual([
      'No decisions recorded since the ship spawned or the server started.',
    ]);
  });

  it('wants a name', async () => {
    const { run } = harness([sysop]);
    expect(await run(sysop)).toEqual(['Usage: sys trace <userid or ship name>']);
  });

  it('is listed by sys help after canon\'s own lines, marked as the port\'s', async () => {
    const shipState = { findAllShips: () => [sysop] } as unknown as ShipStateService;
    const sys = new SysHandlerService(shipState, {} as PrismaService, new CybertronControlService());
    const lines = ((await sys.command.handler(sysop, ['help'], ctx)) as CommandResult).lines.map((l) => l.text);
    expect(lines.slice(0, SYS_HELP_LINES.length)).toEqual([...SYS_HELP_LINES]);
    expect(lines.slice(SYS_HELP_LINES.length)).toEqual([
      'sys trace <name>            - (this port) A Cybertron\'s recent decisions',
    ]);
  });

  it('is Huh? to anyone who is not a sysop, like every sys subcommand', async () => {
    const player = makeShip({ userid: 'usr_2', shipno: 1, username: 'Wasp' });
    const { run } = harness([player, cybertron('Cybrg-205', 205, 'X')]);
    expect(await run(player, 'Cybrg-205')).toEqual(['Huh?']);
  });
});
