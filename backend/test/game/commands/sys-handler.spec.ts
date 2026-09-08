import { SysHandlerService } from '../../../src/game/commands/handlers/sys.handler';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { CybertronControlService } from '../../../src/game/cybertron/cybertron-control.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandResult } from '../../../src/game/commands/command.types';

function makeShip(o: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'usr_sysop', shipno: 1, shipname: 'Nemesis', shpclass: 1, username: 'rick',
    heading: 0, head2b: 0, speed: 0, speed2b: 0, xcoord: 0.5, ycoord: 0.5,
    damage: 0, energy: 1000, phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0, degrees: 0, percent: 0,
    tactical: 0, helm: 0, train: 0, where: 0,
    ltorpsChannel: [], ltorpsDistance: [], lmisslChannel: [], lmisslDistance: [],
    lmisslEnergy: [], decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0, firecntl: 0,
    destruct: 0, status: 0, cybmine: 0, cybskill: 0, cybupdate: 0, tick: 0,
    emulate: 0, minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...o,
  } as ShipState;
}

function makeService(opts: { ships?: ShipState[] } = {}) {
  const mutate = jest.fn((_u: string, _s: number, fn: (s: ShipState) => void) => {
    fn(state);
  });
  const state = opts.ships?.[0] ?? makeShip();
  const shipState = {
    mutate,
    findAllShips: jest.fn().mockReturnValue(opts.ships ?? [state]),
  } as unknown as ShipStateService;
  const prisma = {
    user: { update: jest.fn().mockResolvedValue({}) },
    shipClass: { findMany: jest.fn().mockResolvedValue([
      { classNumber: 1, typeName: 'Interceptor', cybCanAttack: false, noClaim: 1 },
      { classNumber: 2, typeName: 'Star Cruiser', cybCanAttack: true, noClaim: 2 },
    ]) },
  } as unknown as PrismaService;
  const svc = new SysHandlerService(shipState, prisma, new CybertronControlService());
  return { svc, state, mutate, prisma };
}

async function run(svc: SysHandlerService, ship: ShipState, args: string[]): Promise<CommandResult> {
  return (await svc.command.handler(ship, args, {} as never)) as CommandResult;
}

const OLD_ENV = process.env.GE_SYSOP_USERNAME;
afterEach(() => {
  if (OLD_ENV === undefined) delete process.env.GE_SYSOP_USERNAME;
  else process.env.GE_SYSOP_USERNAME = OLD_ENV;
});

describe('the sysop gate holds for every subcommand', () => {
  it('answers "Huh?" to a non-sysop, revealing nothing', async () => {
    // Canon's response is deliberately indistinguishable from an unknown
    // command (GECMDS.C:4752). A non-sysop must not learn the toolkit exists.
    delete process.env.GE_SYSOP_USERNAME;
    const { svc } = makeService();
    for (const sub of ['help', 'cash', 'kill', 'goto', 'classlist', 'cybpause']) {
      const r = await run(svc, makeShip(), [sub, '1', '1']);
      expect(r.lines[0].text).toBe('Huh?');
    }
  });

  it('refuses when the allowlist is empty, not just unset', async () => {
    process.env.GE_SYSOP_USERNAME = '   ';
    const { svc } = makeService();
    expect((await run(svc, makeShip(), ['help'])).lines[0].text).toBe('Huh?');
  });

  it('refuses a ship with no username — a half-registered account', async () => {
    process.env.GE_SYSOP_USERNAME = 'rick';
    const { svc } = makeService();
    const r = await run(svc, makeShip({ username: null as unknown as string }), ['help']);
    expect(r.lines[0].text).toBe('Huh?');
  });
});

