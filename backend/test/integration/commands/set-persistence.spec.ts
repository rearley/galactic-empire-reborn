/**
 * T032 — Persistence integration test: set auto-shield on → flush → reload from DB.
 * Proves autoShield and autoRepair flags survive the full Prisma round-trip.
 * @see specs/013-ship-management/tasks.md T032 (SC-006)
 */
import { prisma, truncateAll } from '../../prisma-schema/helpers/prisma-test-client';
import { prismaShipToState } from '../../../src/game/ship/ship-state.mappers';
import { stateToPrismaUpdate } from '../../../src/game/ship/ship-state.mappers';
import { NUMITEMS } from '../../../src/game/constants/items';

const TEST_USERID = 'u-set-persist-test';
const TEST_SHIPNO = 1;

beforeAll(async () => {
  await truncateAll();
  // Create a user row
  await prisma.user.create({
    data: {
      userid: TEST_USERID,
      username: TEST_USERID,
      options: Array(30).fill(0),
    },
  });
  // Create a ship row with autoShield=false, autoRepair=false (defaults)
  await prisma.ship.create({
    data: {
      userid: TEST_USERID,
      shipno: TEST_SHIPNO,
      shipname: 'USS Persist',
      shpclass: 1,
      items: Array(NUMITEMS).fill(0n),
      ltorpsChannel: [], ltorpsDistance: [],
      lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
      decout: [],
      freq: [0, 0, 0],
      autoShield: false,
      autoRepair: false,
    },
  });
});

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe('set auto-shield on → Prisma round-trip (SC-006)', () => {
  it('autoShield=true persists through update → reload cycle', async () => {
    // 1. Load from DB
    const row = await prisma.ship.findUniqueOrThrow({
      where: { userid_shipno: { userid: TEST_USERID, shipno: TEST_SHIPNO } },
    });
    const state = prismaShipToState(row);
    expect(state.autoShield).toBe(false);

    // 2. Apply mutation (simulates what SetHandlerService.mutate() does)
    state.autoShield = true;
    state.dirty = true;

    // 3. Flush to DB (simulates ShipStateService.flush())
    const updateData = stateToPrismaUpdate(state);
    await prisma.ship.update({
      where: { userid_shipno: { userid: TEST_USERID, shipno: TEST_SHIPNO } },
      data: updateData,
    });

    // 4. Reload from DB and assert
    const reloaded = await prisma.ship.findUniqueOrThrow({
      where: { userid_shipno: { userid: TEST_USERID, shipno: TEST_SHIPNO } },
    });
    const reloadedState = prismaShipToState(reloaded);
    expect(reloadedState.autoShield).toBe(true);
    expect(reloadedState.autoRepair).toBe(false); // unaffected
  });

  it('autoRepair=true persists through update → reload cycle', async () => {
    const row = await prisma.ship.findUniqueOrThrow({
      where: { userid_shipno: { userid: TEST_USERID, shipno: TEST_SHIPNO } },
    });
    const state = prismaShipToState(row);

    state.autoRepair = true;
    state.dirty = true;

    await prisma.ship.update({
      where: { userid_shipno: { userid: TEST_USERID, shipno: TEST_SHIPNO } },
      data: stateToPrismaUpdate(state),
    });

    const reloaded = await prisma.ship.findUniqueOrThrow({
      where: { userid_shipno: { userid: TEST_USERID, shipno: TEST_SHIPNO } },
    });
    const reloadedState = prismaShipToState(reloaded);
    expect(reloadedState.autoRepair).toBe(true);
  });

  it('both flags persist independently (set both, reload, check)', async () => {
    const row = await prisma.ship.findUniqueOrThrow({
      where: { userid_shipno: { userid: TEST_USERID, shipno: TEST_SHIPNO } },
    });
    const state = prismaShipToState(row);
    state.autoShield = true;
    state.autoRepair = true;
    state.dirty = true;

    await prisma.ship.update({
      where: { userid_shipno: { userid: TEST_USERID, shipno: TEST_SHIPNO } },
      data: stateToPrismaUpdate(state),
    });

    const reloaded = prismaShipToState(await prisma.ship.findUniqueOrThrow({
      where: { userid_shipno: { userid: TEST_USERID, shipno: TEST_SHIPNO } },
    }));
    expect(reloaded.autoShield).toBe(true);
    expect(reloaded.autoRepair).toBe(true);
  });
});
