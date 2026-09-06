import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { SysHandlerService } from '../../../../src/game/commands/handlers/sys.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 100000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 10, freq: [0, 0, 0],
    items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    username: 'Sysop',
    dirty: false, ...over,
  };
}

function makeHarness(ships: ShipState[]) {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);
  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(userid, shipno));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
  } as unknown as ShipStateService;
  return new SysHandlerService(shipState);
}

const ctx: CommandContext = {};

describe('SysHandlerService — `sys unjam`', () => {
  // `sys` is sysop-only in canon (GECMDS.C:4752-4760); an ordinary player gets
  // "Huh?" before the subcommand is even read. These cases are about what the
  // subcommand DOES, so they run as a sysop. The gate itself is covered by
  // sys-authorization.spec.ts.
  const saved = process.env.GE_SYSOP_USERNAME;
  beforeEach(() => { process.env.GE_SYSOP_USERNAME = 'Sysop'; });
  afterEach(() => {
    if (saved === undefined) delete process.env.GE_SYSOP_USERNAME;
    else process.env.GE_SYSOP_USERNAME = saved;
  });

  it('happy path — clears jammer immediately', () => {
    const alice = makeShip({ jammer: 15 });
    const h = makeHarness([alice]);
    const result = h.command.handler(alice, ['unjam'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_UNJAM));
    expect(alice.jammer).toBe(0);
  });

  it('idempotent — works when jammer already 0', () => {
    const alice = makeShip({ jammer: 0 });
    const h = makeHarness([alice]);
    const result = h.command.handler(alice, ['unjam'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_UNJAM));
    expect(alice.jammer).toBe(0);
  });

  it('unknown subcommand → SYS_UNKNOWN', () => {
    const alice = makeShip();
    const h = makeHarness([alice]);
    const result = h.command.handler(alice, ['bogus'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_UNKNOWN));
  });
});
