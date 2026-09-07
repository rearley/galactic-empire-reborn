import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
// `import bcrypt = require(...)` (not `import * as bcrypt`) so this binds the
// same concrete module object `bcrypt` in auth.service.ts forwards to.
// TypeScript's namespace-import helper (__importStar) copies CJS exports
// onto a fresh, non-configurable wrapper object per import site, which makes
// `jest.spyOn(bcrypt, 'compare')` throw "Cannot redefine property" below.
import bcrypt = require('bcrypt');

function makeService(userTable: Partial<Record<string, jest.Mock>>) {
  const prisma = { user: userTable } as unknown as PrismaService;
  const jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') } as unknown as JwtService;
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
    const create = jest.fn().mockResolvedValue({});
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
    const create = jest.fn().mockRejectedValue(p2002('user_email_lower_key'));
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
    const findFirst = jest.fn().mockResolvedValue({
      userid: 'usr_abc', username: 'rick', passwordHash: hash,
    });
    const svc = makeService({ findFirst });

    const result = await svc.login({ email: 'RICK@Example.com', password: 'hunter2hunter2' });

    expect(result.user).toEqual({ id: 'usr_abc', username: 'rick' });
    const where = findFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('insensitive');
  });

  it('still runs bcrypt when the email is unknown, so timing does not leak membership', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const svc = makeService({ findFirst });
    const compare = jest.spyOn(bcrypt, 'compare');

    await expect(svc.login({ email: 'nobody@example.com', password: 'hunter2hunter2' }))
      .rejects.toBeInstanceOf(UnauthorizedException);

    expect(compare).toHaveBeenCalled();
    compare.mockRestore();
  });

  it('issues a token for an account that has not chosen a username yet', async () => {
    // Otherwise abandoning signup after step 1 locks the player out of step 2.
    const findFirst = jest.fn().mockResolvedValue({
      userid: 'usr_def', username: null, passwordHash: hash,
    });
    const svc = makeService({ findFirst });

    const result = await svc.login({ email: 'half@example.com', password: 'hunter2hunter2' });
    expect(result.user.username).toBeNull();
  });
});