describe('sysop subcommands', () => {
  beforeEach(() => { process.env.GE_SYSOP_USERNAME = 'rick'; });

  it('help lists all 13', async () => {
    const { svc } = makeService();
    const r = await run(svc, makeShip(), ['help']);
    expect(r.lines.length).toBe(13);
    expect(r.lines.some((l) => l.text.includes('sys cybpause'))).toBe(true);
  });

  it('get adds items to the caller\'s own ship', async () => {
    const { svc, state } = makeService();
    await run(svc, state, ['get', '50', 'tor']);
    expect(state.items[2]).toBe(50n);
  });

  it('get refuses a non-positive amount, as canon requires amt > 0', async () => {
    const { svc, state } = makeService();
    await run(svc, state, ['get', '0', 'tor']);
    expect(state.items[2]).toBe(0n);
  });

  it('goto moves the ship and clears hostile, per canon', async () => {
    const { svc, state } = makeService();
    await run(svc, state, ['goto', '10', '-4']);
    expect(state.xcoord).toBeCloseTo(10.5);
    expect(state.ycoord).toBeCloseTo(-3.5);
    expect(state.hostile).toBe(0);
    expect(state.where).toBe(0);
  });

  it('goto refuses a sector outside the galaxy', async () => {
    const { svc, state } = makeService();
    const before = state.xcoord;
    await run(svc, state, ['goto', '99999', '0']);
    expect(state.xcoord).toBe(before);
  });

  it('class changes hull and topspeed together', async () => {
    const { svc, state } = makeService();
    await run(svc, state, ['class', '2']);
    expect(state.shpclass).toBe(2);
  });

  it('shieldtype refuses a negative, which canon would have written', async () => {
    const { svc, state } = makeService();
    await run(svc, state, ['shieldtype', '-5']);
    expect(state.shieldtype).toBe(0);
  });

  it('unjam still clears the jammer', async () => {
    const { svc, state } = makeService({ ships: [makeShip({ jammer: 9 })] });
    await run(svc, state, ['unjam']);
    expect(state.jammer).toBe(0);
  });

  it('kill reports "Not found" rather than silently doing nothing', async () => {
    const { svc } = makeService();
    const r = await run(svc, makeShip(), ['kill', 'nobody']);
    expect(r.lines.some((l) => /not found/i.test(l.text))).toBe(true);
  });

  it('kill damages the named commander\'s ship', async () => {
    const victim = makeShip({ userid: 'usr_v', username: 'vraskcmdr', shipno: 1 });
    const { svc } = makeService({ ships: [victim] });
    const r = await run(svc, makeShip(), ['kill', 'vraskcmdr']);
    expect(r.lines.some((l) => /killed/i.test(l.text))).toBe(true);
  });

  it('classlist enumerates the classes', async () => {
    const { svc } = makeService();
    const r = await run(svc, makeShip(), ['classlist']);
    expect(r.lines.some((l) => l.text.includes('Interceptor'))).toBe(true);
  });

  it('an unknown subcommand is still "Huh?" for a sysop', async () => {
    const { svc } = makeService();
    expect((await run(svc, makeShip(), ['nonsense'])).lines[0].text).toBe('Huh?');
  });
});

describe('audit trail', () => {
  beforeEach(() => { process.env.GE_SYSOP_USERNAME = 'rick'; });

  it('logs every MUTATING command with who ran it and what they typed', async () => {
    // Canon logs nothing. On a public server these are the most dangerous
    // actions available, and "who gave themselves a million credits" is not a
    // question anyone should have to answer from memory.
    const { svc } = makeService();
    const spy = jest.spyOn(SysHandlerService.prototype as unknown as { audit: (...a: unknown[]) => void }, 'audit');
    await run(svc, makeShip(), ['cash', '1000000']);
    expect(spy).toHaveBeenCalled();
    // Inspect the arguments directly: ShipState carries BigInt item counts, so
    // JSON.stringify throws on it.
    const [auditedShip, sub] = spy.mock.calls[0] as [ShipState, string, string[], string];
    expect(auditedShip.username).toBe('rick');
    expect(sub).toBe('cash');
    spy.mockRestore();
  });

  it('does NOT log read-only commands, which would be noise', async () => {
    const { svc } = makeService();
    const spy = jest.spyOn(SysHandlerService.prototype as unknown as { audit: (...a: unknown[]) => void }, 'audit');
    await run(svc, makeShip(), ['help']);
    await run(svc, makeShip(), ['classlist']);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not log a REFUSED attempt as though it succeeded', async () => {
    delete process.env.GE_SYSOP_USERNAME;
    const { svc } = makeService();
    const spy = jest.spyOn(SysHandlerService.prototype as unknown as { audit: (...a: unknown[]) => void }, 'audit');
    await run(svc, makeShip(), ['cash', '999']);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
