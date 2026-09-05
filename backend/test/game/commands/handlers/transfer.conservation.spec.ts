/**
 * T024 — Conservation test for TransferHandlerService (SC-003).
 * Across 100 randomized transfers between two ships, total items[i] and total gold
 * are invariant — no item is created or destroyed.
 * @see contracts/commands.md SC-003
 */
import { TransferHandlerService } from '../../../../src/game/commands/handlers/transfer.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { I_GOLD, ITEM_NAMES, NUMITEMS } from '../../../../src/game/constants/items';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  const items = Array(NUMITEMS).fill(0n) as bigint[];
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
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function buildService(alice: ShipState, bob: ShipState) {
  const ships = [alice, bob];
  const shipMap = new Map<string, ShipState>([
    [`${alice.userid}:${alice.shipno}`, alice],
    [`${bob.userid}:${bob.shipno}`, bob],
  ]);
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
  return new TransferHandlerService(mockShipState, {} as any);
}

/** Seeded PRNG (mulberry32) — deterministic across runs */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('transfer conservation across 100 randomized transfers (SC-003)', () => {
  it('total items[i] invariant across 100 successful + failing transfers', () => {
    const rng = seededRng(0xdeadbeef);

    // Start with 1000 units of every transferable item in each ship
    const makeItems = (qty: bigint) => Array(NUMITEMS).fill(qty) as bigint[];

    const alice = makeShip({ userid: 'u1', shipno: 1, shipname: 'Alice', xcoord: 5, ycoord: 5, items: makeItems(1000n) });
    const bob   = makeShip({ userid: 'u2', shipno: 2, shipname: 'Bob',   xcoord: 5, ycoord: 5, items: makeItems(1000n) });

    const handler = buildService(alice, bob);

    for (let i = 0; i < 100; i++) {
      // Randomly pick sender and receiver
      const [sender, receiver] = rng() < 0.5 ? [alice, bob] : [bob, alice];

      // Pick a random item index (0..NUMITEMS-1)
      const itemIndex = Math.floor(rng() * NUMITEMS);
      const itemName = ITEM_NAMES[itemIndex] ?? 'gold';

      // Pick a random amount (1..200), may exceed actual inventory
      const amt = Math.floor(rng() * 200) + 1;

      // Execute — handler will reject if insufficient inventory; that's fine
      handler.command.handler(sender, [String(amt), itemName.toLowerCase(), String(receiver.shipno)], {});
    }

    // After all transfers, verify total of each item is preserved
    for (let idx = 0; idx < NUMITEMS; idx++) {
      const total = (alice.items[idx] ?? 0n) + (bob.items[idx] ?? 0n);
      expect(total).toBe(2000n); // both ships started with 1000 each
    }
  });

  it('total gold invariant: 100 gold-only transfers between two ships', () => {
    const rng = seededRng(0xcafebabe);
    const alice = makeShip({ userid: 'u1', shipno: 1, shipname: 'Alice', xcoord: 5, ycoord: 5, items: Object.assign(Array(NUMITEMS).fill(0n), { [I_GOLD]: 5000n }) as bigint[] });
    const bob   = makeShip({ userid: 'u2', shipno: 2, shipname: 'Bob',   xcoord: 5, ycoord: 5, items: Object.assign(Array(NUMITEMS).fill(0n), { [I_GOLD]: 5000n }) as bigint[] });

    const handler = buildService(alice, bob);

    for (let i = 0; i < 100; i++) {
      const [sender, receiver] = rng() < 0.5 ? [alice, bob] : [bob, alice];
      const amt = Math.floor(rng() * 500) + 1;
      handler.command.handler(sender, [String(amt), 'gold', String(receiver.shipno)], {});
    }

    const totalGold = (alice.items[I_GOLD] ?? 0n) + (bob.items[I_GOLD] ?? 0n);
    expect(totalGold).toBe(10000n); // 5000 + 5000
  });
});
