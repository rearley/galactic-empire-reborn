/**
 * The shipyard is at Zygor, and only at Zygor.
 *
 *   plnum = warsptr->where - 10;
 *   if (neutral(&warsptr->coord) && plnum == 1)  /* must be Zygor-3 *\/
 *       { ...buy... }
 *   else
 *       prfmsg(NEW5);
 *
 * @see GECMDS.C:4554-4560 and the closing else at :4718-4721
 *
 * Note the deliberate asymmetry with `mai`, which accepts `plnum == 1 || plnum
 * == 2` (GECMDS.C:4500) — you can be SERVICED at Tahanian Station but you can
 * only BUY at Zygor. The port gated both commands on "somewhere in sector
 * (0,0), orbiting anything", so Tahanian Station, the Enforcer Planet and the
 * Kayriez Portal all sold hulls and Mark-N upgrades. Zygor being the single
 * shipyard is what makes it the hub.
 */
import { NewShipHandlerService } from '../../src/game/commands/handlers/new-ship.handler';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CommandContext, CommandResult } from '../../src/game/commands/command.types';
import { NUMITEMS } from '../../src/game/constants/items';

const ZYGOR = 1;
const TAHANIAN = 2;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'S', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0.5, ycoord: 0.5, damage: 0, energy: 50_000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10 + ZYGOR, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  } as ShipState;
}

function service() {
  const prisma = {
    shipClass: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ cash: 1_000_000n, noships: 1, topshipno: 1 }), update: jest.fn() },
    ship: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const ships = { mutate: jest.fn(), findAllShips: () => [] } as unknown as ShipStateService;
  return new NewShipHandlerService(prisma, ships);
}

const ctx: CommandContext = {};
const run = async (ship: ShipState, args: string[]) =>
  (await service().command.handler(ship, args, ctx)) as CommandResult;

describe('new — Zygor only (GECMDS.C:4557)', () => {
  it('refuses a hull purchase at Tahanian Station with NEW5', async () => {
    const res = await run(makeShip({ where: 10 + TAHANIAN }), ['ship', '4']);

    expect(res.lines[0].text).toBe(formatMessage(MessageId.NEW_WRONG_PLACE));
  });

  it('refuses an upgrade at Tahanian Station with NEW5', async () => {
    const res = await run(makeShip({ where: 10 + TAHANIAN }), ['phaser', '2']);

    expect(res.lines[0].text).toBe(formatMessage(MessageId.NEW_WRONG_PLACE));
  });

  it('refuses outside the neutral zone with the same canon line', async () => {
    const res = await run(makeShip({ xcoord: 20, ycoord: 20, where: 10 + ZYGOR }), ['ship', '4']);

    expect(res.lines[0].text).toBe(formatMessage(MessageId.NEW_WRONG_PLACE));
  });

  it('gets past the location gate at Zygor itself', async () => {
    // Zygor is plnum 1; the purchase then fails for other reasons in this
    // stubbed harness, but it must NOT fail on location.
    const res = await run(makeShip({ where: 10 + ZYGOR }), ['ship', '4']);

    expect(res.lines[0].text).not.toBe(formatMessage(MessageId.NEW_WRONG_PLACE));
  });
});
