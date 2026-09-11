import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { SHIP_STATUS_ABANDONED } from '../../../src/game/commands/_ship-management-constants';
import { GESTAT_AVAIL } from '../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

/**
 * `status` is deliberately stripped from the per-tick flush — board/unboard are
 * its only persisters (ship-state.mappers.ts:88). `abandon` set the field on the
 * in-memory state and nothing else, so the mark never reached Postgres: a server
 * restart handed the "abandoned" hull straight back, and a clean disconnect
 * actively overwrote it with GESTAT_AVAIL on the way out.
 *
 * @see specs/013-ship-management/spec.md FR-701, FR-702
 */
function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipno: 2,
    shipname: 'Departing',
    xcoord: 5,
    ycoord: 5,
    energy: 10000,
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
}

function makeService(): { svc: ShipStateService; updateMany: jest.Mock; state: ShipState } {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    ship: { updateMany, update: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
  } as never;
  const svc = new ShipStateService(prisma, { subscribe: jest.fn() } as never);
  const state = makeShip();
  (svc as unknown as { map: Map<string, ShipState> }).map.set('u1:2', state);
  return { svc, updateMany, state };
}

describe('ShipStateService.abandon — the mark has to be durable', () => {
  it('writes the abandoned status to Postgres, not just to memory', async () => {
    const { svc, updateMany, state } = makeService();

    await svc.abandon('u1', 2);

    expect(state.status).toBe(SHIP_STATUS_ABANDONED);
    expect(updateMany).toHaveBeenCalledWith({
      where: { userid: 'u1', shipno: 2 },
      data: { status: SHIP_STATUS_ABANDONED },
    });
  });

  it('a later unboard does not resurrect the hull as merely dormant', async () => {
    const { svc, updateMany } = makeService();

    await svc.abandon('u1', 2);
    updateMany.mockClear();
    await svc.unboard('u1', 2);

    const statuses = updateMany.mock.calls.map((c) => (c[0] as { data: { status: number } }).data.status);
    expect(statuses).not.toContain(GESTAT_AVAIL);
  });

  it('unboarding a ship that was never abandoned still marks it dormant', async () => {
    const { svc, updateMany } = makeService();

    await svc.unboard('u1', 2);

    const statuses = updateMany.mock.calls.map((c) => (c[0] as { data: { status: number } }).data.status);
    expect(statuses).toContain(GESTAT_AVAIL);
  });
});
