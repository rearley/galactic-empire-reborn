/**
 * `sys` is a SYSOP command. Canon gates the whole thing before it looks at the
 * subcommand:
 *
 *   if ((!syscmds) || (sysonly && !(usrptr->flags&ISYSOP)))
 *       { prf("Huh?\r"); outprfge(ALWAYS,usrnum); return; }
 *
 * @see GECMDS.C:4752-4760 cmd_sysop
 *
 * Both options ship YES — SYSCMDS {Allow sysop commands? YES} at
 * MBMGEMSG.MSG:197 and SYSONLY {Allow sysop only to use sysop commands? YES}
 * at :202 — so in the shipped configuration an ordinary player gets "Huh?" and
 * nothing else.
 *
 * The port had no gate at all, which mattered because `sys unjam` clears the
 * caller's own jammer counter: any player could cancel being jammed instantly
 * and for free, which is a universal hard counter to the entire jammer weapon.
 *
 * Canon carries sysop identity in the MajorBBS user record (`usrptr->flags &
 * ISYSOP`), which this port has no equivalent of, so identity comes from the
 * GE_SYSOP_USERIDS environment allowlist. That substitution is port-original
 * plumbing for a canon gate — see docs/DECISIONS.md.
 */
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

describe('SysHandlerService — canon sysop gate (GECMDS.C:4752-4760)', () => {
  const saved = process.env.GE_SYSOP_USERIDS;
  afterEach(() => {
    if (saved === undefined) delete process.env.GE_SYSOP_USERIDS;
    else process.env.GE_SYSOP_USERIDS = saved;
  });

  it('refuses an ordinary player with "Huh?" and does NOT clear their jammer', () => {
    delete process.env.GE_SYSOP_USERIDS;
    const alice = makeShip({ userid: 'alice', jammer: 15 });
    const h = makeHarness([alice]);

    const result = h.command.handler(alice, ['unjam'], ctx) as CommandResult;

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_HUH));
    expect(alice.jammer).toBe(15);
  });

  it('refuses before dispatch, so an unknown subcommand also answers "Huh?"', () => {
    delete process.env.GE_SYSOP_USERIDS;
    const alice = makeShip({ userid: 'alice' });
    const h = makeHarness([alice]);

    const result = h.command.handler(alice, ['bogus'], ctx) as CommandResult;

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_HUH));
  });

  it('a userid in GE_SYSOP_USERIDS is a sysop and may unjam', () => {
    process.env.GE_SYSOP_USERIDS = 'root,alice';
    const alice = makeShip({ userid: 'alice', jammer: 15 });
    const h = makeHarness([alice]);

    const result = h.command.handler(alice, ['unjam'], ctx) as CommandResult;

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_UNJAM));
    expect(alice.jammer).toBe(0);
  });

  it('the allowlist is exact — a non-listed userid is still refused', () => {
    process.env.GE_SYSOP_USERIDS = 'root';
    const mallory = makeShip({ userid: 'mallory', jammer: 15 });
    const h = makeHarness([mallory]);

    const result = h.command.handler(mallory, ['unjam'], ctx) as CommandResult;

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_HUH));
    expect(mallory.jammer).toBe(15);
  });
});
