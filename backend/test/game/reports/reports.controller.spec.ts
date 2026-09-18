import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReportsController } from '../../../src/game/reports/reports.controller';
import { BugReportService } from '../../../src/game/reports/bug-report.service';

/**
 * The sysop's view of player bug reports.
 *
 * Gated on the same GE_SYSOP_USERNAME allowlist that gates the `sys` command —
 * one function in `auth/sysop.ts`, called by both, because two copies of an
 * authorization check is how one of them quietly stops matching the other.
 *
 * The gate matters more here than it looks. A reports feed is every player's
 * words, including whatever they pasted into one while angry, and the sysop
 * signs in as an ordinary player — so the ONLY thing between a curious captain
 * and that feed is this check. It fails closed: unset means nobody.
 */
describe('ReportsController', () => {
  const rows = [
    { id: 'r1', text: 'the scanner lied', status: 'open', createdAt: new Date() },
    { id: 'r2', text: 'gravity killed me at warp', status: 'closed', createdAt: new Date() },
  ];

  function build(
    env: Record<string, string | undefined> = { GE_SYSOP_USERNAME: 'Rick' },
    /**
     * What the DATABASE says this account is called. The controller asks it
     * rather than trusting the token's `username` claim, which is a 30-day-old
     * copy and null on a token minted before registration step 2.
     */
    dbUsername: string | null = 'Rick',
  ) {
    const service = {
      list: vi.fn().mockResolvedValue(rows),
      setStatus: vi.fn().mockResolvedValue(true),
    } as unknown as BugReportService;
    const users = {
      findUsername: vi.fn().mockResolvedValue(dbUsername),
    } as unknown as import('../../../src/game/player/user.repository').UserRepository;
    return { controller: new ReportsController(service, users, env), service, users };
  }

  /** The token. Its `username` is deliberately WRONG in most of these — the
   * controller must not be reading it. */
  const as = (username: string | null) => ({ user: { sub: 'u1', username } });

  it('gives the sysop the reports, newest first', async () => {
    const { controller, service } = build();

    const out = await controller.list(as('Rick') as never, undefined);

    expect(out.reports).toHaveLength(2);
    expect(service.list).toHaveBeenCalledWith(undefined);
  });

  it('matches the allowlist case-insensitively, as usernames are', async () => {
    const { controller } = build({ GE_SYSOP_USERNAME: 'rick' }, 'RICK');
    await expect(controller.list(as('RICK') as never, undefined)).resolves.toBeDefined();
  });

  it('believes the database, not the token', async () => {
    // A token minted before registration step 2 carries `username: null`, and
    // it stays that way for 30 days. The sysop must not lose access to their
    // own reports because of a stale claim.
    const { controller, users } = build({ GE_SYSOP_USERNAME: 'Rick' }, 'Rick');

    await expect(controller.list(as(null) as never, undefined)).resolves.toBeDefined();
    expect(users.findUsername).toHaveBeenCalledWith('u1');
  });

  it('refuses when the token claims a name the account does not have', async () => {
    // The claim is signed, so this is not forgery — but it can be STALE, and
    // the database is the only current answer.
    const { controller } = build({ GE_SYSOP_USERNAME: 'Rick' }, 'Wasp');

    await expect(controller.list(as('Rick') as never, undefined)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an ordinary captain', async () => {
    const { controller, service } = build({ GE_SYSOP_USERNAME: 'Rick' }, 'Wasp');

    await expect(controller.list(as('Wasp') as never, undefined)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('refuses everybody when no sysop is configured', async () => {
    // Fails CLOSED. An unset allowlist must not mean "everyone".
    const { controller } = build({});

    await expect(controller.list(as('Rick') as never, undefined)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses when the account has no display name at all', async () => {
    const { controller } = build({ GE_SYSOP_USERNAME: 'Rick' }, null);
    await expect(controller.list(as('Rick') as never, undefined)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('filters by status when asked', async () => {
    const { controller, service } = build();

    await controller.list(as('Rick') as never, 'open');

    expect(service.list).toHaveBeenCalledWith('open');
  });

  it('closes a report', async () => {
    const { controller, service } = build();

    const out = await controller.setStatus(as('Rick') as never, 'r1', { status: 'closed' });

    expect(service.setStatus).toHaveBeenCalledWith('r1', 'closed');
    expect(out.status).toBe('closed');
  });

  it('answers 404 rather than 200 for a report that is not there', async () => {
    const { controller, service } = build();
    (service.setStatus as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(
      controller.setStatus(as('Rick') as never, 'nope', { status: 'closed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts only the statuses it knows', async () => {
    const { controller } = build();

    await expect(
      controller.setStatus(as('Rick') as never, 'r1', { status: 'deleted' } as never),
    ).rejects.toThrow();
  });
});

/**
 * Where the route is mounted is part of the contract, and it is not obvious.
 *
 * nginx proxies exactly four prefixes to the backend — `/auth/`, `/admin/`,
 * `/public/`, `/socket.io/` — and everything else is served `index.html`. The
 * PAGE also lives at `/reports`. So a top-level `/reports` API route is both a
 * collision with the page's own URL and, in production, unreachable: the SPA
 * answers first. It was written that way, and opening the page in a browser is
 * what found it.
 */
describe('ReportsController mounting', () => {
  it('lives under a prefix nginx actually proxies', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '../../../src/game/reports/reports.controller.ts'), 'utf8');
    expect(src).toContain("@Controller('admin/reports')");

    const nginx = readFileSync(join(__dirname, '../../../../frontend/nginx.conf'), 'utf8');
    expect(nginx).toContain('location /admin/');
  });
});
