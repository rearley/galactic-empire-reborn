/**
 * Who may move cargo to and from a planet.
 *
 *   trans_down:  if (trans_opt || sameas(plptr->userid,warsptr->userid))
 *                else prfmsg(TRANSFR4)                    GECMDS.C:3323, :3348
 *   trans_up:    if (sameas(plptr->userid,warsptr->userid) || plptr->userid[0] == 0)
 *                else prfmsg(TRANSUP4)                    GECMDS.C:3374, :3411
 *
 * `trans_opt = ynopt(TRANSOPT)` (GEMAIN.C:465) and the shipped value is YES:
 *   TRANSOPT {Allow goods transfers to planets not owned? YES}   MBMGEMSG.MSG:191
 *
 * So the two directions are deliberately asymmetric:
 *   - DOWN: anyone, onto any planet. You can resupply a team-mate's colony,
 *     stock a world before claiming it, or dump cargo anywhere.
 *   - UP: only from your OWN planet, or from an unclaimed one. You cannot help
 *     yourself to someone else's stockpile.
 *
 * The port refused both unless the ship owned the planet, and answered with
 * TRANSFR3 — "Sorry Sir! We are not in orbit." — which is not merely the wrong
 * message but a false statement about the ship's own state. Canon's refusals
 * are TRANSFR4/TRANSUP4, "We don't own this planet."
 */
import { TransferHandlerService } from '../../../../src/game/commands/handlers/transfer.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { CommandContext, CommandResult } from '../../../../src/game/commands/command.types';
import { NUMITEMS, I_FOOD } from '../../../../src/game/constants/items';
import { PlanetStateService as RealPlanetStateService } from '../../../../src/game/planet/planet-state.service';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  const items = new Array(NUMITEMS).fill(0n) as bigint[];
  items[I_FOOD] = 500n;
  return {
    userid: 'trader', shipno: 1, shipname: 'Trader', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 20.5, ycoord: 20.5, damage: 0, energy: 50_000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 11, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items,
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    maxTons: 1_000_000, dirty: false, ...over,
  } as ShipState;
}

/** Records what the planet layer was asked to do, and by whom. */
function build(planetOwner: string) {
  const deposits: unknown[] = [];
  const withdrawals: unknown[] = [];
  const planetState = {
    get: () => ({ userid: planetOwner, items: [{ qty: 1000n }] }),
    depositToPlanet: jest.fn().mockImplementation((...a: unknown[]) => {
      deposits.push(a); return Promise.resolve({ ok: true });
    }),
    withdrawFromPlanet: jest.fn().mockImplementation((...a: unknown[]) => {
      withdrawals.push(a); return Promise.resolve({ ok: true });
    }),
  } as unknown as PlanetStateService;
  const shipState = {
    mutate: (_u: string, _n: number, fn: (s: ShipState) => void) => fn(makeShip()),
    findAllShips: () => [],
  } as unknown as ShipStateService;
  const handler = new TransferHandlerService(shipState, planetState);
  return { handler, deposits, withdrawals };
}

const ctx: CommandContext = {};

const KEY = '20:20:1';

/**
 * A real PlanetStateService over one in-memory planet — the ownership rules
 * under test live here, not in the command handler.
 */
function planetServiceWith(over: { userid: string | null }) {
  const svc = new RealPlanetStateService(
    { planet: { update: jest.fn().mockResolvedValue({}) } } as never,
    { findAllShips: () => [] } as never,
  );
  const items = Array.from({ length: NUMITEMS }, () => ({
    qty: 1000n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
  (svc as unknown as { map: Map<string, unknown> }).map.set(KEY, {
    xsect: 20, ysect: 20, plnum: 1, type: 1, xcoord: 20.5, ycoord: 20.5,
    userid: over.userid, name: 'P', enviorn: 0, resource: 0,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0,
    password: '', lastattack: '', beacon: '', spyowner: '',
    technology: 0, teamcode: 0n, items,
  });
  return svc;
}

describe('tra down/up ownership (GECMDS.C:3323, :3374)', () => {
  it('TRANSOPT is YES, so anyone may transfer DOWN onto a planet they do not own', async () => {
    // The ownership decision lives in PlanetStateService, so that is where this
    // has to be asserted — a stubbed planet layer would only be testing the stub.
    const svc = planetServiceWith({ userid: 'someone-else' });

    const res = await svc.depositToPlanet(KEY, 'trader', I_FOOD, 10n);

    expect(res).toEqual({ ok: true });
  });

  it("refuses to take UP from someone else's planet", async () => {
    const svc = planetServiceWith({ userid: 'someone-else' });

    const res = await svc.withdrawFromPlanet(KEY, 'trader', I_FOOD, 10n);

    expect(res).toEqual({ ok: false, reason: 'NOT_OWNER' });
  });

  it('allows taking UP from an UNCLAIMED planet', async () => {
    // `|| plptr->userid[0] == 0` — an unowned world is fair salvage.
    const svc = planetServiceWith({ userid: null });

    const res = await svc.withdrawFromPlanet(KEY, 'trader', I_FOOD, 10n);

    expect(res).toEqual({ ok: true });
  });

  it('allows taking UP from your own planet', async () => {
    const svc = planetServiceWith({ userid: 'trader' });

    const res = await svc.withdrawFromPlanet(KEY, 'trader', I_FOOD, 10n);

    expect(res).toEqual({ ok: true });
  });

  it('says "we do not own this planet", not "we are not in orbit"', async () => {
    // TRANSUP4, not TRANSFR3. The ship IS in orbit — it is standing over the
    // planet it just tried to loot — so the old line was a false statement
    // about the ship's own state, not merely the wrong wording.
    const planetState = {
      get: () => ({ userid: 'someone-else', items: [{ qty: 1000n }] }),
      withdrawFromPlanet: jest.fn().mockResolvedValue({ ok: false, reason: 'NOT_OWNER' }),
      depositToPlanet: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as PlanetStateService;
    const shipState = {
      mutate: (_u: string, _n: number, fn: (s: ShipState) => void) => fn(makeShip()),
      findAllShips: () => [],
    } as unknown as ShipStateService;
    const handler = new TransferHandlerService(shipState, planetState);

    const res = await handler.command.handler(makeShip(), ['up', '10', 'foo'], ctx) as CommandResult;

    expect(res.lines[0].text).toContain("don't own this planet");
  });
});
