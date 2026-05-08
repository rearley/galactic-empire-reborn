/**
 * Integration tests for cloakTick() ramp behavior — 1→2→10 across two physics ticks.
 * @see GEFUNCS.C:1366 cloakstat
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipManagementTickService } from '../../../src/game/commands/ship-management-tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CLOAK_ENERGY_USE_DEFAULT } from '../../../src/game/commands/cloak.config';
import { CLOAK_RAMP_INIT, CLOAK_RAMP_MID, CLOAK_RAMP_FULL } from '../../../src/game/commands/_ship-management-constants';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 50000,
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

function makeTickService(initialCloak: number, initialEnergy = 50000): {
  service: ShipManagementTickService;
  state: ShipState;
} {
  const state = makeShip({ cloak: initialCloak, energy: initialEnergy });

  const mockShipState = {
    findAllShips: jest.fn().mockReturnValue([state]),
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        fn(state);
        return state;
      },
    ),
    removeFromGame: jest.fn(),
  } as unknown as ShipStateService;

  const mockTickService = { subscribe: jest.fn() } as unknown as import('../../../src/game/tick/tick.service').TickService;
  const events = new EventEmitter2();

  const service = new ShipManagementTickService(mockShipState, mockTickService, events, CLOAK_ENERGY_USE_DEFAULT);
  return { service, state };
}

describe('cloakTick — ramp 1→2→10 (GEFUNCS.C:1366 cloakstat)', () => {
  it('cloak=1 after first tick → cloak=2, energy debited', () => {
    const { service, state } = makeTickService(CLOAK_RAMP_INIT, 50000);
    service.cloakTick(state);
    expect(state.cloak).toBe(CLOAK_RAMP_MID);
    expect(state.energy).toBe(50000 - CLOAK_ENERGY_USE_DEFAULT);
  });

  it('cloak=2 after second tick → cloak=10 (fully cloaked)', () => {
    const { service, state } = makeTickService(CLOAK_RAMP_MID, 50000);
    service.cloakTick(state);
    expect(state.cloak).toBe(CLOAK_RAMP_FULL);
    expect(state.energy).toBe(50000 - CLOAK_ENERGY_USE_DEFAULT);
  });

  it('cloak=10 (fully cloaked) stays at 10 after tick, energy still debited', () => {
    const { service, state } = makeTickService(CLOAK_RAMP_FULL, 50000);
    service.cloakTick(state);
    expect(state.cloak).toBe(CLOAK_RAMP_FULL);
    expect(state.energy).toBe(50000 - CLOAK_ENERGY_USE_DEFAULT);
  });

  it('full ramp sequence: 1→2→10 across two ticks', () => {
    const { service, state } = makeTickService(CLOAK_RAMP_INIT, 50000);
    service.cloakTick(state);
    expect(state.cloak).toBe(CLOAK_RAMP_MID);
    service.cloakTick(state);
    expect(state.cloak).toBe(CLOAK_RAMP_FULL);
  });

  it('cloak=0 ship is skipped (no mutation)', () => {
    const { service, state } = makeTickService(0);
    const before = state.energy;
    service.cloakTick(state);
    expect(state.cloak).toBe(0);
    expect(state.energy).toBe(before);
  });

  it('damaged cloak (cloak < 0) increments toward 0 each tick', () => {
    const { service, state } = makeTickService(-3);
    service.cloakTick(state);
    expect(state.cloak).toBe(-2);
    service.cloakTick(state);
    expect(state.cloak).toBe(-1);
    service.cloakTick(state);
    expect(state.cloak).toBe(0);
  });
});
