/**
 * Ship-to-ship transfer: quantity parsing and the receiver's hold.
 *
 * Ship-to-ship is PORT-ORIGINAL. Canon's cmd_transfer moves goods between a
 * ship and a planet it orbits and nothing else — the command table has only
 * `tra`, cmd_transfer branches on "up"/"down" alone (GECMDS.C:3283-3295), and
 * HLPTRA says "from your ship to a newly established planet, or from a planet
 * to your ship". So there is no original to check this against, and these
 * tests are the only thing standing behind it.
 *
 * The existing specs covered the happy path, self/offline/sector rejection,
 * insufficient cargo and gold, atomicity and a 100-transfer conservation run.
 * They did not cover either half of what actually bounds a transfer: the
 * quantity you typed, and whether the other hold can take it.
 */
import { TransferHandlerService } from '../../../../src/game/commands/handlers/transfer.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { CommandResult } from '../../../../src/game/commands/command.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ITEM_TONS, I_FOOD, I_ION, I_GOLD, NUMITEMS } from '../../../../src/game/constants/items';
import { GESTAT_AUTO } from '../../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function makeShip(o: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Alice',
    xcoord: 5,
    ycoord: 5,
    energy: 10000,
    items: Array(NUMITEMS).fill(0n) as bigint[],
    ...o,
  });
}

function harness(source: ShipState, target: ShipState) {
  const map = new Map([source, target].map((s) => [`${s.userid}:${s.shipno}`, s]));
  const shipState = {
    findAllShips: () => [source, target],
    mutate: (uid: string, no: number, fn: (s: ShipState) => void) => {
      const s = map.get(`${uid}:${no}`);
      if (s) fn(s);
      return s;
    },
  } as unknown as ShipStateService;
  return new TransferHandlerService(shipState, {} as never);
}

/** A sender/receiver pair in the same sector, receiver hold sized to `maxTons`. */
function pair(sourceItems: Partial<Record<number, bigint>>, maxTons: number, targetItems: Partial<Record<number, bigint>> = {}) {
  const src = makeShip({ userid: 'u1', shipno: 1, shipname: 'Alice' });
  const tgt = makeShip({ userid: 'u2', shipno: 1, shipname: 'Bravo', maxTons });
  for (const [i, q] of Object.entries(sourceItems)) src.items[Number(i)] = q as bigint;
  for (const [i, q] of Object.entries(targetItems)) tgt.items[Number(i)] = q as bigint;
  return { src, tgt, handler: harness(src, tgt) };
}

const run = (h: TransferHandlerService, ship: ShipState, args: string[]) =>
  h.command.handler(ship, args, {}) as CommandResult;

describe('quantity is validated before anything moves', () => {
  it.each([
    ['zero', '0'],
    ['negative', '-5'],
    ['not a number', 'lots'],
    ['empty', ''],
  ])('refuses a %s quantity and moves nothing', (_label, qty) => {
    const { src, tgt, handler } = pair({ [I_FOOD]: 100n }, 1000);
    const res = run(handler, src, [qty, 'foo', 'Bravo']);
    expect(res.lines[0].text).toBe(formatMessage(MessageId.TRAN_FMT));
    expect(src.items[I_FOOD]).toBe(100n);
    expect(tgt.items[I_FOOD]).toBe(0n);
  });

  it('truncates a fractional quantity rather than rejecting it', () => {
    // parseInt('3.7') is 3. Canon's planet path uses atol, which truncates the
    // same way, so this is consistent with the rest of the command — pinned
    // because it is a decision, not an accident.
    const { src, tgt, handler } = pair({ [I_FOOD]: 100n }, 1000);
    run(handler, src, ['3.7', 'foo', 'Bravo']);
    expect(tgt.items[I_FOOD]).toBe(3n);
    expect(src.items[I_FOOD]).toBe(97n);
  });

  it('never lets the sender go negative', () => {
    const { src, tgt, handler } = pair({ [I_FOOD]: 5n }, 1000);
    const res = run(handler, src, ['6', 'foo', 'Bravo']);
    expect(res.lines[0].text).toBe(formatMessage(MessageId.TRAN_NO_CARGO));
    expect(src.items[I_FOOD]).toBe(5n);
    expect(tgt.items[I_FOOD]).toBe(0n);
  });
});

