/**
 * T037 — Destruct countdown tick integration spec.
 * destruct=20 → 20 fake-timer ticks → ship destroyed, sector warning every tick.
 * @see GEFUNCS.C:1820 destruct
 * @see specs/013-ship-management/tasks.md T037 (FR-604 / SC-004)
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipManagementTickService, DestructTickPayload, DestructBoomPayload } from '../../../src/game/commands/ship-management-tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CLOAK_ENERGY_USE_DEFAULT } from '../../../src/game/commands/cloak.config';
import { COUNTDOWN } from '../../../src/game/commands/_ship-management-constants';
import { COMBAT_SHIP_DESTROYED, CombatShipDestroyedEvent } from '../../../src/game/combat/combat-events';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'USS Doomed', shpclass: 1,
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
    firecntl: 0, destruct: COUNTDOWN, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    dirty: false,
    ...overrides,
  };
}

function buildHarness(initialDestruct: number = COUNTDOWN) {
  const state = makeShip({ destruct: initialDestruct });

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
  return { service, state, events, mockShipState };
}

// ---------------------------------------------------------------------------
// T037: Full countdown from COUNTDOWN (20) to 0
// ---------------------------------------------------------------------------

describe('destructTick — full countdown from COUNTDOWN (20) to 0', () => {
  it('ship is removed from game after exactly COUNTDOWN (20) ticks', () => {
    const { service, state, mockShipState } = buildHarness(COUNTDOWN);

    for (let i = 0; i < COUNTDOWN; i++) {
      service.destructTick(state);
    }

    expect(mockShipState.removeFromGame).toHaveBeenCalledTimes(1);
    expect(state.destruct).toBe(0);
  });

  it('emits sector warning on every tick from tick 1 to tick 19 (FR-604)', () => {
    const { service, state, events } = buildHarness(COUNTDOWN);
    const ticks: DestructTickPayload[] = [];
    events.on('ship-management.destruct-tick', (p: DestructTickPayload) => ticks.push(p));

    for (let i = 0; i < COUNTDOWN; i++) {
      service.destructTick(state);
    }

    // 19 tick warnings (ticks 1-19), then boom on tick 20
    expect(ticks).toHaveLength(COUNTDOWN - 1);
  });

  it('emits DESTRUCT_BOOM event when countdown reaches 0', () => {
    const { service, state, events } = buildHarness(COUNTDOWN);
    const booms: DestructBoomPayload[] = [];
    events.on('ship-management.destruct-boom', (p: DestructBoomPayload) => booms.push(p));

    for (let i = 0; i < COUNTDOWN; i++) {
      service.destructTick(state);
    }

    expect(booms).toHaveLength(1);
    expect(booms[0].message).toContain('USS Doomed');
  });

  it('emits COMBAT_SHIP_DESTROYED with null attacker when countdown expires', () => {
    const { service, state, events } = buildHarness(COUNTDOWN);
    const destroyed: CombatShipDestroyedEvent[] = [];
    events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => destroyed.push(e));

    for (let i = 0; i < COUNTDOWN; i++) {
      service.destructTick(state);
    }

    expect(destroyed).toHaveLength(1);
    expect(destroyed[0].attackerUserid).toBeNull();
    expect(destroyed[0].scoreAwarded).toBe(0);
  });

  it('emits special warning at tick=10 remaining (SELFD2A)', () => {
    const { service, state, events } = buildHarness(COUNTDOWN);
    const ticks: DestructTickPayload[] = [];
    events.on('ship-management.destruct-tick', (p: DestructTickPayload) => ticks.push(p));

    for (let i = 0; i < COUNTDOWN - 10; i++) {
      service.destructTick(state);
    }

    // The last emitted tick should have countdown=10
    const last = ticks[ticks.length - 1];
    expect(last.countdown).toBe(10);
    expect(last.message).toBe(formatMessage(MessageId.DESTRUCT_TICK_10, 'USS Doomed'));
  });

  it('emits special warning at tick=5 remaining (SELFD2B)', () => {
    const { service, state, events } = buildHarness(COUNTDOWN);
    const ticks: DestructTickPayload[] = [];
    events.on('ship-management.destruct-tick', (p: DestructTickPayload) => ticks.push(p));

    for (let i = 0; i < COUNTDOWN - 5; i++) {
      service.destructTick(state);
    }

    const last = ticks[ticks.length - 1];
    expect(last.countdown).toBe(5);
    expect(last.message).toBe(formatMessage(MessageId.DESTRUCT_TICK_5, 'USS Doomed'));
  });

  it('emits special warning at tick=2 remaining (SELFD2C)', () => {
    const { service, state, events } = buildHarness(COUNTDOWN);
    const ticks: DestructTickPayload[] = [];
    events.on('ship-management.destruct-tick', (p: DestructTickPayload) => ticks.push(p));

    for (let i = 0; i < COUNTDOWN - 2; i++) {
      service.destructTick(state);
    }

    const last = ticks[ticks.length - 1];
    expect(last.countdown).toBe(2);
    expect(last.message).toBe(formatMessage(MessageId.DESTRUCT_TICK_2, 'USS Doomed'));
  });

  it('ship with destruct=0 → no action (no-op guard)', () => {
    const { service, state, mockShipState } = buildHarness(0);
    service.destructTick(state);
    expect(mockShipState.mutate).not.toHaveBeenCalled();
    expect(mockShipState.removeFromGame).not.toHaveBeenCalled();
  });
});
