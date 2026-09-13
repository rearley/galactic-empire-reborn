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
 * GE_SYSOP_USERNAME environment allowlist. That substitution is port-original
 * plumbing for a canon gate — see docs/DECISIONS.md.
 *
 * It matches on USERNAME, not userid, because `userid` is
 * `usr_${randomBytes(12).toString('hex')}` (auth.service.ts:38) — generated
 * fresh at registration, so it cannot be configured before the account exists
 * and changes on every database reset. The username is chosen by the operator
 * and re-used across resets, so the allowlist can be set once and stay true.
 */
import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { SysHandlerService } from '../../../../src/game/commands/handlers/sys.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { CybertronControlService } from '../../../../src/game/cybertron/cybertron-control.service';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    energy: 100000,
    jammer: 10,
    topspeed: 10,
    ...over,
  });
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
  // prisma and cybControl are unused by the paths these specs exercise (the
  // gate, and unjam); passing a real CybertronControlService rather than a mock
  // because it has no dependencies and a mock would only test itself.
  return new SysHandlerService(
    shipState,
    { user: { update: vi.fn() } } as unknown as PrismaService,
    new CybertronControlService(),
  );
}

const ctx: CommandContext = {};

describe('SysHandlerService — canon sysop gate (GECMDS.C:4752-4760)', () => {
  const saved = process.env.GE_SYSOP_USERNAME;
  afterEach(() => {
    if (saved === undefined) delete process.env.GE_SYSOP_USERNAME;
    else process.env.GE_SYSOP_USERNAME = saved;
  });

  it('refuses an ordinary player with "Huh?" and does NOT clear their jammer', async () => {
    delete process.env.GE_SYSOP_USERNAME;
    const alice = makeShip({ userid: 'usr_a1', username: 'Alice', jammer: 15 });
    const h = makeHarness([alice]);

    const result = await h.command.handler(alice, ['unjam'], ctx) as CommandResult;

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_HUH));
    expect(alice.jammer).toBe(15);
  });

  it('refuses before dispatch, so an unknown subcommand also answers "Huh?"', async () => {
    delete process.env.GE_SYSOP_USERNAME;
    const alice = makeShip({ userid: 'usr_a1', username: 'Alice' });
    const h = makeHarness([alice]);

    const result = await h.command.handler(alice, ['bogus'], ctx) as CommandResult;

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_HUH));
  });

  it('a username in GE_SYSOP_USERNAME is a sysop and may unjam', async () => {
    process.env.GE_SYSOP_USERNAME = 'root,Alice';
    const alice = makeShip({ userid: 'usr_a1', username: 'Alice', jammer: 15 });
    const h = makeHarness([alice]);

    const result = await h.command.handler(alice, ['unjam'], ctx) as CommandResult;

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_UNJAM));
    expect(alice.jammer).toBe(0);
  });

  it('the allowlist is exact — a non-listed username is still refused', async () => {
    process.env.GE_SYSOP_USERNAME = 'root';
    const mallory = makeShip({ userid: 'usr_m1', username: 'Mallory', jammer: 15 });
    const h = makeHarness([mallory]);

    const result = await h.command.handler(mallory, ['unjam'], ctx) as CommandResult;

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_HUH));
    expect(mallory.jammer).toBe(15);
  });
  it('matches the username case-insensitively, as registration does', async () => {
    // username is case-insensitively unique (schema.prisma User.username), so
    // the allowlist must not care about the case the operator typed in .env.
    process.env.GE_SYSOP_USERNAME = 'rick';
    const rick = makeShip({ userid: 'usr_r1', username: 'Rick', jammer: 15 });
    const h = makeHarness([rick]);

    const result = await h.command.handler(rick, ['unjam'], ctx) as CommandResult;

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_UNJAM));
    expect(rick.jammer).toBe(0);
  });

  it('a matching USERID does not grant sysop — only the username counts', async () => {
    // Guards the whole point of the change: userids are random per
    // registration, so treating one as an allowlist entry would be a
    // configuration that silently stops working after a reset.
    process.env.GE_SYSOP_USERNAME = 'usr_a1';
    const alice = makeShip({ userid: 'usr_a1', username: 'Alice', jammer: 15 });
    const h = makeHarness([alice]);

    const result = await h.command.handler(alice, ['unjam'], ctx) as CommandResult;

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_HUH));
    expect(alice.jammer).toBe(15);
  });

  it('a ship with no cached username is never a sysop', async () => {
    process.env.GE_SYSOP_USERNAME = 'Alice';
    const ghost = makeShip({ userid: 'usr_g1', jammer: 15 });
    delete (ghost as { username?: string }).username;
    const h = makeHarness([ghost]);

    const result = await h.command.handler(ghost, ['unjam'], ctx) as CommandResult;

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SYS_HUH));
    expect(ghost.jammer).toBe(15);
  });
});
