/**
 * The roster's identity column.
 *
 * Canon's row is `prf("%-30s%s%5d%3d%s\r", ...)` under the ROSTER2 heading —
 * name, score, kills, planets, empire size, and nothing else. The port had
 * added a Rank column and a Team column; both are gone, and with them the
 * batched TeamRepository lookup that ran on every `ros`.
 *
 * What survives here is the one deliberate deviation, which is about identity
 * rather than layout and is documented below.
 */
import { RosHandlerService } from '../../src/game/commands/handlers/ros.handler';
import { UserRepository } from '../../src/game/player/user.repository';

function makeHandler(rows: unknown[]): RosHandlerService {
  const prisma = { user: { findMany: jest.fn().mockResolvedValue(rows) } };
  return new RosHandlerService(new UserRepository(prisma as never));
}

async function render(handler: RosHandlerService): Promise<string[]> {
  const result = await (handler.command.handler({} as never, [], {} as never) as Promise<{
    lines: Array<{ text: string }>;
  }>);
  return result.lines.map((l) => l.text);
}

describe('roster shows the player NAME, not the internal userid', () => {
  /**
   * C's roster prints `userid` (GECMDS.C:cmd_geroster via username(),
   * GEFUNCS.C:2603) — but in MajorBBS the userid WAS the player's handle, e.g.
   * "MADMAX". This port splits that into a synthetic `userid` (`usr_<hex>`) and
   * a human `username`, so printing userid is literally faithful yet
   * semantically wrong: the roster showed rows like `usr_a9070dc745a8688f`,
   * which no player can identify.
   *
   * Found by reading the roster during a playtest.
   */
  it('renders username, never the usr_ identifier', async () => {
    const lines = await render(makeHandler([
      { userid: 'usr_a9070dc745a8688f9ed71a0c', username: 'RickTestPilot', score: 20500n, kills: 22, planets: 0, population: 0n },
    ]));
    const body = lines.join('\n');
    expect(body).toContain('RickTestPilot');
    expect(body).not.toContain('usr_');
  });

  it('falls back to the userid when a row carries no username', async () => {
    const lines = await render(makeHandler([
      { userid: 'MADMAX', username: null, score: 10n, kills: 1, planets: 0, population: 0n },
    ]));
    expect(lines.join('\n')).toContain('MADMAX');
  });
});

describe("the row follows canon's prf, not the port's columns", () => {
  it('pads the name to 30 and right-aligns score, kills and planets', async () => {
    // prf("%-30s%s%5d%3d%s") with score pre-rendered "%11ld" and population
    // " %8.3fm" — GECMDS.C:4043-4045.
    const lines = await render(makeHandler([
      { userid: 'u1', username: 'alice', score: 100n, kills: 1, planets: 0, population: 0n },
    ]));
    expect(lines[1]).toBe('alice'.padEnd(30) + '100'.padStart(11) + '    1' + '  0' + '    0.000m');
  });

  it('has no Rank and no Team column', async () => {
    const lines = await render(makeHandler([
      { userid: 'u1', username: 'alice', score: 100n, kills: 1, planets: 0, population: 0n },
    ]));
    expect(lines[0]).not.toMatch(/Rank/i);
    expect(lines[0]).not.toMatch(/Team/i);
  });

  it('heads the board with ROSTER2, naming the list length', async () => {
    const lines = await render(makeHandler([]));
    expect(lines[0]).toMatch(/Top \d+ Roster List/);
    expect(lines[0]).toContain('Score Kills Pl Empire Sz');
  });
});
