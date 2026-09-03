/**
 * Firing the engines out of orbit must SAY so, and must cancel the repair.
 *
 * Both `war` and `imp` open with the same three-line block in canon:
 *
 *   if (warsptr->where >= 10)
 *     { refresh(...); prfmsg(LEAVEORB); warsptr->where = 0; warsptr->repair = 0; }
 *
 * (GECMDS.C:512-517 cmd_impulse, :617-623 cmd_warp.) The port zeroed `where`
 * silently and never touched `repair`, so a ship that had just bought a repair
 * at Zygor could fly away still holding the queue and keep healing 3 damage a
 * second in deep space -- the repair `mai` charges 2,500 credits for, taken
 * with you. Canon spends it on the spot or not at all, which is also why
 * `repairship` aborts on `cantexit` (GEFUNCS.C:397).
 */
import { MessageId, formatMessage } from '../../../../src/game/commands/messages';
import { WarpHandlerService } from '../../../../src/game/commands/handlers/warp.handler';
import { impulseCommand } from '../../../../src/game/commands/handlers/impulse.handler';
import type { ShipState } from '../../../../src/game/ship/ship-state.types';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 30, energy: 60000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: -1,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 11, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 10, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...over,
  } as ShipState;
}

const LEAVEORB = formatMessage(MessageId.LEAVEORB);

const warpCache = {
  getMaxAcceleration: () => 1000,
  getMaxWarp: () => 10,
  get: () => ({ maxAcceleration: 1000, maxWarp: 10 }),
} as never;

type Run = (ship: ShipState, args: string[]) => Promise<{ lines: Array<{ text: string }> }>;

const runWarp: Run = (ship, args) =>
  new WarpHandlerService(warpCache).command.handler(ship, args, {} as never) as never;
const runImpulse: Run = (ship, args) =>
  impulseCommand.handler(ship, args, {} as never) as never;

describe.each([
  ['war', runWarp, ['5']],
  ['imp', runImpulse, ['50']],
])('%s leaving orbit', (_name, run: Run, args) => {
  it('tells the captain they are leaving orbit', async () => {
    const ship = makeShip();
    const res = await run(ship, args);
    expect(res.lines.map((l) => l.text)).toContain(LEAVEORB);
  });

  it('cancels the queued repair, as canon does on the same three lines', async () => {
    const ship = makeShip();
    await run(ship, args);
    expect(ship.where).toBe(0);
    expect(ship.repair).toBe(0);
  });

  it('says nothing about orbit when the ship was already flying', async () => {
    const ship = makeShip({ where: 0, repair: 0 });
    const res = await run(ship, args);
    expect(res.lines.map((l) => l.text)).not.toContain(LEAVEORB);
  });
});
