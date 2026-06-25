import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { MineHandlerService } from '../../../../src/game/commands/handlers/mine.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { MineRegistry } from '../../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../../src/game/combat/mine.repository';
import { I_MINE } from '../../../../src/game/constants/items';
import { FIRETICKS, USERMINES } from '../../../../src/game/constants';

function itemsWith(map: Record<number, bigint>): bigint[] {
  const arr: bigint[] = [];
  for (let i = 0; i < 14; i++) arr.push(0n);
  for (const [k, v] of Object.entries(map)) arr[Number(k)] = v;
  return arr;
}

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 100000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: itemsWith({ [I_MINE]: 5n }),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  };
}

function makeHarness(ships: ShipState[], classCfg: Record<number, { hasMine?: boolean }> = {}) {
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

  const cache = new ShipClassCacheService({} as never);
  // Default class 1: has mine launcher
  cache.setForTest(1, { maxAcceleration: 1000, maxWarp: 10, hasMine: true } as never);
  for (const [cls, cfg] of Object.entries(classCfg)) {
    cache.setForTest(Number(cls), {
      maxAcceleration: 1000, maxWarp: 10,
      hasMine: cfg.hasMine ?? true,
    } as never);
  }

  const registry = new MineRegistry();
  let nextId = 100;
  const repo = {
    create: jest.fn().mockImplementation(async (input: { channel: number; timer: number; xcoord: number; ycoord: number; deployedBy: string }) => ({
      id: nextId++,
      ...input,
    })),
    delete: jest.fn().mockResolvedValue(undefined),
    findAllActive: jest.fn().mockResolvedValue([]),
  } as unknown as MineRepository;

  const handler = new MineHandlerService(shipState, repo, registry, cache);
  return { handler, shipMap, registry, repo, cache };
}

const ctx: CommandContext = {};

describe('MineHandlerService — `min` (Plan 3 T1, C-004)', () => {
  it('1. rejects when ship class has no mine launcher (MIN_NOMINE)', async () => {
    const alice = makeShip({ shpclass: 2 });
    const h = makeHarness([alice], { 2: { hasMine: false } });
    const result = await (h.handler.command.handler(alice, [], ctx) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MIN_NOMINE));
    expect(h.repo.create).not.toHaveBeenCalled();
  });

  it('2. rejects when ship is cloaked (MIN_CLOAK)', async () => {
    const alice = makeShip({ cloak: 5 });
    const h = makeHarness([alice]);
    const result = await (h.handler.command.handler(alice, [], ctx) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MIN_CLOAK));
    expect(h.repo.create).not.toHaveBeenCalled();
  });

  it('3. rejects when in neutral zone — plain refusal, no self-zap (MIN_NEUTRAL)', async () => {
    const alice = makeShip({ xcoord: 0, ycoord: 0 });
    const h = makeHarness([alice]);
    const result = await (h.handler.command.handler(alice, [], ctx) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MIN_NEUTRAL));
    expect(h.repo.create).not.toHaveBeenCalled();
    // Plain refusal — no damage applied
    expect(alice.damage).toBe(0);
  });

  it('4a. accepts timer arg 45 — deploys with timer 45', async () => {
    const alice = makeShip({ userid: 'a', shipno: 7, xcoord: 12, ycoord: 34 });
    const h = makeHarness([alice]);
    const result = await (h.handler.command.handler(alice, ['45'], ctx) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MIN_DEPLOYED));
    expect(h.repo.create).toHaveBeenCalledWith(expect.objectContaining({ timer: 45 }));
  });

  it('4b. rejects timer arg 0 (NUMOOR 1-50)', async () => {
    const alice = makeShip();
    const h = makeHarness([alice]);
    const result = await (h.handler.command.handler(alice, ['0'], ctx) as Promise<CommandResult>);
    expect(result.lines[0].text).toContain('out of range');
    expect(h.repo.create).not.toHaveBeenCalled();
  });

  it('4c. rejects timer arg 51 (NUMOOR 1-50)', async () => {
    const alice = makeShip();
    const h = makeHarness([alice]);
    const result = await (h.handler.command.handler(alice, ['51'], ctx) as Promise<CommandResult>);
    expect(result.lines[0].text).toContain('out of range');
    expect(h.repo.create).not.toHaveBeenCalled();
  });

  it('5. default timer 30 when no arg given', async () => {
    const alice = makeShip({ userid: 'a', shipno: 7, xcoord: 12, ycoord: 34 });
    const h = makeHarness([alice]);
    const result = await (h.handler.command.handler(alice, [], ctx) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MIN_DEPLOYED));
    expect(h.repo.create).toHaveBeenCalledWith(expect.objectContaining({ timer: 30 }));
  });

  it('6. rejects when per-player live-mine cap reached (MIN_FULL)', async () => {
    const alice = makeShip({ userid: 'alice', shipno: 1 });
    const h = makeHarness([alice]);
    // Pre-populate registry with USERMINES mines deployed by alice
    for (let i = 0; i < USERMINES; i++) {
      h.registry.add({ id: i, channel: 99, timer: 30, xcoord: 5, ycoord: 5, deployedBy: 'alice' });
    }
    const result = await (h.handler.command.handler(alice, [], ctx) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MIN_FULL));
    expect(h.repo.create).not.toHaveBeenCalled();
  });

  it('7. happy path — deploys mine, decrements ammo, sets cantexit = FIRETICKS', async () => {
    const alice = makeShip({ userid: 'a', shipno: 7, xcoord: 12, ycoord: 34 });
    const h = makeHarness([alice]);

    const result = await (h.handler.command.handler(alice, [], ctx) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MIN_DEPLOYED));

    expect(h.repo.create).toHaveBeenCalledWith({
      channel: 7,
      timer: 30,
      xcoord: 12,
      ycoord: 34,
      deployedBy: 'a',
    });
    expect(h.registry.getAll().length).toBe(1);
    expect(alice.items[I_MINE]).toBe(4n);
    expect(alice.cantexit).toBe(FIRETICKS);
  });
});
