import {
  resolveTransferTarget,
  receiverFreeTons,
  TransferShip,
} from '../../src/game/commands/handlers/helpers/transfer-target';
import { NUMITEMS, I_MEN, I_GOLD } from '../../src/game/constants/items';

/**
 * Ship-to-ship `tra` is a port addition — C's cmd_transfer only moves cargo
 * between a ship and the planet it orbits (GECMDS.C). Two defects came out of
 * a playtest by a trader who tried to hand goods to another pilot.
 *
 * 1. It addressed the target by `shipno`, which is a PER-USER index: every
 *    captain's first hull is shipno 1. `allShips.find(s => s.shipno === n)`
 *    therefore returned whichever ship happened to be first in the map, and
 *    another player's ship could not be named at all. The codebase had already
 *    been bitten by exactly this — kill attribution once credited "the first
 *    ship in the map with that per-user index".
 *
 * 2. It never checked whether the RECEIVER could hold the cargo. The trader
 *    pushed a 1,000-ton Interceptor to 1,018.5 tons.
 */
function mk(
  userid: string,
  shipno: number,
  shipname: string,
  items: Record<number, number> = {},
  maxTons = 1000,
): TransferShip & { xcoord: number; ycoord: number } {
  const arr = Array(NUMITEMS).fill(0n) as bigint[];
  for (const k of Object.keys(items)) arr[Number(k)] = BigInt(items[Number(k)]);
  return { userid, shipno, shipname, items: arr, maxTons, status: 1, xcoord: 4.5, ycoord: 4.5 };
}

const me = mk('usr_a', 1, 'Vex-Ledger');
const mine2 = mk('usr_a', 2, 'Vex-Hauler');
const theirs = mk('usr_b', 1, 'Sable-Wren');   // ALSO shipno 1
const elsewhere = mk('usr_c', 1, 'Far-Away', {}, 1000);
elsewhere.xcoord = 9.5; elsewhere.ycoord = 9.5;

const FLEET = [me, mine2, theirs, elsewhere];

describe('resolveTransferTarget', () => {
  it('names another captain\'s ship, which a bare index could never reach', () => {
    const r = resolveTransferTarget('Sable-Wren', me, FLEET);
    expect(r.ok).toBe(true);
    expect(r.ok && r.ship.userid).toBe('usr_b');
  });

  it('matches a name case-insensitively and by prefix', () => {
    expect(resolveTransferTarget('sable', me, FLEET).ok).toBe(true);
    expect(resolveTransferTarget('SABLE-WREN', me, FLEET).ok).toBe(true);
  });

  it('reads a bare number as YOUR OWN hull, never a stranger\'s', () => {
    const r = resolveTransferTarget('2', me, FLEET);
    expect(r.ok && r.ship.userid).toBe('usr_a');
    expect(r.ok && r.ship.shipno).toBe(2);
  });

  it('does not resolve a number to another captain sharing that index', () => {
    // 'usr_b' also has a shipno 1. Asking for 1 is asking for YOUR shipno 1,
    // which is yourself — refused as self-transfer, not silently redirected.
    const r = resolveTransferTarget('1', me, FLEET);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('SELF');
  });

  it('refuses a ship in another sector', () => {
    const r = resolveTransferTarget('Far-Away', me, FLEET);
    expect(r.ok === false && r.reason).toBe('SECTOR');
  });

  it('refuses a name nobody answers to', () => {
    const r = resolveTransferTarget('Nobody', me, FLEET);
    expect(r.ok === false && r.reason).toBe('OFFLINE');
  });
});

describe('receiverFreeTons', () => {
  it('is the hold minus what is already aboard', () => {
    const laden = mk('usr_b', 1, 'Sable-Wren', { [I_MEN]: 400 }, 1000);
    expect(receiverFreeTons(laden)).toBe(600); // men are 1 ton each
  });

  it('refuses to overfill a receiver — the reported 1,018.5-ton Interceptor', () => {
    const full = mk('usr_b', 1, 'Sable-Wren', { [I_MEN]: 995 }, 1000);
    expect(receiverFreeTons(full)).toBe(5);
  });

  it('never reports negative space', () => {
    const over = mk('usr_b', 1, 'Sable-Wren', { [I_GOLD]: 100000 }, 1000);
    expect(receiverFreeTons(over)).toBe(0);
  });
});
