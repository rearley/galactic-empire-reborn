import { TeamService } from '../../src/game/team/team.service';
import { TeamRepository } from '../../src/game/team/team.repository';
import { UserRepository } from '../../src/game/player/user.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { makeShip } from '../helpers/make-ship';

/**
 * Creating a team performs TWO writes — insert the `Team` row, then set the
 * founder's `teamcode` — and they must be atomic.
 *
 * They were not. The callback handed to `$transaction` took no parameter, so
 * every write inside it went through the OUTER client. Prisma's interactive
 * transaction only covers operations issued on the `tx` client it hands the
 * callback, so the wrapper bought a transaction on the connection, some
 * latency, and no atomicity at all. If the second write failed — a dropped
 * connection, the process dying between them — the team existed with no
 * founder and no members, and its name was taken.
 *
 * `joinByPassword`, ten lines below in the same file, already did it right.
 *
 * The second half of the same defect: `getMaxTeamcode()` then
 * `insertTeam(max + 1n)` is a read-modify-write with no lock, so two concurrent
 * creations compute the same code. The P2002 retry loop was absorbing that
 * rather than the collision being prevented. A transaction-scoped advisory lock
 * serialises allocation, which is the same instrument the midnight job uses.
 *
 * @see issue #14  @see GECMDS.C:5277 `void  FUNC cmd_team()`
 */
describe('TeamService.create — both writes inside one transaction', () => {
  function harness() {
    const calls: string[] = [];
    const tx = { $queryRaw: vi.fn(async () => { calls.push('lock'); return []; }) };

    const repo = {
      countTeams: vi.fn().mockResolvedValue(0),
      getMaxTeamcode: vi.fn(async (client?: unknown) => {
        calls.push(client === tx ? 'max(tx)' : 'max(OUTER)');
        return 4n;
      }),
      insertTeam: vi.fn(async (_data: unknown, client?: unknown) => {
        calls.push(client === tx ? 'insert(tx)' : 'insert(OUTER)');
      }),
      findByNameLower: vi.fn(),
      liveCountsGroupBy: vi.fn(),
      findTeamsByCodes: vi.fn(),
    } as unknown as TeamRepository;

    const users = {
      setTeamcode: vi.fn(async (_u: string, _c: bigint | null, client?: unknown) => {
        calls.push(client === tx ? 'setTeamcode(tx)' : 'setTeamcode(OUTER)');
      }),
    } as unknown as UserRepository;

    const prisma = {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;

    return { svc: new TeamService(prisma, repo, users), calls };
  }

  it('issues every write on the transaction client, never the outer one', async () => {
    const { svc, calls } = harness();
    const result = await svc.create({ ship: makeShip({ teamcode: undefined }), name: 'Raiders', password: 'pw' });

    expect(result).toMatchObject({ ok: true, teamcode: 5n });
    expect(calls.filter((c) => c.includes('OUTER'))).toEqual([]);
  });

  it('takes the allocation lock before reading MAX(teamcode)', async () => {
    const { svc, calls } = harness();
    await svc.create({ ship: makeShip({ teamcode: undefined }), name: 'Raiders', password: 'pw' });

    expect(calls).toEqual(['lock', 'max(tx)', 'insert(tx)', 'setTeamcode(tx)']);
  });
});
