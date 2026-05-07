/**
 * T036 — Unit spec for AbortHandlerService.
 * Happy path (with SELFD4A broadcast condition) and no-active-destruct rejection.
 * @see GECMDS.C:5044 cmd_abort
 * @see contracts/commands.md §abort
 */
import { AbortHandlerService } from '../../../../src/game/commands/handlers/abort.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'USS Survivor', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    dirty: false,
    ...overrides,
  };
}

function makeService(ship: ShipState) {
  const mockShipState = {
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        fn(ship);
        return ship;
      },
    ),
  } as unknown as ShipStateService;
  return { handler: new AbortHandlerService(mockShipState), mockShipState };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('AbortHandlerService — happy path (SC-007)', () => {
  it('clears ship.destruct to 0 and returns ABORT_OK', () => {
    const ship = makeShip({ destruct: 15 });
    const { handler } = makeService(ship);
    const result = handler.command.handler(ship, [], {}) as { lines: { text: string; category: string }[] };
    expect(ship.destruct).toBe(0);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABORT_OK));
    expect(result.lines[0].category).toBe('success');
  });
});

describe('AbortHandlerService — SELFD4A sector broadcast condition', () => {
  it('destruct < 10 at abort → sector broadcast emitted', () => {
    const ship = makeShip({ destruct: 5, xcoord: 7.3, ycoord: 4.9 });
    const { handler } = makeService(ship);
    const result = handler.command.handler(ship, [], {}) as {
      lines: unknown[];
      broadcasts?: { room: string; event: string; payload: { text: string } }[];
    };
    expect(result.broadcasts).toBeDefined();
    expect(result.broadcasts![0].room).toBe('sector:7:4');
    expect(result.broadcasts![0].payload.text).toContain('USS Survivor');
  });

  it('destruct = 9 (boundary, < 10) → sector broadcast emitted', () => {
    const ship = makeShip({ destruct: 9 });
    const { handler } = makeService(ship);
    const result = handler.command.handler(ship, [], {}) as { broadcasts?: unknown[] };
    expect(result.broadcasts).toBeDefined();
    expect(result.broadcasts).toHaveLength(1);
  });

  it('destruct = 10 (boundary, NOT < 10) → no sector broadcast', () => {
    const ship = makeShip({ destruct: 10 });
    const { handler } = makeService(ship);
    const result = handler.command.handler(ship, [], {}) as { broadcasts?: unknown[] };
    expect(result.broadcasts).toBeUndefined();
  });

  it('destruct = 20 (full countdown, >= 10) → no sector broadcast', () => {
    const ship = makeShip({ destruct: 20 });
    const { handler } = makeService(ship);
    const result = handler.command.handler(ship, [], {}) as { broadcasts?: unknown[] };
    expect(result.broadcasts).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rejection path
// ---------------------------------------------------------------------------

describe('AbortHandlerService — rejection paths', () => {
  it('no active self-destruct (destruct == 0) → ABORT_NONE, no mutation', () => {
    const ship = makeShip({ destruct: 0 });
    const { handler, mockShipState } = makeService(ship);
    const result = handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABORT_NONE));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('destruct < 0 (should not exist, treated as off) → ABORT_NONE', () => {
    const ship = makeShip({ destruct: -1 });
    const { handler, mockShipState } = makeService(ship);
    const result = handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABORT_NONE));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });
});

describe('AbortHandlerService — command metadata', () => {
  it('keyword is "abort", alias includes "abo", minArgs is 0', () => {
    const ship = makeShip();
    const { handler } = makeService(ship);
    expect(handler.command.keyword).toBe('abort');
    expect(handler.command.aliases).toContain('abo');
    expect(handler.command.minArgs).toBe(0);
  });
});
