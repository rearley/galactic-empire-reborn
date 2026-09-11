/**
 * T028 — Unit spec for JettisonHandlerService.
 * Happy path (numeric amt, ALL keyword) and rejection paths.
 * Non-recovery assertion: jettisoned items are permanently lost.
 * @see GECMDS.C:6102 cmd_jettison
 * @see contracts/commands.md §jettison
 */
import { JettisonHandlerService } from '../../../../src/game/commands/handlers/jettison.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { I_FOOD, I_GOLD, NUMITEMS } from '../../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 5,
    ycoord: 5,
    energy: 10000,
    items: Array(NUMITEMS).fill(0n) as bigint[],
    ...overrides,
  });
}

function makeService(ship: ShipState) {
  const mockShipState = {
    mutate: vi.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        fn(ship);
        return ship;
      },
    ),
  } as unknown as ShipStateService;
  return { handler: new JettisonHandlerService(mockShipState), mockShipState };
}

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

describe('JettisonHandlerService — happy path (numeric amount)', () => {
  it('returns JET_OK success line (SC-007)', () => {
    const ship = makeShip({ items: Object.assign(Array(NUMITEMS).fill(0n), { [I_FOOD]: 50n }) as bigint[] });
    const { handler } = makeService(ship);
    const result = handler.command.handler(ship, ['10', 'food'], {}) as { lines: { text: string; category: string }[] };
    // JETT3 is '%s %s have been jettisoned, Sir!' — count first, then the item.
    expect(result.lines[0].text).toBe('10 food cases have been jettisoned, Sir!');
    expect(result.lines[0].category).toBe('success');
  });

  it('reduces items[I_FOOD] by the jettisoned amount', () => {
    const ship = makeShip({ items: Object.assign(Array(NUMITEMS).fill(0n), { [I_FOOD]: 50n }) as bigint[] });
    const { handler } = makeService(ship);
    handler.command.handler(ship, ['10', 'food'], {});
    expect(ship.items[I_FOOD]).toBe(40n);
  });

  it('jettison exactly all cargo (amt == qty)', () => {
    const ship = makeShip({ items: Object.assign(Array(NUMITEMS).fill(0n), { [I_FOOD]: 50n }) as bigint[] });
    const { handler } = makeService(ship);
    handler.command.handler(ship, ['50', 'food'], {});
    expect(ship.items[I_FOOD]).toBe(0n);
  });

  it('non-recovery: jettisoned items are permanently lost (no planet/sector inventory change)', () => {
    const ship = makeShip({ items: Object.assign(Array(NUMITEMS).fill(0n), { [I_GOLD]: 100n }) as bigint[] });
    const { handler } = makeService(ship);
    handler.command.handler(ship, ['50', 'gold'], {});
    // Gold is now 50 — it just disappears, no external state changes
    expect(ship.items[I_GOLD]).toBe(50n);
  });
});

describe('JettisonHandlerService — happy path (ALL keyword)', () => {
  it('ALL keyword jettisons entire stack', () => {
    const ship = makeShip({ items: Object.assign(Array(NUMITEMS).fill(0n), { [I_FOOD]: 73n }) as bigint[] });
    const { handler } = makeService(ship);
    const result = handler.command.handler(ship, ['ALL', 'food'], {}) as { lines: { text: string }[] };
    expect(ship.items[I_FOOD]).toBe(0n);
    expect(result.lines[0].text).toContain('73');
  });

  it('ALL keyword is case-insensitive (accepts "all")', () => {
    const ship = makeShip({ items: Object.assign(Array(NUMITEMS).fill(0n), { [I_FOOD]: 20n }) as bigint[] });
    const { handler } = makeService(ship);
    handler.command.handler(ship, ['all', 'food'], {});
    expect(ship.items[I_FOOD]).toBe(0n);
  });

  it('ALL on empty item slot → JET_FMT (nothing to jettison, jettAmt=0)', () => {
    const ship = makeShip({ items: Array(NUMITEMS).fill(0n) as bigint[] });
    const { handler, mockShipState } = makeService(ship);
    const result = handler.command.handler(ship, ['ALL', 'food'], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JET_FMT));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Rejection paths
// ---------------------------------------------------------------------------

describe('JettisonHandlerService — rejection paths', () => {
  it('unknown item keyword → JET_FMT, no mutation', () => {
    const ship = makeShip();
    const { handler, mockShipState } = makeService(ship);
    const result = handler.command.handler(ship, ['10', 'unobtainium'], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JET_FMT));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('amt > items[i] → JET_NO_CARGO, no mutation', () => {
    const ship = makeShip({ items: Object.assign(Array(NUMITEMS).fill(0n), { [I_FOOD]: 5n }) as bigint[] });
    const { handler, mockShipState } = makeService(ship);
    const result = handler.command.handler(ship, ['100', 'food'], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JET_NO_CARGO));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('amt <= 0 → JET_FMT, no mutation', () => {
    const ship = makeShip();
    const { handler, mockShipState } = makeService(ship);
    const result = handler.command.handler(ship, ['0', 'food'], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JET_FMT));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('negative amount → JET_FMT, no mutation', () => {
    const ship = makeShip();
    const { handler, mockShipState } = makeService(ship);
    const result = handler.command.handler(ship, ['-5', 'food'], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JET_FMT));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });
});

describe('JettisonHandlerService — command metadata', () => {
  it('keyword is "jettison", alias includes "jet", minArgs is 2', () => {
    const ship = makeShip();
    const { handler } = makeService(ship);
    expect(handler.command.keyword).toBe('jettison');
    expect(handler.command.aliases).toContain('jet');
    expect(handler.command.minArgs).toBe(2);
  });
});