describe("the receiver's hold bounds the transfer", () => {
  it('accepts a load that exactly fills the hold', () => {
    // Food is 2 tons a case (ITMWT06 200 per 100), so 500 cases is 1000 tons.
    expect(ITEM_TONS[I_FOOD]).toBe(2);
    const { src, tgt, handler } = pair({ [I_FOOD]: 500n }, 1000);
    const res = run(handler, src, ['500', 'foo', 'Bravo']);
    expect(res.lines[0].category).toBe('success');
    expect(tgt.items[I_FOOD]).toBe(500n);
  });

  it('refuses one unit past the hold, and moves nothing', () => {
    const { src, tgt, handler } = pair({ [I_FOOD]: 501n }, 1000);
    const res = run(handler, src, ['501', 'foo', 'Bravo']);
    expect(res.lines[0].text).toBe(formatMessage(MessageId.TRAN_NO_ROOM, 'Bravo'));
    expect(src.items[I_FOOD]).toBe(501n);
    expect(tgt.items[I_FOOD]).toBe(0n);
  });

  it('counts what the receiver is already carrying', () => {
    // 400 tons aboard leaves 600, so 300 food fits and 301 does not.
    const { src, tgt, handler } = pair({ [I_FOOD]: 400n }, 1000, { [I_FOOD]: 200n });
    expect(run(handler, src, ['301', 'foo', 'Bravo']).lines[0].text)
      .toBe(formatMessage(MessageId.TRAN_NO_ROOM, 'Bravo'));
    expect(run(handler, src, ['300', 'foo', 'Bravo']).lines[0].category).toBe('success');
    expect(tgt.items[I_FOOD]).toBe(500n);
  });

  it('weighs a heavy item by its own tonnage', () => {
    // Ion cannons are 250 tons each (ITMWT04 25000 per 100): four fill a
    // 1000-ton hull, five do not.
    expect(ITEM_TONS[I_ION]).toBe(250);
    const { src, handler } = pair({ [I_ION]: 10n }, 1000);
    expect(run(handler, src, ['5', 'ion', 'Bravo']).lines[0].text)
      .toBe(formatMessage(MessageId.TRAN_NO_ROOM, 'Bravo'));
    expect(run(handler, src, ['4', 'ion', 'Bravo']).lines[0].category).toBe('success');
  });

  it('weighs gold at canon\'s half-ton, not the pre-3.2d two tons', () => {
    // ITMWT13 in GE/REL is 50 per 100. The forbidden GE/MSG copy says 200,
    // which would make this 500 rather than 2000.
    expect(ITEM_TONS[I_GOLD]).toBe(0.5);
    const { src, handler } = pair({ [I_GOLD]: 3000n }, 1000);
    expect(run(handler, src, ['2001', 'gold', 'Bravo']).lines[0].text)
      .toBe(formatMessage(MessageId.TRAN_NO_ROOM, 'Bravo'));
    expect(run(handler, src, ['2000', 'gold', 'Bravo']).lines[0].category).toBe('success');
  });

  it("bounds on the RECEIVER's hull, not the sender's", () => {
    // A big freighter handing cargo to a small hull must be stopped by the
    // small hull. Sender is left at the 1000-ton default.
    const { src, tgt, handler } = pair({ [I_FOOD]: 500n }, 100);
    const res = run(handler, src, ['51', 'foo', 'Bravo']);
    expect(res.lines[0].text).toBe(formatMessage(MessageId.TRAN_NO_ROOM, 'Bravo'));
    expect(tgt.items[I_FOOD]).toBe(0n);
  });

  it('conserves the total across a refused transfer', () => {
    const { src, tgt, handler } = pair({ [I_FOOD]: 501n }, 1000);
    const before = src.items[I_FOOD] + tgt.items[I_FOOD];
    run(handler, src, ['501', 'foo', 'Bravo']);
    expect(src.items[I_FOOD] + tgt.items[I_FOOD]).toBe(before);
  });
});

describe('ship-to-ship is player-to-player', () => {
  /**
   * Players do not trade with automatons and automatons do not trade with
   * players. That falls out of the status filter rather than a rule of its
   * own: droids spawn `status: GESTAT_AUTO` (droid-spawner.ts) and Cybertrons
   * are written the same way (cybertron.repository.ts), while
   * resolveTransferTarget only considers `status === ACTIVE`.
   *
   * It is asserted here because it is load-bearing and invisible. Were an AI
   * ever to spawn ACTIVE, a player could push cargo into a hold that has no
   * owner to receive it — and the receiving hull would be sized by
   * receiverFreeTons' 1000-ton fallback, since `maxTons` is only ever written
   * on the DB hydration path that ephemeral ships never travel.
   */
  it('will not hand cargo to a droid or Cybertron in the same sector', () => {
    const src = makeShip({ userid: 'u1', shipno: 1, shipname: 'Alice' });
    src.items[I_FOOD] = 100n;
    const droid = makeShip({
      userid: '@Droid-1', shipno: 1, shipname: 'Vakory Survey Drone',
      status: GESTAT_AUTO, maxTons: 100,
    });
    const handler = harness(src, droid);

    const res = run(handler, src, ['10', 'foo', 'Vakory']);
    expect(res.lines[0].text).toBe(formatMessage(MessageId.TRAN_OFFLINE));
    expect(src.items[I_FOOD]).toBe(100n);
    expect(droid.items[I_FOOD]).toBe(0n);
  });

  it('still finds a human ship with the same name shape', () => {
    // Guard the guard: the rejection above must come from the AI status, not
    // from the name failing to match.
    const src = makeShip({ userid: 'u1', shipno: 1, shipname: 'Alice' });
    src.items[I_FOOD] = 100n;
    const human = makeShip({
      userid: 'u2', shipno: 1, shipname: 'Vakory Survey Drone', maxTons: 1000,
    });
    const handler = harness(src, human);

    const res = run(handler, src, ['10', 'foo', 'Vakory']);
    expect(res.lines[0].category).toBe('success');
    expect(human.items[I_FOOD]).toBe(10n);
  });
});
