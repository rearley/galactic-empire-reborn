import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { MineHandlerService } from '../../../../src/game/commands/handlers/mine.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { MineRegistry } from '../../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../../src/game/combat/mine.repository';
import { I_MINE } from '../../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function itemsWith(map: Record<number, bigint>): bigint[] {
  const arr: bigint[] = [];
  for (let i = 0; i < 14; i++) arr.push(0n);
  for (const [k, v] of Object.entries(map)) arr[Number(k)] = v;
  return arr;
}

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    energy: 100000,
    items: itemsWith({ [I_MINE]: 5n }),
    topspeed: 10,
    // A ship in the game holds a unique `channel` (this port's usrnum) and
    // attribution reads it, not `shipno`. These fixtures stage firer and victim
    // by giving each a distinct shipno, so mirror it into channel.
    channel: over.channel ?? over.shipno ?? 1,
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

  const registry = new MineRegistry();
  let nextId = 100;
  const repo = {
    create: vi.fn().mockImplementation(async (input: { channel: number; timer: number; xcoord: number; ycoord: number; deployedBy: string }) => ({
      id: nextId++,
      ...input,
    })),
    delete: vi.fn().mockResolvedValue(undefined),
    findAllActive: vi.fn().mockResolvedValue([]),
  } as unknown as MineRepository;

  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, { maxAcceleration: 1000, maxWarp: 10, hasMine: true } as never);
  const handler = new MineHandlerService(shipState, repo, registry, cache);
  return { handler, shipMap, registry, repo };
}

const ctx: CommandContext = {};

describe('MineHandlerService — `min`', () => {
  it('happy path — creates mine with correct fields, registers, decrements ammo', async () => {
    const alice = makeShip({ userid: 'a', shipno: 7, xcoord: 12, ycoord: 34 });
    const h = makeHarness([alice]);

    // The fuse is an argument, not a default — canon refuses a bare `min`.
    // @see GECMDS.C:1757 `if (margc != 2 )`
    const result = await (h.handler.command.handler(alice, ['30'], ctx) as Promise<CommandResult>);
    expect(result.lines[0].text).toMatch(/^Neutron Mine launched\. Detonation in \d+ centocks!$/);

    expect(h.repo.create).toHaveBeenCalledWith({
      channel: 7,
      timer: 30,
      xcoord: 12,
      ycoord: 34,
      deployedBy: 'a',
    });
    expect(h.registry.getAll().length).toBe(1);
    expect(alice.items[I_MINE]).toBe(4n);
  });

  it('rejects when items[I_MINE] <= 0 (MIN_NOAMMO)', async () => {
    const alice = makeShip({ xcoord: 5, ycoord: 5, items: itemsWith({ [I_MINE]: 0n }) });
    const h = makeHarness([alice]);
    const result = await (h.handler.command.handler(alice, [], ctx) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MIN_NOAMMO));
    expect(h.repo.create).not.toHaveBeenCalled();
  });
});
