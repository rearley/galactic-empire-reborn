/**
 * The hyperspace gate on `cloak` is checked ONCE, before the on/off dispatch,
 * so it covers `cloak off` too and outranks every other rejection.
 *
 * @see GECMDS.C:3207-3212 cmd_cloak
 * @see GE/REL/MBMGEMSG.MSG:2381 CLOK1
 */
import { CloakHandlerService, CLOK1, CLOK01 } from '../../../../src/game/commands/handlers/cloak.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 10000,
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
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(shipState?: Partial<ShipState>) {
  const state = makeShip(shipState);
  const mockShipState = {
    mutate: jest.fn(),
  } as unknown as ShipStateService;
  const handler = new CloakHandlerService(mockShipState, 500, { getHasCloak: () => true } as never);
  return { handler, state, ctx: {} as CommandContext, mockShipState };
}

function run(shipState: Partial<ShipState>, arg: string) {
  const { handler, state, ctx, mockShipState } = makeService(shipState);
  const result = handler.command.handler(state, [arg], ctx) as { lines: { text: string }[] };
  return { result, mockShipState };
}

describe('CLOK1 — the cloak hyperspace gate', () => {
  it('carries the canon wording', () => {
    expect(CLOK1).toBe('We cannot operate the Cloaking device in hyperspace Sir!');
  });

  it('`cloak on` in hyperspace → CLOK1', () => {
    const { result } = run({ cloak: 0, where: 1 }, 'on');
    expect(result.lines[0].text).toBe(CLOK1);
  });

  it('`cloak OFF` in hyperspace → CLOK1, not "already down"', () => {
    // Entering hyperspace zeroes `cloak` (GEFUNCS.C:590-598), so this is the
    // ONLY state a player can actually reach here — and the port answered
    // CLOKDWN, which tells a captain nothing about why the device is dead.
    const { result, mockShipState } = run({ cloak: 0, where: 1 }, 'off');
    expect(result.lines[0].text).toBe(CLOK1);
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('outranks the damaged-cloak rejection (C checks where first)', () => {
    const { result } = run({ cloak: -3, where: 1 }, 'on');
    expect(result.lines[0].text).toBe(CLOK1);
  });

  it('outranks the already-cloaked rejection', () => {
    const { result } = run({ cloak: 10, where: 1 }, 'on');
    expect(result.lines[0].text).toBe(CLOK1);
  });

  it('does not fire outside hyperspace', () => {
    const { result } = run({ cloak: 0, where: 0 }, 'on');
    expect(result.lines[0].text).not.toBe(CLOK1);
  });
});

/**
 * CLOK01 — no cloaking device fitted.
 *
 * `if (shipclass[warsptr->shpclass].max_cloak == 0) { prfmsg(CLOK01); return; }`
 * is the FIRST check in cmd_cloak (GECMDS.C:3192-3197), ahead of the hyperspace
 * gate. It was missing, so a captain in a hull with no cloak got the on/off
 * machinery's answers — "already down", "insufficient power" — instead of being
 * told the ship has no such device.
 */
describe('cloak — no device fitted (GECMDS.C:3192-3197)', () => {
  const noCloak = { getHasCloak: () => false } as never;

  const fire = (over: Partial<ShipState>, arg: string) => {
    const ship = makeShip(over);
    const h = new CloakHandlerService(
      { mutate: jest.fn() } as unknown as ShipStateService, 500, noCloak,
    );
    return h.command.handler(ship, [arg], {} as CommandContext) as { lines: { text: string }[] };
  };

  it.each([['on'], ['off']])('refuses `clo %s` with CLOK01', (sub) => {
    expect(fire({}, sub).lines[0].text).toBe(CLOK01);
  });

  it('is checked before the hyperspace gate, as it is in the C', () => {
    expect(fire({ where: 1 }, 'on').lines[0].text).toBe(CLOK01);
  });
});
