import { MineRegistry, MineState } from '../../../src/game/combat/mine.registry';

function mine(over: Partial<MineState> = {}): MineState {
  return {
    id: 1,
    channel: 1,
    timer: 100,
    xcoord: 0,
    ycoord: 0,
    deployedBy: 'u1',
    ...over,
  };
}

describe('MineRegistry', () => {
  let reg: MineRegistry;

  beforeEach(() => {
    reg = new MineRegistry();
  });

  describe('hydrate', () => {
    it('replaces existing entries with the supplied snapshot', () => {
      reg.add(mine({ id: 99 }));
      reg.hydrate([mine({ id: 1 }), mine({ id: 2 })]);
      const all = reg.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((m) => m.id).sort()).toEqual([1, 2]);
    });

    it('clears the map when given an empty array', () => {
      reg.add(mine({ id: 5 }));
      reg.hydrate([]);
      expect(reg.getAll()).toHaveLength(0);
    });
  });

  describe('add / remove', () => {
    it('add() inserts a mine', () => {
      reg.add(mine({ id: 7 }));
      expect(reg.getAll()).toHaveLength(1);
    });

    it('remove() deletes a mine by id', () => {
      reg.add(mine({ id: 7 }));
      reg.remove(7);
      expect(reg.getAll()).toHaveLength(0);
    });

    it('remove() is a no-op for unknown id', () => {
      expect(() => reg.remove(999)).not.toThrow();
    });
  });

  describe('tickAll', () => {
    it('decrements every mine timer by one', () => {
      reg.hydrate([mine({ id: 1, timer: 10 }), mine({ id: 2, timer: 5 })]);
      reg.tickAll();
      const byId = new Map(reg.getAll().map((m) => [m.id, m]));
      expect(byId.get(1)!.timer).toBe(9);
      expect(byId.get(2)!.timer).toBe(4);
    });
  });

  describe('sweepCandidates', () => {
    it('returns only mines whose timer is divisible by 5', () => {
      reg.hydrate([
        mine({ id: 1, timer: 0 }),
        mine({ id: 2, timer: 1 }),
        mine({ id: 3, timer: 5 }),
        mine({ id: 4, timer: 7 }),
        mine({ id: 5, timer: 10 }),
      ]);
      const ids = reg.sweepCandidates().map((m) => m.id).sort();
      expect(ids).toEqual([1, 3, 5]);
    });

    it('excludes timer values 1-4', () => {
      reg.hydrate([
        mine({ id: 1, timer: 1 }),
        mine({ id: 2, timer: 2 }),
        mine({ id: 3, timer: 3 }),
        mine({ id: 4, timer: 4 }),
      ]);
      expect(reg.sweepCandidates()).toHaveLength(0);
    });
  });
});
