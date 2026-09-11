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
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  const items = Array(NUMITEMS).fill(0n) as bigint[];
  return baseMakeShip({
    shipname: 'Alice',
    xcoord: 5,
    ycoord: 5,
    energy: 10000,
    items: items,
    ...overrides,
  });
}

function buildService(alice: ShipState, bob: ShipState) {
  const ships = [alice, bob];
  const shipMap = new Map<string, ShipState>([
    [`${alice.userid}:${alice.shipno}`, alice],
    [`${bob.userid}:${bob.shipno}`, bob],
  ]);
  const mockShipState = {
    findAllShips: vi.fn().mockReturnValue(ships),
    mutate: vi.fn().mockImplementation(
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

/**
 * These two invariants went vacuous when ship-to-ship addressing changed.
 *
 * They addressed the receiver as `String(receiver.shipno)`, but a BARE NUMBER
 * resolves to a hull in your OWN fleet only (transfer-target.ts:46-51) — a
 * per-user index cannot name a stranger's ship. Alice asking for "2" therefore
 * looked for Alice's second hull, found nothing, and every one of the 200
 * transfers was refused before any cargo moved. Both totals then held trivially:
 * the tests would have passed just as well against a `tra` that created or
 * destroyed cargo outright.
 *
 * The fix is two-part, and the second part is the one that matters: address the
 * receiver BY NAME (the form `loc`, `dat` and `sca sh` already use), and assert
 * that cargo actually moved. A conservation test that cannot tell "conserved"
 * from "nothing happened" is not a conservation test.
 */
describe('transfer conservation across 100 randomized transfers (SC-003)', () => {
  it('total items[i] invariant across 100 successful + failing transfers', () => {
    const rng = seededRng(0xdeadbeef);

    // Start with 1000 units of every transferable item in each ship
    const makeItems = (qty: bigint) => Array(NUMITEMS).fill(qty) as bigint[];

    // ITEM_TONS sums to 316.5 tons for one of each item, so 1,000 of each is
    // 316,500 tons. Against the 1,000-ton default hold every transfer is
    // refused for want of room — the fixture has to fit before conservation
    // can be observed at all.
    const HOLD = 1_000_000;
    const alice = makeShip({ userid: 'u1', shipno: 1, shipname: 'Alice', xcoord: 5, ycoord: 5, maxTons: HOLD, items: makeItems(1000n) });
    const bob   = makeShip({ userid: 'u2', shipno: 2, shipname: 'Bob',   xcoord: 5, ycoord: 5, maxTons: HOLD, items: makeItems(1000n) });

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
      handler.command.handler(sender, [String(amt), itemName.toLowerCase(), receiver.shipname], {});
    }

    // Cargo must actually have moved, or the invariant below proves nothing.
    const moved = alice.items.some((qty, idx) => idx < NUMITEMS && qty !== 1000n);
    expect(moved).toBe(true);

    // After all transfers, verify total of each item is preserved
    for (let idx = 0; idx < NUMITEMS; idx++) {
      const total = (alice.items[idx] ?? 0n) + (bob.items[idx] ?? 0n);
      expect(total).toBe(2000n); // both ships started with 1000 each
    }
  });

  it('total gold invariant: 100 gold-only transfers between two ships', () => {
    const rng = seededRng(0xcafebabe);
    // 5,000 gold is 2,500 tons (ITMWT13: 0.5 t/unit), over the 1,000-ton default.
    const HOLD = 1_000_000;
    const alice = makeShip({ userid: 'u1', shipno: 1, shipname: 'Alice', xcoord: 5, ycoord: 5, maxTons: HOLD, items: Object.assign(Array(NUMITEMS).fill(0n), { [I_GOLD]: 5000n }) as bigint[] });
    const bob   = makeShip({ userid: 'u2', shipno: 2, shipname: 'Bob',   xcoord: 5, ycoord: 5, maxTons: HOLD, items: Object.assign(Array(NUMITEMS).fill(0n), { [I_GOLD]: 5000n }) as bigint[] });

    const handler = buildService(alice, bob);

    for (let i = 0; i < 100; i++) {
      const [sender, receiver] = rng() < 0.5 ? [alice, bob] : [bob, alice];
      const amt = Math.floor(rng() * 500) + 1;
      handler.command.handler(sender, [String(amt), 'gold', receiver.shipname], {});
    }

    // Same guard: prove gold moved before asserting none was created or lost.
    expect(alice.items[I_GOLD]).not.toBe(5000n);

    const totalGold = (alice.items[I_GOLD] ?? 0n) + (bob.items[I_GOLD] ?? 0n);
    expect(totalGold).toBe(10000n); // 5000 + 5000
  });
});
