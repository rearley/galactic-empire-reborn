/**
 * `set` offers canon's four options and no others.
 *
 *   #define NUMOPTS 4
 *   char *options[NUMOPTS] = { "scannames", "scanhome", "scanfull", "filter" };
 *   @see GECMDS.C cmd_set
 *
 * The port added two of its own, `auto-shield` and `auto-repair` (spec 019
 * US3/US4), and both were worse than ordinary inventions.
 *
 * `auto-shield` reversed a rule canon states explicitly in its own help:
 *
 *   NOTE: When firing a weapon with the shields up, the shields will be
 *   automatically lowered. They WILL NOT be automatically raised after the
 *   firing.                                        @see MBMGEHLP.MSG HLPSHI
 *
 * Canon drops shields to fire (GECMDS.C:930 phaser, :1130 torpedo, :1241
 * missile) and leaves them down. That cost — every shot leaves you naked until
 * you spend an action on `shi up` — is the design, not an oversight, and the
 * help says so in capitals. (The `shieldup` call at GECMDS.C:1172 is dead: the
 * preceding `shielddn` sets `shieldstat = SHIELDDN`, so the `== SHIELDUP` test
 * above it can never be true. Vestigial, not evidence of intent.)
 *
 * `auto-repair` silently ran `mai` on a tick — which charges the player cash
 * and quotes no price. Canon's maintenance is a command you issue, with the
 * bill in front of you (GECMDS.C cmd_maint, MAINT5).
 *
 * Both removed. Reported from play: "So we invented something again".
 */
import { SetHandlerService } from '../../../../src/game/commands/handlers/set.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { CommandResult } from '../../../../src/game/commands/command.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { UserRepository } from '../../../../src/game/player/user.repository';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(ship: ShipState) {
  const mockShipState = {
    mutate: jest.fn().mockImplementation(
      (_u: string, _n: number, fn: (s: ShipState) => void) => { fn(ship); return ship; },
    ),
  } as unknown as ShipStateService;
  const mockPrisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ options: [] }),
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  return { handler: new SetHandlerService(mockShipState, new UserRepository(mockPrisma)), mockShipState };
}

const run = async (ship: ShipState, args: string[]) => {
  const { handler, mockShipState } = makeService(ship);
  const r = (await handler.command.handler(ship, args, {})) as CommandResult;
  return { text: r.lines.map((l) => l.text).join('\n'), mockShipState };
};

describe('`set` — canon offers four options, and only four', () => {
  it('rejects auto-shield, which canon has no option for and its help forbids', async () => {
    const ship = makeShip();
    const { text, mockShipState } = await run(ship, ['auto-shield', 'on']);

    expect(text).toBe(formatMessage(MessageId.SET_UNKNOWN));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('rejects auto-repair, which would spend the pilot’s cash unasked', async () => {
    const ship = makeShip();
    const { text, mockShipState } = await run(ship, ['auto-repair', 'on']);

    expect(text).toBe(formatMessage(MessageId.SET_UNKNOWN));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('lists canon’s four options, and nothing else', async () => {
    const { text } = await run(makeShip(), ['?']);

    for (const opt of ['scannames', 'scanhome', 'scanfull', 'filter']) {
      expect(text).toContain(opt);
    }
    expect(text).not.toMatch(/auto-?shield/i);
    expect(text).not.toMatch(/auto-?repair/i);
  });

  it('names only canon’s four in the usage line', () => {
    const usage = formatMessage(MessageId.SET_UNKNOWN);

    expect(usage).not.toMatch(/auto-?shield/i);
    expect(usage).not.toMatch(/auto-?repair/i);
    expect(usage).toContain('scanfull');
    expect(usage).toContain('filter');
  });

  it('still sets the canon options', async () => {
    const ship = makeShip();
    const { text } = await run(ship, ['scanfull', 'on']);

    expect(ship.scanFull).toBe(true);
    expect(text).toBe(formatMessage(MessageId.SET_OK_ON, 'scanfull'));
  });
});
