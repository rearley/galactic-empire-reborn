/**
 * Integration tests for cloakTick() energy drain and auto-decloak behavior.
 * @see GEFUNCS.C:1374, :1384 — CLENGUSE drain and starvation auto-decloak
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipManagementTickService } from '../../../src/game/commands/ship-management-tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CLOAK_ENERGY_USE_DEFAULT } from '../../../src/game/commands/cloak.config';
import { CLOAK_RAMP_FULL } from '../../../src/game/commands/_ship-management-constants';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: CLOAK_RAMP_FULL,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

function makeTickService(shipOverrides: Partial<ShipState> = {}): {
  service: ShipManagementTickService;
  state: ShipState;
  events: EventEmitter2;
} {
  const state = makeShip(shipOverrides);

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
  return { service, state, events };
}

describe('cloakTick — per-tick drain and auto-decloak (GEFUNCS.C:1374, :1384)', () => {
  it('each tick debits CLOAK_ENERGY_USE from energy', () => {
    const { service, state } = makeTickService({ cloak: CLOAK_RAMP_FULL, energy: 50000 });
    service.cloakTick(state);
    expect(state.energy).toBe(50000 - CLOAK_ENERGY_USE_DEFAULT);
    service.cloakTick(state);
    expect(state.energy).toBe(50000 - 2 * CLOAK_ENERGY_USE_DEFAULT);
  });

  it('auto-decloaks when energy < CLOAK_ENERGY_USE (starvation)', () => {
    const lowEnergy = CLOAK_ENERGY_USE_DEFAULT - 1;
    const { service, state } = makeTickService({ cloak: CLOAK_RAMP_FULL, energy: lowEnergy });
    service.cloakTick(state);
    expect(state.cloak).toBe(0);
  });

  it('emits cloak-collapsed event on auto-decloak', () => {
    const lowEnergy = CLOAK_ENERGY_USE_DEFAULT - 1;
    const { service, state, events } = makeTickService({ cloak: CLOAK_RAMP_FULL, energy: lowEnergy });
    const listener = jest.fn();
    events.on('ship-management.cloak-collapsed', listener);
    service.cloakTick(state);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ userid: 'u1' });
  });

  it('energy = CLOAK_ENERGY_USE - 1 → auto-decloak (starvation boundary)', () => {
    const { service, state } = makeTickService({ cloak: CLOAK_RAMP_FULL, energy: CLOAK_ENERGY_USE_DEFAULT - 1 });
    service.cloakTick(state);
    expect(state.cloak).toBe(0);
  });

  it('energy = CLOAK_ENERGY_USE → auto-decloak (not sufficient, needs > CLENGUSE)', () => {
    const { service, state } = makeTickService({ cloak: CLOAK_RAMP_FULL, energy: CLOAK_ENERGY_USE_DEFAULT });
    service.cloakTick(state);
    // energy < CLOAK_ENERGY_USE is false here, energy == CLOAK_ENERGY_USE
    // The contract says energy < CLENGUSE → auto-decloak
    // so exactly equal does NOT trigger auto-decloak
    expect(state.cloak).toBe(CLOAK_RAMP_FULL);
    expect(state.energy).toBe(0);
  });

  it('does not emit cloak-collapsed when energy is sufficient', () => {
    const { service, state, events } = makeTickService({ cloak: CLOAK_RAMP_FULL, energy: 50000 });
    const listener = jest.fn();
    events.on('ship-management.cloak-collapsed', listener);
    service.cloakTick(state);
    expect(listener).not.toHaveBeenCalled();
  });
});
