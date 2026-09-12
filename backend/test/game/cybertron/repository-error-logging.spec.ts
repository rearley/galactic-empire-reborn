import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';

/**
 * A swallowed write must still leave a readable reason in the log.
 *
 * `incrementKills` catches and logs, so the only trace a Cybertron's kill
 * counter failed to persist is that one line. It interpolated `${err}` on an
 * `unknown`, which renders `[object Object]` for anything that is not an Error
 * — and a Prisma driver-adapter rejection is exactly that. The line then names
 * the ship and says nothing about why. @see issue #29
 */
describe('CybertronRepository.incrementKills — the error line says what failed', () => {
  function repoThatThrows(err: unknown) {
    const prisma = { ship: { update: vi.fn().mockRejectedValue(err) } };
    // incrementKills touches neither ship state nor anything else on the
    // second dependency; an empty double keeps the constructor honest.
    const repo = new CybertronRepository(prisma as never, {} as never);
    const logged: string[] = [];
    vi.spyOn((repo as unknown as { logger: { error: (m: string) => void } }).logger, 'error')
      .mockImplementation((m: unknown) => { logged.push(String(m)); });
    return { repo, logged };
  }

  it('renders a plain Error with its message', async () => {
    const { repo, logged } = repoThatThrows(new Error('connection terminated'));
    await repo.incrementKills(3, 'Cybrg-001');
    expect(logged.join('\n')).toContain('connection terminated');
    expect(logged.join('\n')).not.toContain('[object Object]');
  });

  it('renders a non-Error rejection without collapsing to [object Object]', async () => {
    const { repo, logged } = repoThatThrows({ code: 'P1017', meta: { reason: 'server closed' } });
    await repo.incrementKills(3, 'Cybrg-001');
    expect(logged.join('\n')).not.toContain('[object Object]');
    expect(logged.join('\n')).toContain('P1017');
  });

  it('still names the ship it was writing', async () => {
    const { repo, logged } = repoThatThrows(new Error('nope'));
    await repo.incrementKills(7, 'Cybrg-042');
    expect(logged.join('\n')).toContain('Cybrg-042:7');
  });
});
