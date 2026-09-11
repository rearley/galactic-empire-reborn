import { planTransition, TransitionShipLookup } from '../../src/gateway/sector-transition';
import { ConnectedPlayer } from '../../src/gateway/connected-ships.registry';
import { PhysicsSectorTransitionEvent } from '../../src/game/physics/physics-events';

/**
 * `planTransition` is the pure planner behind `GameGateway.handleSectorTransition`
 * (game.gateway.ts). It turns one `physics.sector-transition` event into a
 * `TransitionPlan` — room joins, room leaves, and emits — without touching a
 * socket, so the visibility asymmetry (everyone learns a NAME, only the
 * arriving sector learns a POSITION) is testable without one.
 * @see src/gateway/sector-transition.ts for the full C-source derivation.
 */
describe('planTransition', () => {
  const event = (overrides: Partial<PhysicsSectorTransitionEvent> = {}): PhysicsSectorTransitionEvent => ({
    shipId: 'u1:1',
    fromSector: { x: 4, y: 3 },
    toSector: { x: 5, y: 3 },
    x: 5.02,
    y: 3.5,
    tickAt: new Date(0),
    ...overrides,
  });

  const ship: TransitionShipLookup = () => ({ status: 1, speed: 100, shipname: 'Wanderer' });

  it('leaves the old sector room and joins the new one', () => {
    const plan = planTransition(event(), [], ship);
    expect(plan.leave).toEqual(['sector:4:3']);
    expect(plan.join).toEqual(['sector:5:3']);
  });

  it('gives the mover a roster scoped to the sector they arrived in, not the one they left', () => {
    // The mover must never hold a position they may not show — filtering in the
    // UI leaks straight back out through devtools. @see gateway/player-visibility.ts
    const roster: ConnectedPlayer[] = [
      { shipId: 'left:1', name: 'LeftBehind', sector: { x: 4, y: 3 }, shipClass: 1 },
      { shipId: 'here:1', name: 'Neighbour', sector: { x: 5, y: 3 }, shipClass: 1 },
    ];
    const plan = planTransition(event(), roster, ship);

    const moverUpdate = plan.moverEmits.find((e) => e.event === 'player.sector');
    expect(moverUpdate).toBeDefined();
    const updates = (moverUpdate as { payload: { updates: unknown[] } }).payload.updates;
    expect(updates).toContainEqual({ shipId: 'here:1', sector: { x: 5, y: 3 } });
    expect(updates).toContainEqual({ shipId: 'left:1', sector: null });
    expect(updates).toContainEqual({ shipId: 'u1:1', sector: { x: 5, y: 3 } });
  });

  it('produces no plan at all when the ship cannot be found', () => {
    const plan = planTransition(event(), [], () => undefined);
    expect(plan).toEqual({ leave: [], join: [], moverEmits: [], roomEmits: [] });
  });

  it('joins/leaves and sends no sector notices when the sector does not change, but still tells the mover their own physics update', () => {
    // physics.sector-transition is emitted before the same-sector check runs —
    // MOVE1's gate is independent of the sector-change branch.
    const plan = planTransition(event({ toSector: { x: 4, y: 3 } }), [], ship);
    expect(plan.leave).toEqual([]);
    expect(plan.join).toEqual([]);
    expect(plan.roomEmits).toEqual([]);
    expect(plan.moverEmits).toEqual([{ event: 'physics.sector-transition', payload: event({ toSector: { x: 4, y: 3 } }) }]);
  });

  it('excludes the mover from the sector arrival/departure notices', () => {
    const plan = planTransition(event(), [], ship);
    const left = plan.roomEmits.find((e) => e.event === 'sector:ship-left');
    const entered = plan.roomEmits.find((e) => e.event === 'sector:ship-entered');
    expect(left).toMatchObject({ room: 'sector:4:3', exceptSelf: true, payload: { shipId: 'u1:1', shipName: 'Wanderer' } });
    expect(entered).toMatchObject({ room: 'sector:5:3', exceptSelf: true, payload: { shipId: 'u1:1', shipName: 'Wanderer' } });
  });

  it('above warp 21,000 still joins/leaves and tells the mover, but sends no sector notices', () => {
    const fast: TransitionShipLookup = () => ({ status: 1, speed: 21_000, shipname: 'Wanderer' });
    const plan = planTransition(event(), [], fast);
    expect(plan.leave).toEqual(['sector:4:3']);
    expect(plan.join).toEqual(['sector:5:3']);
    expect(plan.moverEmits.some((e) => e.event === 'event.log')).toBe(true);
    expect(plan.roomEmits.filter((e) => e.event.startsWith('sector:ship-'))).toHaveLength(0);
  });

  it('does not broadcast a GESTAT_AUTO ship’s position — an AI has no socket, but nothing depends on that', () => {
    const auto: TransitionShipLookup = () => ({ status: 2, speed: 100, shipname: 'Drone' });
    const plan = planTransition(event(), [], auto);
    expect(plan.moverEmits.some((e) => e.event === 'physics.sector-transition')).toBe(false);
    expect(plan.moverEmits.some((e) => e.event === 'player.sector')).toBe(false);
    expect(plan.roomEmits.some((e) => e.event === 'player.sector')).toBe(false);
    // Join/leave and the ship-left/entered notices are unconditional on this gate.
    expect(plan.join).toEqual(['sector:5:3']);
  });
});
