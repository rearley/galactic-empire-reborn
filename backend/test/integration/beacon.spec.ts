/**
 * T040 — Beacon socket event smoke test (S-005 regression restored).
 *
 * Verifies the four acceptance cases from the contract:
 *  1. Gate fires + observer present → beacon event emitted to toSector room.
 *  2. Gate suppressed → no beacon event.
 *  3. No observers in toSector → no beacon event.
 *  4. In-sector reposition (fromSector === toSector) → no beacon event.
 *
 * The gateway's `handleSectorTransition` must:
 *  - Accept `PhysicsSectorTransitionEvent` (single transition)
 *  - Check `toSector` for non-mover observers (status===1 or 2)
 *  - Roll `gernd(random) % 10 === 0`
 *  - If both conditions hold, emit `beacon` to the `sector:x:y` room
 *
 * @see GEFUNCS.C:808-816
 * @see specs/022-fidelity-audit-v2/findings.md S-005
 */

import { GameGateway } from '../../src/gateway/game.gateway';
import { BEACON_EVENT, BeaconEvent } from '../../src/gateway/events/beacon.event';
import { PhysicsSectorTransitionEvent } from '../../src/game/physics/physics-events';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { UNIVMAX } from '../../src/game/constants';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

/** Minimal ShipState for observer checks. */
function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'obs1',
    shipname: 'Observer',
    xcoord: 3.5,
    ycoord: 2.5,
    topspeed: 0,
    ...overrides,
  });
}

/** Build a minimal gateway mock that exposes `handleSectorTransition`. */
function buildGateway(options: {
  /** Ships in the toSector */
  observers: ShipState[];
  /** Mover ship for findAllShips + name lookup */
  mover: ShipState;
  /** If false, the random roll suppresses the beacon (gernd()%10 !== 0) */
  rollFires: boolean;
}) {
  // Track room + event together
  const roomEmits: Array<{ room: string; event: string; payload: unknown }> = [];
  const serverProxy = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        roomEmits.push({ room, event, payload });
      },
      // Sector arrival/departure notices exclude the mover, mirroring C's
      // `outsect(FILTER, &sect, usrn, 0)` (GEFUNCS.C:717).
      except: (_socketId: string) => ({
        emit: (event: string, payload: unknown) => {
          roomEmits.push({ room, event, payload });
        },
      }),
    }),
    emit: (event: string, payload: unknown) => {
      roomEmits.push({ room: 'global', event, payload });
    },
    sockets: { sockets: new Map() },
  };

  // gernd(random) = floor(random.next() * 65536) % 10
  // rollFires=true → result=0; rollFires=false → result=5
  const randomNext = options.rollFires ? () => 0 / 65536 : () => 5 / 65536;
  const randomMock = { next: randomNext };

  const shipServiceMock = {
    findAllShips: vi.fn().mockReturnValue([options.mover, ...options.observers]),
    get: vi.fn().mockReturnValue(options.mover),
  };

  const registryMock = {
    getSocketId: vi.fn().mockReturnValue(null),
    list: vi.fn().mockReturnValue([]),
  };

  // Partial gateway — only the beacon-relevant fields
  const gw = {
    server: serverProxy,
    shipStateService: shipServiceMock,
    registry: registryMock,
    random: randomMock,
    handleSectorTransition: (GameGateway.prototype as unknown as {
      handleSectorTransition: (e: PhysicsSectorTransitionEvent) => void;
    }).handleSectorTransition,
    roomEmits,
  };

  return gw;
}

describe('S-005 — beacon event on sector transition', () => {
  const fromSector = { x: 2, y: 2 };
  const toSector = { x: 3, y: 2 };
  const MAXX = 30;
  // Flat sector id over the universe square, offset so -UNIVMAX..+UNIVMAX maps
  // to 0..n. The galaxy is centred on the origin, so a 0-based row-major index
  // over MAXX would go negative for western sectors.
  const flat = (sec: { x: number; y: number }): number =>
    (sec.y + UNIVMAX) * (UNIVMAX * 2 + 1) + (sec.x + UNIVMAX);
  const fromFlat = flat(fromSector);
  const toFlat = flat(toSector);

  const mover = makeShip({
    userid: 'mover', shipno: 2, shipname: 'Warprunner',
    xcoord: 3.5, ycoord: 2.5, speed: 0, status: 1,
  });
  const observer = makeShip({
    userid: 'obs1', shipno: 1, shipname: 'Observer',
    xcoord: 3.5, ycoord: 2.5, status: 1,
  });

  const event: PhysicsSectorTransitionEvent = {
    shipId: 'mover:2',
    fromSector,
    toSector,
    x: 3.5,
    y: 2.5,
    tickAt: new Date(),
  };

  it('gate fires + observer present → beacon emitted to toSector room', () => {
    const gw = buildGateway({ observers: [observer], mover, rollFires: true });
    gw.handleSectorTransition.call(gw, event);

    const beaconEmits = gw.roomEmits.filter((r) => r.event === BEACON_EVENT);
    expect(beaconEmits).toHaveLength(1);
    const beaconPayload = beaconEmits[0].payload as BeaconEvent;
    expect(beaconPayload.shipId).toBe('mover:2');
    expect(beaconPayload.shipName).toBe('Warprunner');
    expect(beaconPayload.fromSector).toBe(fromFlat);
    expect(beaconPayload.toSector).toBe(toFlat);
    expect(beaconEmits[0].room).toBe(`sector:${toSector.x}:${toSector.y}`);
  });

  it('gate suppressed → no beacon event', () => {
    const gw = buildGateway({ observers: [observer], mover, rollFires: false });
    gw.handleSectorTransition.call(gw, event);

    const beaconEmits = gw.roomEmits.filter((r) => r.event === BEACON_EVENT);
    expect(beaconEmits).toHaveLength(0);
  });

  it('no observers in toSector → no beacon event', () => {
    const gw = buildGateway({ observers: [], mover, rollFires: true });
    gw.handleSectorTransition.call(gw, event);

    const beaconEmits = gw.roomEmits.filter((r) => r.event === BEACON_EVENT);
    expect(beaconEmits).toHaveLength(0);
  });

  it('in-sector reposition → no beacon event', () => {
    const inSectorEvent: PhysicsSectorTransitionEvent = {
      ...event,
      fromSector: { x: 3, y: 2 },
      toSector: { x: 3, y: 2 },
    };
    const gw = buildGateway({ observers: [observer], mover, rollFires: true });
    gw.handleSectorTransition.call(gw, inSectorEvent);

    const beaconEmits = gw.roomEmits.filter((r) => r.event === BEACON_EVENT);
    expect(beaconEmits).toHaveLength(0);
  });

  it('mover at high warp (speed >= 21000) → no beacon event (also suppresses sector notices)', () => {
    const fastMover = { ...mover, speed: 21000 };
    const gw = buildGateway({ observers: [observer], mover: fastMover, rollFires: true });
    gw.handleSectorTransition.call(gw, event);

    const beaconEmits = gw.roomEmits.filter((r) => r.event === BEACON_EVENT);
    expect(beaconEmits).toHaveLength(0);
  });
});
