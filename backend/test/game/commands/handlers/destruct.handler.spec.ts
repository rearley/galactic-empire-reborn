/**
 * T035 — Unit spec for DestructHandlerService.
 * Happy path, neutral-zone rejection, already-active rejection.
 * @see GECMDS.C:5025 cmd_destruct
 * @see contracts/commands.md §destruct
 */
import { DestructHandlerService } from '../../../../src/game/commands/handlers/destruct.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { COUNTDOWN } from '../../../../src/game/commands/_ship-management-constants';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'USS Doomed', shpclass: 1,
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
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
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
  return { handler: new DestructHandlerService(mockShipState), mockShipState };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('DestructHandlerService — happy path', () => {
  it('sets ship.destruct = COUNTDOWN (20), returns DESTRUCT_START (SC-007)', () => {
    const ship = makeShip({ xcoord: 5.5, ycoord: 5.5, destruct: 0 });
    const { handler } = makeService(ship);
    const result = handler.command.handler(ship, [], {}) as { lines: { text: string; category: string }[] };
    expect(ship.destruct).toBe(COUNTDOWN);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.DESTRUCT_START));
    expect(result.lines[0].category).toBe('system');
  });

  it('broadcasts DESTRUCT_SECTOR_START to the sector room', () => {
    const ship = makeShip({ xcoord: 7.3, ycoord: 4.9, destruct: 0 });
    const { handler } = makeService(ship);
    const result = handler.command.handler(ship, [], {}) as {
      lines: unknown[];
      broadcasts?: { room: string; event: string; payload: { text: string } }[];
    };
    expect(result.broadcasts).toBeDefined();
    expect(result.broadcasts![0].room).toBe('sector:7:4');
    expect(result.broadcasts![0].event).toBe('event.log');
    expect(result.broadcasts![0].payload.text).toContain('USS Doomed');
  });
});

// ---------------------------------------------------------------------------
// Rejection paths
// ---------------------------------------------------------------------------

describe('DestructHandlerService — rejection paths', () => {
  it('neutral zone (sector 0,0) → DESTRUCT_NZ, no mutation', () => {
    const ship = makeShip({ xcoord: 0.5, ycoord: 0.5 });
    const { handler, mockShipState } = makeService(ship);
    const result = handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.DESTRUCT_NZ));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('already counting down (destruct > 0) → DESTRUCT_ACTIVE, no mutation', () => {
    const ship = makeShip({ destruct: 15 });
    const { handler, mockShipState } = makeService(ship);
    const result = handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.DESTRUCT_ACTIVE));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });
});

describe('DestructHandlerService — command metadata', () => {
  it('keyword is "destruct", alias includes "des", minArgs is 0', () => {
    const ship = makeShip();
    const { handler } = makeService(ship);
    expect(handler.command.keyword).toBe('destruct');
    expect(handler.command.aliases).toContain('des');
    expect(handler.command.minArgs).toBe(0);
  });
});
