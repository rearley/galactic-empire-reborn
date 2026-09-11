import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import type { Mock } from 'vitest';
import * as bcrypt from 'bcrypt';

// The constant-time assertion below needs to see that `bcrypt.compare` ran
// inside `AuthService.login`, and spying on a local import cannot show that:
// each importer gets its own module-namespace object, so a spy installed here
// never reaches the binding `auth.service.ts` calls. Under Jest this file used
// `import bcrypt = require(...)` to land on the one shared CJS object; that
// trick does not survive the move to Vitest, whose module runner gives every
// importer a namespace of its own.
//
// So the module itself is replaced, once, with the real implementation behind
// a spy. Behaviour is unchanged — `compare` still does real bcrypt work, which
// is what makes the timing claim meaningful — and the call is observable.
// `vi.hoisted` is required because `vi.mock` is hoisted above the imports, so
// the spy has to exist before this line is reached.
const bcryptSpy = vi.hoisted(() => ({ compare: vi.fn() }));
vi.mock('bcrypt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bcrypt')>();
  bcryptSpy.compare.mockImplementation(actual.compare);
  return { ...actual, compare: bcryptSpy.compare };
});

function makeService(userTable: Partial<Record<string, Mock>>) {
  const prisma = { user: userTable } as unknown as PrismaService;
  const jwt = { sign: vi.fn().mockReturnValue('signed.jwt.token') } as unknown as JwtService;
  return new AuthService(prisma, jwt);
}

function p2002(indexName: string) {
  return Object.assign(new Error('unique violation'), {
    code: 'P2002',
    meta: { target: indexName },
  });
}

describe('register', () => {
  it('creates the account with a null username — the handle comes in step 2', async () => {
    const create = vi.fn().mockResolvedValue({});
    const svc = makeService({ create });

    const result = await svc.register({ email: 'Pilot@Example.COM', password: 'hunter2hunter2' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ username: null, email: 'pilot@example.com' }),
      }),
    );
    expect(result.user.username).toBeNull();
    expect(result.token).toBe('signed.jwt.token');
  });

  it('reports EMAIL_TAKEN, not a generic conflict', async () => {
    // A single "already taken" would leave the player guessing which field was
    // the problem, on the one screen where guessing is most expensive.
    const create = vi.fn().mockRejectedValue(p2002('user_email_lower_key'));
    const svc = makeService({ create });

    await expect(svc.register({ email: 'taken@example.com', password: 'hunter2hunter2' }))
      .rejects.toMatchObject({ response: { code: 'EMAIL_TAKEN' } });
    await expect(svc.register({ email: 'taken@example.com', password: 'hunter2hunter2' }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe('login', () => {
  const hash = bcrypt.hashSync('hunter2hunter2', 4);

  it('finds the account regardless of the case the player typed', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      userid: 'usr_abc', username: 'rick', passwordHash: hash,
    });
    const svc = makeService({ findFirst });

    const result = await svc.login({ email: 'RICK@Example.com', password: 'hunter2hunter2' });

    expect(result.user).toEqual({ id: 'usr_abc', username: 'rick' });
    // Case-insensitivity comes from normalizing to lowercase before the query
    // (stored emails are already lowercased by register), NOT from ILIKE /
    // `mode: 'insensitive'` — that renders as `ILIKE $1` with the caller's
    // string used unescaped AS THE PATTERN, so a wildcard in the input (e.g.
    // "%@gmail.com") would match every account with one query.
    const where = findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ email: 'rick@example.com' });
  });

  it('does not treat SQL/ILIKE wildcards in the email as pattern characters', async () => {
    // A regression guard for the credential-stuffing amplifier: `%` and `_`
    // must be inert here. This only pins the query shape (mocked prisma can't
    // exercise real ILIKE semantics) — the plain-equality where-clause above
    // is what makes wildcards inert against a real Postgres `=`.
    const findFirst = vi.fn().mockResolvedValue(null);
    const svc = makeService({ findFirst });

    await expect(svc.login({ email: '%@gmail.com', password: 'hunter2hunter2' }))
      .rejects.toBeInstanceOf(UnauthorizedException);

    const where = findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ email: '%@gmail.com' });
    expect(JSON.stringify(where)).not.toContain('insensitive');
  });

  it('still runs bcrypt when the email is unknown, so timing does not leak membership', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const svc = makeService({ findFirst });
    bcryptSpy.compare.mockClear();

    await expect(svc.login({ email: 'nobody@example.com', password: 'hunter2hunter2' }))
      .rejects.toBeInstanceOf(UnauthorizedException);

    expect(bcryptSpy.compare).toHaveBeenCalled();
  });

  it('issues a token for an account that has not chosen a username yet', async () => {
    // Otherwise abandoning signup after step 1 locks the player out of step 2.
    const findFirst = vi.fn().mockResolvedValue({
      userid: 'usr_def', username: null, passwordHash: hash,
    });
    const svc = makeService({ findFirst });

    const result = await svc.login({ email: 'half@example.com', password: 'hunter2hunter2' });
    expect(result.user.username).toBeNull();
  });
});
