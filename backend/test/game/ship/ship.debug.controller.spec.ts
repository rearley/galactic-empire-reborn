/**
 * Dev-only ship outfit endpoint used for combat playtesting.
 *
 * Ship state lives in the ShipStateService map, not Postgres (the DB is a flush
 * target), so a tester cannot set up an engagement with SQL — the next flush
 * overwrites it. Buying ordnance in-game means flying to Zygor and trading,
 * which is minutes of real time per attempt and impossible once a Cybertron has
 * you at high damage.
 *
 * This endpoint mutates the live in-memory ship so torpedo/missile/mine/shield
 * paths can actually be exercised. Gated behind NODE_ENV !== 'production' by the
 * module registration, exactly like the droid and cybertron debug controllers.
 */

import { BadRequestException } from '@nestjs/common';
import { ShipDebugController } from '../../../src/game/ship/ship.debug.controller';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS, I_TORP, I_MISSL, I_MINE } from '../../../src/game/constants/items';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Reliant', shpclass: 1,
    damage: 72, energy: 1000, phasr: 0, phasrtype: 1, xcoord: 0, ycoord: 0,
    shieldtype: 1, shieldstat: 0, shield: 0,
    items: new Array(NUMITEMS).fill(0n),
    ...over,
  } as ShipState;
}

function build(ship: ShipState | undefined) {
  const mutate = jest.fn((_uid: string, _no: number, fn: (s: ShipState) => void) => {
    if (!ship) return undefined;
    fn(ship);
    return ship;
  });
  const shipState = {
    findByName: (n: string) => (ship && ship.shipname.toLowerCase() === n.toLowerCase() ? ship : undefined),
    mutate,
  } as unknown as ShipStateService;
  return { controller: new ShipDebugController(shipState), mutate };
}

describe('POST /debug/ship/outfit', () => {
  it('grants ordnance to the named ship', () => {
    const ship = makeShip();
    const { controller } = build(ship);

    controller.outfit('Reliant', '5', '4', '3', undefined);

    expect(ship.items[I_TORP]).toBe(5n);
    expect(ship.items[I_MISSL]).toBe(4n);
    expect(ship.items[I_MINE]).toBe(3n);
  });

  it('sets hull damage when asked', () => {
    const ship = makeShip({ damage: 72 });
    const { controller } = build(ship);

    controller.outfit('Reliant', undefined, undefined, undefined, '0');

    expect(ship.damage).toBe(0);
  });

  it('leaves unspecified fields alone', () => {
    const ship = makeShip({ damage: 72 });
    const { controller } = build(ship);

    controller.outfit('Reliant', '2', undefined, undefined, undefined);

    expect(ship.items[I_TORP]).toBe(2n);
    expect(ship.damage).toBe(72);           // untouched
    expect(ship.items[I_MISSL]).toBe(0n);   // untouched
  });

  it('reports the resulting state so a tester can confirm the setup', () => {
    const ship = makeShip();
    const { controller } = build(ship);

    const res = controller.outfit('Reliant', '5', undefined, undefined, '10') as Record<string, unknown>;

    expect(res.ok).toBe(true);
    expect(res.shipname).toBe('Reliant');
    expect(res.damage).toBe(10);
  });

  it('teleports the ship when x and y are given', () => {
    const ship = makeShip({ xcoord: 0, ycoord: 0 });
    const { controller } = build(ship);

    controller.outfit('Reliant', undefined, undefined, undefined, undefined, '4.5', '-2.25');

    expect(ship.xcoord).toBe(4.5);
    expect(ship.ycoord).toBe(-2.25);
  });

  it('leaves position alone when x and y are omitted', () => {
    const ship = makeShip({ xcoord: 1.5, ycoord: 2.5 });
    const { controller } = build(ship);

    controller.outfit('Reliant', '3', undefined, undefined, undefined, undefined, undefined);

    expect(ship.xcoord).toBe(1.5);
    expect(ship.ycoord).toBe(2.5);
  });

  it('requires x and y together', () => {
    const ship = makeShip();
    const { controller } = build(ship);
    expect(() =>
      controller.outfit('Reliant', undefined, undefined, undefined, undefined, '4.5', undefined),
    ).toThrow(BadRequestException);
  });

  it('rejects a non-finite coordinate', () => {
    const ship = makeShip();
    const { controller } = build(ship);
    expect(() =>
      controller.outfit('Reliant', undefined, undefined, undefined, undefined, 'over-there', '0'),
    ).toThrow(BadRequestException);
  });

  it('accepts negative coordinates — ships legitimately fly negative sectors', () => {
    const ship = makeShip();
    const { controller } = build(ship);
    controller.outfit('Reliant', undefined, undefined, undefined, undefined, '-13.5', '-7.25');
    expect(ship.xcoord).toBe(-13.5);
    expect(ship.ycoord).toBe(-7.25);
  });

  it('switches the hull class when shpclass is given', () => {
    const ship = makeShip({ shpclass: 1 });
    const { controller } = build(ship);

    controller.outfit('Reliant', undefined, undefined, undefined, undefined, undefined, undefined, '2');

    expect(ship.shpclass).toBe(2);
  });

  it('leaves the hull class alone when shpclass is omitted', () => {
    const ship = makeShip({ shpclass: 1 });
    const { controller } = build(ship);

    controller.outfit('Reliant', '3', undefined, undefined, undefined, undefined, undefined, undefined);

    expect(ship.shpclass).toBe(1);
  });

  it('rejects a shpclass that is not a positive integer', () => {
    const ship = makeShip();
    const { controller } = build(ship);
    expect(() =>
      controller.outfit('Reliant', undefined, undefined, undefined, undefined, undefined, undefined, '0'),
    ).toThrow(BadRequestException);
  });

  it('rejects an unknown ship rather than silently doing nothing', () => {
    const { controller } = build(undefined);
    expect(() => controller.outfit('Nonexistent', '1', undefined, undefined, undefined)).toThrow(BadRequestException);
  });

  it('rejects non-numeric quantities', () => {
    const ship = makeShip();
    const { controller } = build(ship);
    expect(() => controller.outfit('Reliant', 'lots', undefined, undefined, undefined)).toThrow(BadRequestException);
  });

  it('rejects a damage value outside 0..100', () => {
    const ship = makeShip();
    const { controller } = build(ship);
    expect(() => controller.outfit('Reliant', undefined, undefined, undefined, '150')).toThrow(BadRequestException);
  });
});
