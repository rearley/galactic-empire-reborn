import { TeaHandlerService } from '../../../src/game/commands/handlers/tea.handler';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Alpha',
    shpclass: 1, heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    dirty: false,
    ...overrides,
  };
}

function makeHandler(
  foundTeam: { teamcode: bigint; teamname: string } | null,
  userUpdateMock = jest.fn().mockResolvedValue({}),
): TeaHandlerService {
  const prismaMock = {
    team: {
      findFirst: jest.fn().mockResolvedValue(foundTeam),
    },
    user: {
      update: userUpdateMock,
    },
  } as unknown as PrismaService;
  const shipStateSvcMock = {} as unknown as ShipStateService;
  return new TeaHandlerService(prismaMock, shipStateSvcMock);
}

const ctx: CommandContext = {};

describe('TeaHandlerService', () => {
  describe('command metadata', () => {
    it('keyword is "tea"', () => {
      expect(makeHandler(null).command.keyword).toBe('tea');
    });

    it('minArgs is 0', () => {
      expect(makeHandler(null).command.minArgs).toBe(0);
    });
  });

  describe('FR-023: tea with no arg shows current status (not on team)', () => {
    it('returns "not on a team" when teamcode is undefined', async () => {
      const ship = makeShip({ teamcode: undefined });
      const result = await makeHandler(null).command.handler(ship, [], ctx);
      expect(result.lines[0].text).toMatch(/not on a team/i);
      expect(result.lines[0].category).toBe('info');
    });
  });

  describe('FR-024: tea with no arg shows current team', () => {
    it('shows current team name when on a team', async () => {
      const ship = makeShip({ teamcode: 42n });
      const handler = makeHandler({ teamcode: 42n, teamname: 'Pirates' });
      const result = await handler.command.handler(ship, [], ctx);
      expect(result.lines[0].text).toMatch(/Pirates/);
      expect(result.lines[0].category).toBe('info');
    });
  });

  describe('FR-025: tea leave clears affiliation', () => {
    it('sets ship.teamcode to undefined on leave', async () => {
      const ship = makeShip({ teamcode: 42n });
      await makeHandler(null).command.handler(ship, ['leave'], ctx);
      expect(ship.teamcode).toBeUndefined();
    });

    it('sets dirty=true on leave', async () => {
      const ship = makeShip({ teamcode: 42n, dirty: false });
      await makeHandler(null).command.handler(ship, ['leave'], ctx);
      expect(ship.dirty).toBe(true);
    });

    it('returns success line on leave', async () => {
      const ship = makeShip({ teamcode: 42n });
      const result = await makeHandler(null).command.handler(ship, ['leave'], ctx);
      expect(result.lines[0].text).toMatch(/left your team/i);
      expect(result.lines[0].category).toBe('success');
    });

    it('emits player.snapshot broadcast on leave', async () => {
      const ship = makeShip({ teamcode: 42n });
      const result = await makeHandler(null).command.handler(ship, ['leave'], ctx);
      expect(result.broadcasts?.some((b) => b.event === 'player.snapshot')).toBe(true);
    });
  });

  describe('FR-026: tea <name> joins by exact case-insensitive match', () => {
    it('sets ship.teamcode on successful join', async () => {
      const ship = makeShip({ teamcode: undefined });
      const handler = makeHandler({ teamcode: 99n, teamname: 'Raiders' });
      await handler.command.handler(ship, ['Raiders'], ctx);
      expect(ship.teamcode).toBe(99n);
    });

    it('join is case-insensitive', async () => {
      const ship = makeShip({ teamcode: undefined });
      const handler = makeHandler({ teamcode: 99n, teamname: 'Raiders' });
      await handler.command.handler(ship, ['raiders'], ctx);
      expect(ship.teamcode).toBe(99n);
    });

    it('sets dirty=true on join', async () => {
      const ship = makeShip({ dirty: false });
      const handler = makeHandler({ teamcode: 99n, teamname: 'Raiders' });
      await handler.command.handler(ship, ['raiders'], ctx);
      expect(ship.dirty).toBe(true);
    });

    it('writes User.teamcode via Prisma on join', async () => {
      const updateMock = jest.fn().mockResolvedValue({});
      const ship = makeShip({ userid: 'u1' });
      const handler = makeHandler({ teamcode: 99n, teamname: 'Raiders' }, updateMock);
      await handler.command.handler(ship, ['raiders'], ctx);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userid: 'u1' } }),
      );
    });

    it('returns success line on join', async () => {
      const ship = makeShip();
      const handler = makeHandler({ teamcode: 99n, teamname: 'Raiders' });
      const result = await handler.command.handler(ship, ['raiders'], ctx);
      expect(result.lines[0].text).toMatch(/joined team Raiders/i);
      expect(result.lines[0].category).toBe('success');
    });

    it('emits player.snapshot broadcast on join', async () => {
      const ship = makeShip();
      const handler = makeHandler({ teamcode: 99n, teamname: 'Raiders' });
      const result = await handler.command.handler(ship, ['raiders'], ctx);
      expect(result.broadcasts?.some((b) => b.event === 'player.snapshot')).toBe(true);
    });
  });

  describe('FR-027: non-existent team returns error, no state change', () => {
    it('returns "No such team" error line', async () => {
      const ship = makeShip({ teamcode: undefined });
      const result = await makeHandler(null).command.handler(ship, ['Unknown'], ctx);
      expect(result.lines[0].text).toMatch(/No such team: Unknown/);
      expect(result.lines[0].category).toBe('system');
    });

    it('does not change ship.teamcode on not-found', async () => {
      const ship = makeShip({ teamcode: undefined });
      await makeHandler(null).command.handler(ship, ['Unknown'], ctx);
      expect(ship.teamcode).toBeUndefined();
    });

    it('does not set dirty on not-found', async () => {
      const ship = makeShip({ dirty: false });
      await makeHandler(null).command.handler(ship, ['Unknown'], ctx);
      expect(ship.dirty).toBe(false);
    });
  });

  describe('FR-028: leave when not on a team is a no-op with success message', () => {
    it('succeeds gracefully when leaving with no team', async () => {
      const ship = makeShip({ teamcode: undefined });
      const result = await makeHandler(null).command.handler(ship, ['leave'], ctx);
      expect(result.lines[0].category).toBe('success');
    });
  });
});
