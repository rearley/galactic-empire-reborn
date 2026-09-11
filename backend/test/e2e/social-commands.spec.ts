/**
 * E2E round-trip tests for social commands (sen, tea) through CommandRouterService.
 * Exercises the full dispatch → handler → broadcast pipeline without a live server.
 *
 * @see specs/012-social-commands/contracts/commands.md
 * @see specs/012-social-commands/contracts/websocket-events.md
 */

import { SenHandlerService } from '../../src/game/commands/handlers/sen.handler';
import { TeaHandlerService } from '../../src/game/commands/handlers/tea.handler';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandContext, CommandResult } from '../../src/game/commands/command.types';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Sender',
    xcoord: 7.2,
    ycoord: 4.8,
    ...overrides,
  });
}

const ctx: CommandContext = {};

describe('sen E2E round-trip', () => {
  let router: CommandRouterService;

  beforeEach(() => {
    router = new CommandRouterService();
    router.register(new SenHandlerService().command);
  });

  describe('hail scope (freq=0)', () => {
    it('broadcasts to hail room', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      const result = router.dispatch('sen a hello world', ship, ctx) as CommandResult;
      expect(result.broadcasts![0].room).toBe('hail');
      expect(result.broadcasts![0].event).toBe('message.send');
    });

    it('cloaked sender still sends (gateway filters recipients, not sender)', () => {
      const ship = makeShip({ freq: [0, 0, 0], cloak: 1 });
      const result = router.dispatch('sen a ping', ship, ctx) as CommandResult;
      expect(result.broadcasts).toHaveLength(1);
    });
  });

  describe('sector scope (freq 1-19999)', () => {
    it('broadcasts to correct sector room', () => {
      const ship = makeShip({ freq: [5000, 0, 0], xcoord: 7.2, ycoord: 4.8 });
      const result = router.dispatch('sen a sector msg', ship, ctx) as CommandResult;
      expect(result.broadcasts![0].room).toBe('sector:7:4');
    });
  });

  describe('galaxy scope (freq >= 20000)', () => {
    it('broadcasts to galaxy room', () => {
      const ship = makeShip({ freq: [20000, 0, 0] });
      const result = router.dispatch('sen a all-hands', ship, ctx) as CommandResult;
      expect(result.broadcasts![0].room).toBe('galaxy');
    });
  });

  describe('message > 200 chars rejected', () => {
    it('rejects overlong message with zero broadcasts', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      const longMsg = 'x '.repeat(101).trim(); // 201 chars
      const result = router.dispatch(`sen a ${longMsg}`, ship, ctx) as CommandResult;
      expect(result.broadcasts).toBeUndefined();
      expect(result.lines[0].text).toMatch(/Type HELP SEND for the correct usage\./i);
    });
  });

  describe('confirmation to sender', () => {
    it('returns confirmation system line to sender', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      const result = router.dispatch('sen a hello', ship, ctx) as CommandResult;
      expect(result.lines.some((l) => l.category === 'system')).toBe(true);
    });
  });
});

describe('tea E2E round-trip', () => {
  let router: CommandRouterService;
  let prismaMock: jest.Mocked<Pick<PrismaService, 'team' | 'user'>>;

  beforeEach(() => {
    prismaMock = {
      team: { findFirst: jest.fn() } as never,
      user: { update: jest.fn().mockResolvedValue({}) } as never,
    };
    const shipSvcMock = {} as unknown as ShipStateService;
    const teamSvcMock = {
      create: jest.fn(),
      joinByPassword: jest.fn(),
      list: jest.fn().mockResolvedValue([]),
    } as unknown as import('../../src/game/team/team.service').TeamService;
    const handler = new TeaHandlerService(prismaMock as unknown as PrismaService, shipSvcMock, teamSvcMock);
    router = new CommandRouterService();
    router.register(handler.command);
  });

  describe('no-arg shows current affiliation', () => {
    it('shows "not on a team" when no teamcode', async () => {
      const ship = makeShip({ teamcode: undefined });
      const result = await router.dispatch('tea', ship, ctx);
      expect(result.lines[0].text).toMatch(/not on a team/i);
    });

    it('shows team name when teamcode set and team found', async () => {
      (prismaMock.team.findFirst as jest.Mock).mockResolvedValue({ teamcode: 1n, teamname: 'Raiders' });
      const ship = makeShip({ teamcode: 1n });
      const result = await router.dispatch('tea', ship, ctx);
      expect(result.lines[0].text).toMatch(/Raiders/);
    });
  });

  describe('tea leave', () => {
    it('clears teamcode and emits player.snapshot', async () => {
      const ship = makeShip({ teamcode: 42n });
      const result = await router.dispatch('tea leave', ship, ctx);
      expect(ship.teamcode).toBeUndefined();
      expect(result.broadcasts?.some((b) => b.event === 'player.snapshot')).toBe(true);
    });
  });

  // Single-token form now routes to show-current-team (FR-016a change in feature 018)
  describe('tea <name> single-token (FR-016a)', () => {
    it('single-token shows team info, does not join', async () => {
      (prismaMock.team.findFirst as jest.Mock).mockResolvedValue({ teamcode: 99n, teamname: 'Pirates' });
      const ship = makeShip({ teamcode: 99n });
      const result = await router.dispatch('tea Pirates', ship, ctx);
      expect(result.lines[0].category).toBe('info');
      expect(result.lines[0].text).toMatch(/Pirates/);
    });

    it('single unknown token returns not-on-team info when not affiliated', async () => {
      (prismaMock.team.findFirst as jest.Mock).mockResolvedValue(null);
      const ship = makeShip({ teamcode: undefined });
      const result = await router.dispatch('tea Unknown', ship, ctx);
      expect(result.lines[0].category).toBe('info');
      expect(result.lines[0].text).toMatch(/not on a team/i);
      expect(ship.teamcode).toBeUndefined();
    });
  });
});
