/**
 * A duplicate email must be a 409, not a 500 — across both Prisma error shapes.
 *
 * Prisma 7 kept the `P2002` code and MOVED the constraint name. Before, a
 * unique violation carried `meta: { target: ['user_email_lower_key'] }`. With a
 * driver adapter it carries:
 *
 *   meta.driverAdapterError.cause.constraint.index = 'user_email_lower_key'
 *
 * and no `target` at all. Reading only `target` therefore stops matching, and
 * the failure is not a crash — it is `AuthService.register` rethrowing, which
 * Nest turns into a **500 Internal Server Error** where the player should see
 * "an account with that email already exists". Observed exactly that on the
 * Prisma 7 upgrade: `test/integration/auth/register.spec.ts` got 500 for 409.
 *
 * Both shapes are pinned here, at the unit level, because the integration test
 * that caught it needs a live database and a booted app — so it is the slowest
 * possible place to notice, and it cannot say WHICH shape broke.
 *
 * @see src/auth/auth.service.ts isUniqueViolation
 * @see docs/DECISIONS.md 2026-09-11
 */
import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../../src/auth/auth.service';
import { PrismaService } from '../../../src/prisma/prisma.service';

/** A P2002 in the shape Prisma 5 and 6 produced. */
function legacyP2002(target: string): Error {
  return Object.assign(new Error('unique violation'), { code: 'P2002', meta: { target: [target] } });
}

/** A P2002 in the shape Prisma 7's driver adapter produces. */
function adapterP2002(index: string): Error {
  return Object.assign(new Error('unique violation'), {
    code: 'P2002',
    meta: {
      modelName: 'User',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23505',
          kind: 'UniqueConstraintViolation',
          constraint: { index },
          table: 'User',
        },
      },
    },
  });
}

function serviceRejecting(err: Error): AuthService {
  const prisma = { user: { create: vi.fn().mockRejectedValue(err) } } as unknown as PrismaService;
  const jwt = { sign: vi.fn().mockReturnValue('signed.jwt.token') } as unknown as JwtService;
  return new AuthService(prisma, jwt);
}

const CREDENTIALS = { email: 'alice@example.com', password: 'password123' };

describe('register maps a unique violation to EMAIL_TAKEN', () => {
  it('recognises the Prisma 7 driver-adapter shape', async () => {
    const svc = serviceRejecting(adapterP2002('user_email_lower_key'));
    await expect(svc.register(CREDENTIALS)).rejects.toBeInstanceOf(ConflictException);
  });

  it('still recognises the pre-7 meta.target shape', async () => {
    // Kept because `test:manual` and the unit mocks elsewhere produce it, and
    // because dropping support would be an undetectable regression if anything
    // ever reports the old form.
    const svc = serviceRejecting(legacyP2002('user_email_lower_key'));
    await expect(svc.register(CREDENTIALS)).rejects.toBeInstanceOf(ConflictException);
  });

  it('recognises the expression form Prisma reports for an expression index', async () => {
    const svc = serviceRejecting(adapterP2002('lower(email)'));
    await expect(svc.register(CREDENTIALS)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows a unique violation on a DIFFERENT index rather than blaming the email', async () => {
    // The whole point of matching the constraint name: two unique indexes live
    // on User, and telling the player to change their email when the username
    // collided would be a wrong answer, not a slow one.
    const svc = serviceRejecting(adapterP2002('User_username_lower_idx'));
    await expect(svc.register(CREDENTIALS)).rejects.not.toBeInstanceOf(ConflictException);
  });

  /**
   * A candidate that is not a string must be ignored, not stringified.
   *
   * The matcher ran every candidate through `String(c)`, and `String({})` is
   * `'[object Object]'` — a value that can never match a marker but is compared
   * against every one of them, so the intent ("did this constraint name our
   * email index?") was answered by accident rather than by rule. It is also the
   * shape a future Prisma release could hand us: `constraint.fields` as an
   * object rather than an array of names. @see issue #29
   */
  it('ignores a candidate that is not a string or an array of them', async () => {
    const err = Object.assign(new Error('unique violation'), {
      code: 'P2002',
      meta: { driverAdapterError: { cause: { constraint: { fields: { 0: 'email' } } } } },
    });
    const svc = serviceRejecting(err);
    await expect(svc.register(CREDENTIALS)).rejects.not.toBeInstanceOf(ConflictException);
  });
});
