import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { ZipperHandlerService } from '../../../../src/game/commands/handlers/zipper.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { MineRegistry, MineState } from '../../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../../src/game/combat/mine.repository';
import { I_ZIPPER } from '../../../../src/game/constants/items';

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
    xcoord: 0, ycoord: 0, damage: 0, energy: 100000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: itemsWith({ [I_ZIPPER]: 3n }),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  };
}

function makeHarness(ships: ShipState[], mines: MineState[] = [], scanRange = 50000) {
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

  const registry = new MineRegistry();
  registry.hydrate(mines);
  const repo = {
    delete: jest.fn().mockResolvedValue(undefined),
    create: jest.fn(),
    findAllActive: jest.fn().mockResolvedValue([]),
  } as unknown as MineRepository;

  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange, maxTons: 5000,
  } as never);

  const handler = new ZipperHandlerService(shipState, repo, registry, cache);
  return { handler, shipMap, registry, repo };
}

const ctx: CommandContext = {};

describe('ZipperHandlerService — `zip`', () => {
  it('happy path — sweeps mines in range, calls delete + remove, firer takes no damage', async () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0, ycoord: 0, damage: 0, shield: 0 });
    const mines: MineState[] = [
      { id: 1, channel: 99, timer: 20, xcoord: 0, ycoord: 0.01, deployedBy: 'x' },
      { id: 2, channel: 99, timer: 20, xcoord: 0.1, ycoord: 0, deployedBy: 'x' },
    ];
    const h = makeHarness([alice], mines, 50000);

    const result = await (h.handler.command.handler(alice, [], ctx) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ZIP_SWEPT));

    expect(h.repo.delete).toHaveBeenCalledTimes(2);
    expect(h.registry.getAll().length).toBe(0);
    // Firer NOT damaged
    expect(alice.damage).toBe(0);
    expect(alice.shield).toBe(0);
    expect(alice.items[I_ZIPPER]).toBe(2n);
  });

  it('mines outside range untouched', async () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0, ycoord: 0 });
    const mines: MineState[] = [
      { id: 1, channel: 99, timer: 20, xcoord: 0, ycoord: 0.01, deployedBy: 'x' }, // in range
      { id: 2, channel: 99, timer: 20, xcoord: 10, ycoord: 0, deployedBy: 'x' },   // out
    ];
    const h = makeHarness([alice], mines, 50000);

    await (h.handler.command.handler(alice, [], ctx) as Promise<CommandResult>);
    expect(h.repo.delete).toHaveBeenCalledTimes(1);
    expect(h.registry.getAll().length).toBe(1);
    expect(h.registry.getAll()[0].id).toBe(2);
  });

  it('rejects when items[I_ZIPPER] <= 0 (ZIP_NOAMMO)', async () => {
    const alice = makeShip({ items: itemsWith({ [I_ZIPPER]: 0n }) });
    const h = makeHarness([alice], []);
    const result = await (h.handler.command.handler(alice, [], ctx) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ZIP_NOAMMO));
    expect(h.repo.delete).not.toHaveBeenCalled();
  });

  it('does not sweep a minefield on the far side of the galaxy', async () => {
    // scanRange 50_000 = 5 sectors. C scales cdistance by 10_000 before the
    // gate (GECMDS.C:1703-1707); without it every mine in the galaxy matched.
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 2, ycoord: 3 });
    const mines: MineState[] = [
      { id: 1, channel: 99, timer: 20, xcoord: 22, ycoord: 3, deployedBy: 'x' },
    ];
    const { handler, repo } = makeHarness([alice], mines, 50000);
    await handler.command.handler(alice, [], ctx);
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
