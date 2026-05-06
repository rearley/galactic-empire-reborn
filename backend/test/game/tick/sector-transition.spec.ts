import 'reflect-metadata';
import { SectorTransitionSubscriber } from '../../../src/game/tick/sector-transition.subscriber';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PHYSICS_SECTOR_TRANSITION_EVENT } from '../../../src/game/tick/sector-transition.subscriber';
import type { PhysicsSectorTransitionPayload } from '../../../src/game/tick/sector-transition.subscriber';

/**
 * Verifies the SectorTransitionSubscriber emits a batched physics.sector-transition
 * event iff at least one ship crossed an integer-cell boundary (FR-026).
 *
 * @see specs/010-react-frontend/contracts/websocket-events.md §4 physics.sector-transition
 * @see research.md R5 placement of the subscriber
 */
describe('SectorTransitionSubscriber', () => {
  let subscriber: SectorTransitionSubscriber;
  let events: jest.Mocked<EventEmitter2>;
  let shipStateService: Partial<ShipStateService>;

  const makeShip = (userid: string, shipno: number, x: number, y: number, shipname = 'Test', shpclass = 3) => ({
    userid,
    shipno,
    shipname,
    shpclass,
    xcoord: x,
    ycoord: y,
  });

  beforeEach(() => {
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    shipStateService = { findAllShips: jest.fn().mockReturnValue([]) };
    subscriber = new SectorTransitionSubscriber(shipStateService as ShipStateService, events);
  });

  it('does NOT emit on a quiet tick (no ship has moved to a new integer cell)', () => {
    (shipStateService.findAllShips as jest.Mock).mockReturnValue([
      makeShip('user1', 1, 5.1, 3.2),
    ]);
    subscriber.onPhysicsTick(); // first tick — establishes snapshot, no diff
    subscriber.onPhysicsTick(); // second tick — same position
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('emits physics.sector-transition when a ship crosses an integer cell boundary', () => {
    (shipStateService.findAllShips as jest.Mock)
      .mockReturnValueOnce([makeShip('user1', 1, 5.1, 3.2)]) // tick 1
      .mockReturnValueOnce([makeShip('user1', 1, 6.4, 3.2)]); // tick 2 — x crossed 5→6

    subscriber.onPhysicsTick();
    subscriber.onPhysicsTick();

    expect(events.emit).toHaveBeenCalledWith(
      PHYSICS_SECTOR_TRANSITION_EVENT,
      expect.objectContaining({
        transitions: expect.arrayContaining([
          expect.objectContaining({
            shipId: 'user1:1',
            fromSector: { x: 5, y: 3 },
            toSector: { x: 6, y: 3 },
          }),
        ]),
      }),
    );
  });

  it('batches multiple transitions in a single event per tick', () => {
    (shipStateService.findAllShips as jest.Mock)
      .mockReturnValueOnce([
        makeShip('user1', 1, 5.1, 3.2),
        makeShip('user2', 1, 10.9, 7.8),
      ])
      .mockReturnValueOnce([
        makeShip('user1', 1, 6.4, 3.2), // crossed x
        makeShip('user2', 1, 11.1, 7.8), // crossed x
      ]);

    subscriber.onPhysicsTick();
    subscriber.onPhysicsTick();

    expect(events.emit).toHaveBeenCalledTimes(1);
    const payload = (events.emit.mock.calls[0][1] as PhysicsSectorTransitionPayload);
    expect(payload.transitions).toHaveLength(2);
  });

  it('includes AI ships (no userid filtering)', () => {
    // Droids / Cybertrons have userid values that look like 'DROID:...' or 'CYB:...'
    (shipStateService.findAllShips as jest.Mock)
      .mockReturnValueOnce([makeShip('DROID:spawn:1', 1, 5.1, 3.2)])
      .mockReturnValueOnce([makeShip('DROID:spawn:1', 1, 6.4, 3.2)]);

    subscriber.onPhysicsTick();
    subscriber.onPhysicsTick();

    expect(events.emit).toHaveBeenCalledWith(
      PHYSICS_SECTOR_TRANSITION_EVENT,
      expect.objectContaining({
        transitions: expect.arrayContaining([
          expect.objectContaining({ shipId: 'DROID:spawn:1:1' }),
        ]),
      }),
    );
  });

  it('sub-cell movement (no integer boundary cross) does not emit', () => {
    (shipStateService.findAllShips as jest.Mock)
      .mockReturnValueOnce([makeShip('user1', 1, 5.1, 3.2)])
      .mockReturnValueOnce([makeShip('user1', 1, 5.9, 3.8)]); // still floor=5,3

    subscriber.onPhysicsTick();
    subscriber.onPhysicsTick();

    expect(events.emit).not.toHaveBeenCalled();
  });

  it('newly-spawned ship (not in prior snapshot) does NOT produce a transition entry', () => {
    (shipStateService.findAllShips as jest.Mock)
      .mockReturnValueOnce([]) // tick 1 — no ships
      .mockReturnValueOnce([makeShip('user1', 1, 5.1, 3.2)]); // tick 2 — ship appears

    subscriber.onPhysicsTick();
    subscriber.onPhysicsTick();

    expect(events.emit).not.toHaveBeenCalled();
  });

  it('despawned ship (in prior snapshot, gone this tick) does NOT produce a transition entry', () => {
    (shipStateService.findAllShips as jest.Mock)
      .mockReturnValueOnce([makeShip('user1', 1, 5.1, 3.2)]) // tick 1
      .mockReturnValueOnce([]); // tick 2 — ship gone

    subscriber.onPhysicsTick();
    subscriber.onPhysicsTick();

    expect(events.emit).not.toHaveBeenCalled();
  });
});
