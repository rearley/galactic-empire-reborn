/**
 * T038 — Unit tests for DroidSpawnedEvent and DroidKilledEvent payload shapes.
 *
 * These tests verify that the interface contracts match the data-model spec.
 * Constructing typed objects below catches any shape regression at compile time;
 * the runtime assertions document the contract for future readers.
 *
 * @see specs/019-physics-polish/data-model.md §DroidSpawnedEvent §DroidKilledEvent
 */

import { DroidSpawnedEvent, DroidKilledEvent } from '../../../src/game/droid/droid-events';

describe('DroidSpawnedEvent shape', () => {
  it('has ephemeral: true as a literal constant', () => {
    const e: DroidSpawnedEvent = {
      shipId: '@Droid-1',
      shipname: 'Garbage Scow',
      shpclass: 31,
      sector: { x: 5, y: 3 },
      ephemeral: true,
      spawnedAt: 0,
    };
    expect(e.ephemeral).toBe(true);
  });

  it('has shipId, shipname, shpclass, sector, spawnedAt fields', () => {
    const now = Date.now();
    const e: DroidSpawnedEvent = {
      shipId: '@Droid-7',
      shipname: 'Murdonian Transport',
      shpclass: 32,
      sector: { x: 10, y: 7 },
      ephemeral: true,
      spawnedAt: now,
    };
    expect(e.shipId).toBe('@Droid-7');
    expect(e.shipname).toBe('Murdonian Transport');
    expect(e.shpclass).toBe(32);
    expect(e.sector).toEqual({ x: 10, y: 7 });
    expect(e.spawnedAt).toBe(now);
  });

  it('userid prefix is @Droid-', () => {
    const e: DroidSpawnedEvent = {
      shipId: '@Droid-3',
      shipname: 'Vakory Survey Drone',
      shpclass: 33,
      sector: { x: 1, y: 1 },
      ephemeral: true,
      spawnedAt: 0,
    };
    expect(e.shipId.startsWith('@Droid-')).toBe(true);
  });

  it('accepts all three known droid ship classes (31, 32, 33)', () => {
    const classes = [31, 32, 33];
    for (const cls of classes) {
      const e: DroidSpawnedEvent = {
        shipId: `@Droid-${cls}`,
        shipname: `Class ${cls}`,
        shpclass: cls,
        sector: { x: 0, y: 0 },
        ephemeral: true,
        spawnedAt: 0,
      };
      expect(e.shpclass).toBe(cls);
    }
  });
});

describe('DroidKilledEvent shape', () => {
  it('has shipId, shipname, shpclass, sector, killedBy (nullable), killedAt', () => {
    const now = Date.now();
    const e: DroidKilledEvent = {
      shipId: '@Droid-2',
      shipname: 'Garbage Scow',
      shpclass: 31,
      sector: { x: 4, y: 2 },
      killedBy: 'alice',
      killedAt: now,
    };
    expect(e.shipId).toBe('@Droid-2');
    expect(e.shipname).toBe('Garbage Scow');
    expect(e.shpclass).toBe(31);
    expect(e.sector).toEqual({ x: 4, y: 2 });
    expect(e.killedBy).toBe('alice');
    expect(e.killedAt).toBe(now);
  });

  it('killedBy is null for mine kills', () => {
    const e: DroidKilledEvent = {
      shipId: '@Droid-5',
      shipname: 'Murdonian Transport',
      shpclass: 32,
      sector: { x: 8, y: 4 },
      killedBy: null,
      killedAt: Date.now(),
    };
    expect(e.killedBy).toBeNull();
  });

  it('userid prefix is @Droid-', () => {
    const e: DroidKilledEvent = {
      shipId: '@Droid-9',
      shipname: 'Vakory Survey Drone',
      shpclass: 33,
      sector: { x: 2, y: 2 },
      killedBy: 'bob',
      killedAt: 0,
    };
    expect(e.shipId.startsWith('@Droid-')).toBe(true);
  });
});
