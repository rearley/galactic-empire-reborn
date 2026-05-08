/**
 * T040 — Beacon socket event smoke test.
 *
 * Verifies the four acceptance cases from the contract:
 *  1. Gate fires + observer present → beacon event emitted to toSector room.
 *  2. Gate suppressed → no beacon event.
 *  3. No observers in toSector → no beacon event.
 *  4. In-sector reposition (fromSector === toSector) → no beacon event.
 *
 * The gateway's `handleSectorTransition` must:
 *  - Accept `PhysicsSectorTransitionPayload` (existing)
 *  - For each transition, check `toSector` for observers
 *  - Roll `gernd(random) % 10 === 0`
 *  - If both conditions hold, emit `beacon` to the `sector:x:y` room
 *
 * @see GEFUNCS.C:808-816
 * @see specs/020-source-fidelity-audit/contracts/beacon-event.md
 */

import { GameGateway } from '../../src/gateway/game.gateway';
import { BEACON_EVENT, BeaconEvent } from '../../src/gateway/events/beacon.event';
import { PhysicsSectorTransitionPayload } from '../../src/game/tick/sector-transition.subscriber';
import { ShipState } from '../../src/game/ship/ship-state.types';

/** Minimal ShipState for observer checks. */
function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'obs1', shipno: 1, shipname: 'Observer', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 3.5, ycoord: 2.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

/** Build a minimal gateway mock that exposes `handleSectorTransition`. */
function buildGateway(options: {
  /** Ships in the toSector (x=3, y=2) */
  observers: ShipState[];
  /** If false, the random roll suppresses the beacon (gernd()%10 !== 0) */
  rollFires: boolean;
}) {
  const emittedBeacons: Array<{ room: string; event: BeaconEvent }> = [];

  const serverMock = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn().mockImplementation((eventName: string, payload: BeaconEvent) => {
      // Capture the last `to()` room via closure — we track calls separately.
    }),
  };

  // Track room + event together
  const roomEmits: Array<{ room: string; event: string; payload: unknown }> = [];
  const serverProxy = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        roomEmits.push({ room, event, payload });
      },
    }),
    emit: (event: string, payload: unknown) => {
      roomEmits.push({ room: 'global', event, payload });
    },
  };

  // Moving ship (userid=mover, shipno=2, in toSector 3,2 after the move)
  const moverShip = makeShip({
    userid: 'mover', shipno: 2, shipname: 'Warprunner',
    xcoord: 3.5, ycoord: 2.5,
  });

  const allShips = [moverShip, ...options.observers];

  // gernd(random) = floor(random.next() * 65536) % 10
  // rollFires=true → we want result=0; rollFires=false → result=5
  const randomNext = options.rollFires ? () => 0 / 65536 : () => 5 / 65536;
  const randomMock = { next: randomNext };

  const shipServiceMock = {
    findAllShips: jest.fn().mockReturnValue(allShips),
    get: jest.fn().mockReturnValue(moverShip),
  };

  // Partial gateway — only the beacon-relevant fields
  const gw = {
    server: serverProxy,
    shipStateService: shipServiceMock,
    random: randomMock,
    handleSectorTransition: (GameGateway.prototype as unknown as { handleSectorTransition: (p: PhysicsSectorTransitionPayload) => void }).handleSectorTransition,
    roomEmits,
  };

  return gw;
}

describe('T040 — beacon event on sector transition', () => {
  const fromSector = { x: 2, y: 2 };
  const toSector   = { x: 3, y: 2 };
  const fromFlat = fromSector.y * 30 + fromSector.x; // 2*30+2=62
  const toFlat   = toSector.y   * 30 + toSector.x;   // 2*30+3=63

  const observer = makeShip({ userid: 'obs1', shipno: 1, xcoord: 3.5, ycoord: 2.5, status: 1 });
  const payload: PhysicsSectorTransitionPayload = {
    transitions: [{ shipId: 'mover:2', fromSector, toSector }],
  };

  it('gate fires + observer present → beacon emitted to toSector room', () => {
    const { roomEmits, handleSectorTransition, server, shipStateService, random } = buildGateway({ observers: [observer], rollFires: true });
    // Call the handler with `this` bound to a gateway-like object
    handleSectorTransition.call({ server, shipStateService, random }, payload);

    const beaconEmits = roomEmits.filter((r) => r.event === BEACON_EVENT);
    expect(beaconEmits).toHaveLength(1);
    const beaconPayload = beaconEmits[0].payload as BeaconEvent;
    expect(beaconPayload.shipId).toBe('mover:2');
    expect(beaconPayload.shipName).toBe('Warprunner');
    expect(beaconPayload.fromSector).toBe(fromFlat);
    expect(beaconPayload.toSector).toBe(toFlat);
    expect(beaconEmits[0].room).toBe(`sector:${toSector.x}:${toSector.y}`);
  });

  it('gate suppressed → no beacon event', () => {
    const { roomEmits, handleSectorTransition, server, shipStateService, random } = buildGateway({ observers: [observer], rollFires: false });
    handleSectorTransition.call({ server, shipStateService, random }, payload);

    const beaconEmits = roomEmits.filter((r) => r.event === BEACON_EVENT);
    expect(beaconEmits).toHaveLength(0);
  });

  it('no observers in toSector → no beacon event', () => {
    const { roomEmits, handleSectorTransition, server, shipStateService, random } = buildGateway({ observers: [], rollFires: true });
    handleSectorTransition.call({ server, shipStateService, random }, payload);

    const beaconEmits = roomEmits.filter((r) => r.event === BEACON_EVENT);
    expect(beaconEmits).toHaveLength(0);
  });

  it('in-sector reposition → no beacon event', () => {
    const inSectorPayload: PhysicsSectorTransitionPayload = {
      transitions: [{ shipId: 'mover:2', fromSector: { x: 3, y: 2 }, toSector: { x: 3, y: 2 } }],
    };
    const { roomEmits, handleSectorTransition, server, shipStateService, random } = buildGateway({ observers: [observer], rollFires: true });
    handleSectorTransition.call({ server, shipStateService, random }, inSectorPayload);

    const beaconEmits = roomEmits.filter((r) => r.event === BEACON_EVENT);
    expect(beaconEmits).toHaveLength(0);
  });
});
