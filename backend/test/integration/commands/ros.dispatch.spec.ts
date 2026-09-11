import { CommandRouterService } from '../../../src/game/commands/command-router.service';
import { RosHandlerService } from '../../../src/game/commands/handlers/ros.handler';
import { TeamRepository } from '../../../src/game/team/team.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';
import { UserRepository } from '../../../src/game/player/user.repository';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import type { Mock } from 'vitest';

const emptyTeamRepo = { findTeamsByCodes: vi.fn().mockResolvedValue([]) } as unknown as TeamRepository;

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    ...overrides,
  });
}

const ctx: CommandContext = {};

function buildRouter(users: Array<{ userid: string; score: bigint; kills: number; planets: number; population: bigint }>): CommandRouterService {
  const prismaMock = {
    user: { findMany: vi.fn().mockResolvedValue(users) },
  } as unknown as PrismaService;
  const handler = new RosHandlerService(new UserRepository(prismaMock));
  const router = new CommandRouterService();
  router.register(handler.command);
  return router;
}

describe('ros dispatch integration', () => {
  it('ros with human players returns header + rows', async () => {
    const users = [
      { userid: 'admiral', score: 1000n, kills: 5, planets: 2, population: 500n },
      { userid: 'captain', score: 500n, kills: 2, planets: 1, population: 200n },
    ];
    const router = buildRouter(users);
    const result = await router.dispatch('ros', makeShip(), ctx);
    const header = result.lines[0];
    expect(header.category).toBe('system');
    // ROSTER2, not the port's invented column heading. @see GECMDS.C:4028
    expect(header.text).toMatch(/Top \d+ Roster List/);
    const rows = result.lines.filter((l) => l.category === 'info');
    expect(rows).toHaveLength(2);
    expect(rows[0].text).toContain('admiral');
  });

  it('ros all passes to Prisma with all cap', async () => {
    const prismaMock = { user: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaService;
    const handler = new RosHandlerService(new UserRepository(prismaMock));
    const router = new CommandRouterService();
    router.register(handler.command);
    await router.dispatch('ros all', makeShip(), ctx);
    expect((prismaMock.user.findMany as Mock).mock.calls[0][0].take).toBe(200);
  });

  it('ros with empty result returns only header', async () => {
    const router = buildRouter([]);
    const result = await router.dispatch('ros', makeShip(), ctx);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].category).toBe('system');
  });
});
