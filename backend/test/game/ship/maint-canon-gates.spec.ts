/**
 * `mai` gates, in canon's order (GECMDS.C:4456-4510):
 *
 *   where < 10                                  -> MAINT1
 *   plnum = where - 10; getplanetdat
 *   planet has a password && margc < 2          -> MAINT2
 *   password supplied but wrong                 -> MAINT3
 *   plptr->userid[0] == 0 || I_MEN.qty < 25000  -> MAINT8
 *   warsptr->cantexit > 0                       -> MAINT9
 *   price = 200; if (neutral) { plnum 1|2 -> 2500 ; else MAINT4 }
 *
 * Three defects, all found by the 2026-09-05 audit:
 *
 *  1. ORDER. The port ran the password check LAST; canon runs it SECOND, right
 *     after the orbit test. A visiting captain therefore learned whether a
 *     colony was big enough to service them BEFORE being asked for the
 *     password, which leaks the state of a stranger's world.
 *  2. MAINT8 tests `plptr->userid[0] == 0` as well as the population — the
 *     planet must be COLONISED. The port checked only the headcount, so a
 *     damaged captain could orbit any wild planet with 25,000 natives and buy a
 *     full repair for 200 credits.
 *  3. Zygor's plnum. Canon allows `plnum == 1 || plnum == 2` — Zygor and
 *     Tahanian Station. The port used 0 and 1. Planets in this port are
 *     1-based (`s00.ts`: "Index i is plnum i+1", orbit.handler.ts:106
 *     `s.where = 10 + targetPlnum`), so that refused Tahanian Station outright
 *     and admitted a plnum 0 that does not exist.
 */
import { MaintenanceService } from '../../../src/game/ship/maintenance.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { UserRepository } from '../../../src/game/player/user.repository';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

const ZYGOR = 1;
const TAHANIAN = 2;
const ENFORCER = 3;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'S',
    xcoord: 0.5,
    ycoord: 0.5,
    damage: 50,
    energy: 50_000,
    phasrtype: 1,
    where: 10 + ZYGOR,
    items: new Array(NUMITEMS).fill(0n),
    ...over,
  });
}

function svcWith(planet: unknown) {
  const mockShipState = { mutate: jest.fn() } as unknown as ShipStateService;
  const mockPlanetService = { get: jest.fn().mockReturnValue(planet) } as unknown as PlanetStateService;
  const mockPrisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ cash: 1_000_000n }),
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  return new MaintenanceService(mockShipState, mockPlanetService, new UserRepository(mockPrisma));
}

const colonised = (over: Record<string, unknown> = {}) => ({
  userid: 'someone', password: null, items: [{ qty: 50_000n }], ...over,
});

describe('mai — canon gates (GECMDS.C:4456-4510)', () => {
  it('services at Zygor, plnum 1', async () => {
    const svc = svcWith(colonised());
    const res = await svc.evaluateGates(makeShip({ where: 10 + ZYGOR }));
    expect(res.ok).toBe(true);
  });

  it('services at Tahanian Station, plnum 2 — canon allows BOTH', async () => {
    const svc = svcWith(colonised());
    const res = await svc.evaluateGates(makeShip({ where: 10 + TAHANIAN }));
    expect(res.ok).toBe(true);
  });

  it('refuses the Enforcer Planet, plnum 3, in the neutral zone', async () => {
    const svc = svcWith(colonised());
    const res = await svc.evaluateGates(makeShip({ where: 10 + ENFORCER }));
    expect(res).toEqual({ ok: false, reason: 'nz-not-zygor' });
  });

  it('refuses an UNCOLONISED planet however many natives it has', async () => {
    // `plptr->userid[0] == 0` -> MAINT8, regardless of population.
    const svc = svcWith(colonised({ userid: '' }));
    const res = await svc.evaluateGates(makeShip({ xcoord: 20, ycoord: 20, where: 11 }));
    expect(res).toEqual({ ok: false, reason: 'no-facility' });
  });

  it('still refuses a colonised planet below 25,000 colonists', async () => {
    const svc = svcWith(colonised({ items: [{ qty: 24_999n }] }));
    const res = await svc.evaluateGates(makeShip({ xcoord: 20, ycoord: 20, where: 11 }));
    expect(res).toEqual({ ok: false, reason: 'no-facility' });
  });

  it('asks for the password BEFORE reporting anything about the colony', async () => {
    // Canon order: MAINT2 (password) precedes MAINT8 (facility). A planet that
    // is both password-protected and too small must answer with the password
    // demand, not with the size of its population.
    const svc = svcWith(colonised({ password: 'sesame', items: [{ qty: 10n }] }));
    const res = await svc.evaluateGates(makeShip({ xcoord: 20, ycoord: 20, where: 11 }), '');
    expect(res).toEqual({ ok: false, reason: 'password-required' });
  });

  it('rejects a wrong password before the facility check too', async () => {
    const svc = svcWith(colonised({ password: 'sesame', items: [{ qty: 10n }] }));
    const res = await svc.evaluateGates(makeShip({ xcoord: 20, ycoord: 20, where: 11 }), 'open');
    expect(res).toEqual({ ok: false, reason: 'wrong-password' });
  });

  it('keeps the combat lock AFTER the facility check, as canon does', async () => {
    // MAINT9 follows MAINT8: a battle-locked captain at a wild planet is told
    // there is no yard, not that they are in combat.
    const svc = svcWith(colonised({ userid: '' }));
    const res = await svc.evaluateGates(makeShip({ xcoord: 20, ycoord: 20, where: 11, cantexit: 5 }));
    expect(res).toEqual({ ok: false, reason: 'no-facility' });
  });
});
