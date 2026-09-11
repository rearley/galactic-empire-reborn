import { TeaHandlerService } from '../../../src/game/commands/handlers/tea.handler';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { TEAMNOT } from '../../../src/game/team/team-messages';
import { CommandContext } from '../../../src/game/commands/command.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    ...overrides,
  });
}

function makeHandler(
  foundTeam: { teamcode: bigint; teamname: string } | null,
  userUpdateMock = vi.fn().mockResolvedValue({}),
): TeaHandlerService {
  const prismaMock = {
    team: {
      findFirst: vi.fn().mockResolvedValue(foundTeam),
    },
    user: {
      update: userUpdateMock,
    },
  } as unknown as PrismaService;
  const shipStateSvcMock = {} as unknown as ShipStateService;
  const teamSvcMock = {
    create: vi.fn(),
    joinByPassword: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as import('../../../src/game/team/team.service').TeamService;
  return new TeaHandlerService(prismaMock, shipStateSvcMock, teamSvcMock);
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

  // FR-016a: single-token form now shows current team (changed in feature 018)
  // Password-gated join tests are in test/team/tea.handler.spec.ts
  describe('FR-026: tea <name> (single token) shows current team (FR-016a)', () => {
    it('single-token shows team info, not a join attempt', async () => {
      const ship = makeShip({ teamcode: 99n });
      const handler = makeHandler({ teamcode: 99n, teamname: 'Raiders' });
      const result = await handler.command.handler(ship, ['Raiders'], ctx);
      expect(result.lines[0].text).toMatch(/Raiders/);
      expect(result.lines[0].category).toBe('info');
    });

    it('single-token does not change ship.teamcode', async () => {
      const ship = makeShip({ teamcode: 99n });
      const handler = makeHandler({ teamcode: 99n, teamname: 'Raiders' });
      await handler.command.handler(ship, ['Raiders'], ctx);
      expect(ship.teamcode).toBe(99n);
    });
  });

  // FR-027: no-such-team error now only applies to 2+ token join (feature 018 routing)
  describe('FR-027: single-token non-keyword shows team status, does not error', () => {
    it('single unknown token routes to show-team (not on team → info message)', async () => {
      const ship = makeShip({ teamcode: undefined });
      const result = await makeHandler(null).command.handler(ship, ['Unknown'], ctx);
      expect(result.lines[0].category).toBe('info');
      expect(result.lines[0].text).toMatch(/not on a team/i);
    });

    it('does not change ship.teamcode on single-token', async () => {
      const ship = makeShip({ teamcode: undefined });
      await makeHandler(null).command.handler(ship, ['Unknown'], ctx);
      expect(ship.teamcode).toBeUndefined();
    });

    it('does not set dirty on single-token', async () => {
      const ship = makeShip({ dirty: false });
      await makeHandler(null).command.handler(ship, ['Unknown'], ctx);
      expect(ship.dirty).toBe(false);
    });
  });

  /**
   * FR-028 read "leave when not on a team is a no-op with success message",
   * and this spec pinned the "success" category to match. Canon disagrees: the
   * unjoin branch is gated on `waruptr->teamcode > 0` and the else arm is
   * `badfmt(TEAMNOT)` (GECMDS.C:5464-5468) — a refusal, not a courtesy.
   *
   * The no-op half of FR-028 was right and is kept; only the "success" reading
   * was a port invention, and reporting a team departure to someone who never
   * joined one is exactly the kind of false confirmation the audit was after.
   */
  describe('FR-028: leave when not on a team changes nothing, and says so', () => {
    it('refuses rather than congratulating (GECMDS.C:5464)', async () => {
      const ship = makeShip({ teamcode: undefined });
      const result = await makeHandler(null).command.handler(ship, ['leave'], ctx);
      expect(result.lines[0].category).toBe('system');
      expect(result.lines[0].text).toBe(TEAMNOT);
    });

    it('leaves the ship unaffiliated and unmarked', async () => {
      const ship = makeShip({ teamcode: undefined, dirty: false });
      await makeHandler(null).command.handler(ship, ['leave'], ctx);
      expect({ teamcode: ship.teamcode, dirty: ship.dirty })
        .toEqual({ teamcode: undefined, dirty: false });
    });
  });
});
