/**
 * T023 — Unit spec for TransferHandlerService.
 * Happy path (cargo + gold) and all rejection paths; atomicity on rejection.
 * @see GECMDS.C:3271 cmd_transfer (semantics reinterpreted — see research.md D1)
 * @see contracts/commands.md §transfer
 */
import { TransferHandlerService } from '../../../../src/game/commands/handlers/transfer.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { I_FOOD, I_GOLD } from '../../../../src/game/constants/items';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  const items = Array(14).fill(0n) as bigint[];
  return {
    userid: 'u1', shipno: 1, shipname: 'Alice', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items,
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(sourceShip: ShipState, targetShip?: ShipState) {
  const ships = targetShip ? [sourceShip, targetShip] : [sourceShip];
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(`${s.userid}:${s.shipno}`, s);

  const mockShipState = {
    findAllShips: jest.fn().mockReturnValue(ships),
    mutate: jest.fn().mockImplementation(
      (uid: string, no: number, fn: (s: ShipState) => void) => {
        const s = shipMap.get(`${uid}:${no}`);
        if (s) fn(s);
        return s;
      },
    ),
  } as unknown as ShipStateService;

  const handler = new TransferHandlerService(mockShipState);
  return { handler, mockShipState };
}

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

describe('TransferHandlerService — happy path (cargo)', () => {
  it('transfers cargo from source to target, debiting source and crediting target (SC-007)', () => {
    const src = makeShip({ userid: 'u1', shipno: 1, items: Object.assign(Array(14).fill(0n) as bigint[], { [I_FOOD]: 50n }) });
    const tgt = makeShip({ userid: 'u2', shipno: 2, shipname: 'Bob', xcoord: 5, ycoord: 5 });
    const { handler } = makeService(src, tgt);

    const result = handler.command.handler(src, ['10', 'food', '2'], {}) as { lines: { text: string; category: string }[] };
    expect(result.lines[0].text).toContain('Transferred');
    expect(result.lines[0].category).toBe('success');
    expect(src.items[I_FOOD]).toBe(40n);
    expect(tgt.items[I_FOOD]).toBe(10n);
  });

  it('broadcasts TRAN_RECEIVED to the target user room', () => {
    const src = makeShip({ userid: 'u1', shipno: 1, shipname: 'Alice', items: Object.assign(Array(14).fill(0n) as bigint[], { [I_FOOD]: 50n }) });
    const tgt = makeShip({ userid: 'u2', shipno: 2, shipname: 'Bob', xcoord: 5, ycoord: 5 });
    const { handler } = makeService(src, tgt);

    const result = handler.command.handler(src, ['10', 'food', '2'], {}) as { lines: unknown[]; broadcasts?: { room: string; event: string; payload: { text: string } }[] };
    expect(result.broadcasts).toBeDefined();
    expect(result.broadcasts![0].room).toBe('user:u2');
    expect(result.broadcasts![0].event).toBe('event.log');
    expect(result.broadcasts![0].payload.text).toContain('Alice');
  });
});

describe('TransferHandlerService — happy path (gold)', () => {
  it('transfers gold using "gold" keyword', () => {
    const src = makeShip({ userid: 'u1', shipno: 1, items: Object.assign(Array(14).fill(0n) as bigint[], { [I_GOLD]: 1000n }) });
    const tgt = makeShip({ userid: 'u2', shipno: 2, shipname: 'Bob', xcoord: 5, ycoord: 5 });
    const { handler } = makeService(src, tgt);

    const result = handler.command.handler(src, ['100', 'gold', '2'], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toContain('Transferred');
    expect(src.items[I_GOLD]).toBe(900n);
    expect(tgt.items[I_GOLD]).toBe(100n);
  });
});

// ---------------------------------------------------------------------------
// Rejection paths — atomicity
// ---------------------------------------------------------------------------

describe('TransferHandlerService — rejection paths', () => {
  it('self-transfer → TRAN_SELF, no mutation', () => {
    const src = makeShip({ shipno: 1, items: Object.assign(Array(14).fill(0n) as bigint[], { [I_FOOD]: 50n }) });
    const { handler, mockShipState } = makeService(src);

    const result = handler.command.handler(src, ['10', 'food', '1'], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TRAN_SELF));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('target offline (not in active ships) → TRAN_OFFLINE, no mutation', () => {
    const src = makeShip({ shipno: 1, items: Object.assign(Array(14).fill(0n) as bigint[], { [I_FOOD]: 50n }) });
    const { handler, mockShipState } = makeService(src); // no target added

    const result = handler.command.handler(src, ['10', 'food', '99'], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TRAN_OFFLINE));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('target in different sector → TRAN_SECTOR, no mutation', () => {
    const src = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5, items: Object.assign(Array(14).fill(0n) as bigint[], { [I_FOOD]: 50n }) });
    const tgt = makeShip({ userid: 'u2', shipno: 2, xcoord: 10, ycoord: 5 }); // different x
    const { handler, mockShipState } = makeService(src, tgt);

    const result = handler.command.handler(src, ['10', 'food', '2'], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TRAN_SECTOR));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('insufficient cargo → TRAN_NO_CARGO, no mutation', () => {
    const src = makeShip({ userid: 'u1', shipno: 1, items: Object.assign(Array(14).fill(0n) as bigint[], { [I_FOOD]: 5n }) });
    const tgt = makeShip({ userid: 'u2', shipno: 2, xcoord: 5, ycoord: 5 });
    const { handler, mockShipState } = makeService(src, tgt);

    const result = handler.command.handler(src, ['10', 'food', '2'], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TRAN_NO_CARGO));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('insufficient gold → TRAN_NO_GOLD, no mutation', () => {
    const src = makeShip({ userid: 'u1', shipno: 1, items: Object.assign(Array(14).fill(0n) as bigint[], { [I_GOLD]: 50n }) });
    const tgt = makeShip({ userid: 'u2', shipno: 2, xcoord: 5, ycoord: 5 });
    const { handler, mockShipState } = makeService(src, tgt);

    const result = handler.command.handler(src, ['100', 'gold', '2'], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TRAN_NO_GOLD));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('unknown item keyword → TRAN_UNKNOWN_ITEM, no mutation', () => {
    const src = makeShip({ userid: 'u1', shipno: 1 });
    const tgt = makeShip({ userid: 'u2', shipno: 2, xcoord: 5, ycoord: 5 });
    const { handler, mockShipState } = makeService(src, tgt);

    const result = handler.command.handler(src, ['10', 'unobtainium', '2'], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TRAN_UNKNOWN_ITEM));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('atomicity: on rejection, NEITHER ship state changes', () => {
    const src = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5, items: Object.assign(Array(14).fill(0n) as bigint[], { [I_FOOD]: 5n }) });
    const tgt = makeShip({ userid: 'u2', shipno: 2, xcoord: 5, ycoord: 5 });
    const srcBefore = src.items[I_FOOD];
    const tgtBefore = tgt.items[I_FOOD];
    const { handler } = makeService(src, tgt);

    handler.command.handler(src, ['100', 'food', '2'], {}); // insufficient cargo
    expect(src.items[I_FOOD]).toBe(srcBefore); // source unchanged
    expect(tgt.items[I_FOOD]).toBe(tgtBefore); // target unchanged
  });
});

describe('TransferHandlerService — command metadata', () => {
  it('keyword is "transfer", alias includes "tra", minArgs is 3', () => {
    const src = makeShip();
    const { handler } = makeService(src);
    expect(handler.command.keyword).toBe('transfer');
    expect(handler.command.aliases).toContain('tra');
    expect(handler.command.minArgs).toBe(3);
  });
});
