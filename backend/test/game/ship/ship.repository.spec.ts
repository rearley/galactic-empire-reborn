import { ShipRepository } from '../../../src/game/ship/ship.repository';

/**
 * These two queries are Phase 2 debt: the gateway held them directly for the
 * onboarding P2002 race and the ship-select re-read. Both read the WHOLE row
 * — no `select` — because `prismaShipToState` needs every column.
 * @see game.gateway.ts (handlePromptReply / handleShipSelectReply)
 */
describe('ShipRepository', () => {
  it("finds a captain's first hull by userid alone", async () => {
    const findFirst = jest.fn().mockResolvedValue({ userid: 'usr_a', shipno: 1 });
    const repo = new ShipRepository({ ship: { findFirst } } as never);

    await repo.findFirstForUser('usr_a');

    expect(findFirst).toHaveBeenCalledWith({ where: { userid: 'usr_a' } });
  });

  it('finds one specific hull by userid and shipno', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repo = new ShipRepository({ ship: { findFirst } } as never);

    await repo.findHull('usr_a', 2);

    expect(findFirst).toHaveBeenCalledWith({ where: { userid: 'usr_a', shipno: 2 } });
  });
});
