import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChooseUsernameDto } from './dto/choose-username.dto';
import { BCRYPT_COST, DUMMY_BCRYPT_HASH } from './auth.constants';

/** Shape returned by both register and login. */
export interface AuthResult {
  token: string;
  user: { id: string; username: string | null };
}

/**
 * Names of the email unique index, in every shape Prisma has been observed to
 * report in P2002's `meta.target`.
 *
 * `user_email_lower_key` is the index's real name (the `add_user_email`
 * migration; @see Task 1 step 3). But it is a partial expression index
 * (`ON "User" (lower(email)) WHERE email IS NOT NULL`), and Prisma's engine
 * does not resolve expression indexes back to their name — verified live
 * against ge_test, a duplicate email comes back with
 * `meta: { target: ["lower(email)"] }`, not the index name. Matching on the
 * name alone silently rethrows every real EMAIL_TAKEN case as a 500; both
 * forms are matched here so the unit-test mocks (which use the name) and the
 * live database (which reports the expression) both resolve correctly.
 */
const EMAIL_INDEX_MARKERS = ['user_email_lower_key', 'lower(email)'];

/**
 * Names of the username unique index, in every shape Prisma has been
 * observed to report in P2002's `meta.target`.
 *
 * `User_username_lower_idx` is the index's real name (the
 * `011_onboarding_auth` migration; `migration.sql:25`). It is an expression
 * index (`ON "User" (LOWER("username"))`), and — as with the email index
 * above — Prisma's engine reports expression indexes by the expression
 * itself, not the index name: a duplicate username comes back with
 * `meta: { target: ["lower(username)"] }`. Matching on the name alone would
 * silently rethrow every real USERNAME_TAKEN case as a 500; both forms are
 * matched here so the unit-test mocks (which use the name) and the live
 * database (which reports the expression) both resolve correctly.
 */
const USERNAME_INDEX_MARKERS = ['User_username_lower_idx', 'lower(username)'];

/**
 * Prisma reports every unique violation as P2002 and names the offending
 * constraint (or, for an expression index, the expression itself). Two unique
 * indexes live on User, so this is the only way to tell which field the player
 * must fix.
 *
 * TWO SHAPES, because Prisma 7 moved where the name lives:
 *
 *   pre-7   meta.target = ['user_email_lower_key']
 *   7       meta.driverAdapterError.cause.constraint.index = 'user_email_lower_key'
 *           (and no `target` at all)
 *
 * Reading only `target` stopped matching on the Prisma 7 upgrade, and the
 * symptom was not a crash — `register` rethrew and Nest turned it into a 500
 * where the player should have seen "an account with that email already
 * exists". Both shapes are pinned by
 * `test/unit/auth/unique-violation-shape.spec.ts`.
 */
function isUniqueViolation(err: unknown, markers: readonly string[]): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as {
    code?: string;
    meta?: {
      target?: unknown;
      driverAdapterError?: { cause?: { constraint?: { index?: unknown; fields?: unknown } } };
    };
  };
  if (e.code !== 'P2002') return false;

  const constraint = e.meta?.driverAdapterError?.cause?.constraint;
  const candidates: unknown[] = [e.meta?.target, constraint?.index, constraint?.fields];

  // Strings only. `String(c)` on an object is `[object Object]`, which is then
  // compared against every marker — a question answered by accident rather than
  // by rule, and the shape a future Prisma could hand us for `fields`.
  // @see issue #29
  const names = candidates.flatMap((c) =>
    typeof c === 'string' ? [c] : Array.isArray(c) ? c.filter((x) => typeof x === 'string') : [],
  );
  return names.some((n) => markers.some((marker) => n.toLowerCase().includes(marker.toLowerCase())));
}

/**
 * Handles player registration, login, and JWT issuance.
 *
 * Registration is step 1 of a two-step signup: it creates the account by
 * email + password with `username: null`. The in-game handle is chosen in
 * step 2 (a separate endpoint), so `username` is nullable everywhere in
 * this service's return shapes.
 *
 * Constant-time policy: bcrypt.compare is always called during login,
 * even when the user does not exist or has no password hash, to prevent
 * user enumeration via timing attacks.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Registers a new player account by email + password.
   *
   * Generates a random userid, hashes the supplied password, and persists
   * a new User row with `username: null`. Throws ConflictException
   * (EMAIL_TAKEN) on duplicate email (Prisma P2002 on `user_email_lower_key`).
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const userid = `usr_${randomBytes(12).toString('hex')}`;
    const hash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const email = dto.email.trim().toLowerCase();

    try {
      await this.prisma.user.create({
        data: { userid, email, username: null, passwordHash: hash, options: [] },
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err, EMAIL_INDEX_MARKERS)) {
        throw new ConflictException({
          code: 'EMAIL_TAKEN',
          message: 'An account with that email already exists.',
        });
      }
      throw err;
    }

    return { token: this.issueJwt(userid, null), user: { id: userid, username: null } };
  }

  /**
   * Step 2 of registration: attach a display handle to an account that has
   * credentials but no name yet.
   *
   * Returns a FRESH token. The one minted at step 1 carries `username: null`,
   * which WsAuthGuard refuses — without reissuing here the player would
   * finish signing up and still be unable to open a socket.
   *
   * Throws NotFoundException (NO_SUCH_USER) if the userid does not exist,
   * ConflictException (USERNAME_ALREADY_SET) if the account already has a
   * handle — this completes registration, it is not a rename — and
   * ConflictException (USERNAME_TAKEN) on duplicate username (Prisma P2002
   * on `User_username_lower_idx`).
   *
   * The `findUnique` below is a friendly early return only — it makes the
   * common-case NO_SUCH_USER / USERNAME_ALREADY_SET messages fast and clear,
   * but it does NOT carry the correctness guarantee. Two concurrent requests
   * on the same token could both pass that check before either write lands
   * ("check-then-act"), and the unique index on username doesn't close that
   * gap — it stops two accounts sharing a name, not one account being named
   * twice. The guarantee instead comes from the WRITE: `updateMany` puts
   * `username: null` in its own `where`, so the update only ever matches a
   * row that still has no name. A `count` of 0 means either the account never
   * existed (already caught above) or someone else's write won the race —
   * both collapse to USERNAME_ALREADY_SET, which is correct either way since
   * this endpoint's only job is "the account has *a* name now."
   */
  async chooseUsername(userid: string, dto: ChooseUsernameDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { userid } });
    if (!existing) {
      throw new NotFoundException({ code: 'NO_SUCH_USER', message: 'Account not found.' });
    }

    if (existing.username !== null) {
      throw new ConflictException({
        code: 'USERNAME_ALREADY_SET',
        message: 'This account already has a username.',
      });
    }

    let result: { count: number };
    try {
      result = await this.prisma.user.updateMany({
        where: { userid, username: null },
        data: { username: dto.username },
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err, USERNAME_INDEX_MARKERS)) {
        throw new ConflictException({
          code: 'USERNAME_TAKEN',
          message: 'That username is already taken.',
        });
      }
      throw err;
    }

    if (result.count === 0) {
      throw new ConflictException({
        code: 'USERNAME_ALREADY_SET',
        message: 'This account already has a username.',
      });
    }

    return {
      token: this.issueJwt(userid, dto.username),
      user: { id: userid, username: dto.username },
    };
  }

  /**
   * Authenticates a player by email and password.
   *
   * Always runs bcrypt.compare to ensure constant-time behaviour regardless
   * of whether the user exists or has a null passwordHash (prevents enumeration).
   * Throws UnauthorizedException (INVALID_CREDENTIALS) on any mismatch.
   *
   * Deliberately issues a token even when the account has not chosen a
   * username yet (`username: null`) — that account completed step 1 of
   * registration and abandoning at that point must not lock the player out
   * of finishing step 2. A downstream login screen branches on the null.
   */
  async login(dto: LoginDto): Promise<AuthResult> {
    // Plain equality, not `mode: 'insensitive'`. Prisma renders that as
    // `ILIKE $1` with the caller's string used UNESCAPED as the pattern —
    // `@IsEmail()` accepts `%`, so "%@gmail.com" would test one password
    // against every matching account in a single query, and `findFirst`
    // would return an arbitrary match. `register` already lowercases before
    // storing, so the stored value is already canonical: normalizing here
    // and comparing with `=` gets the same case-insensitive match with no
    // pattern-matching involved.
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.trim().toLowerCase() },
    });

    // Always compare against something so an unknown email costs the same as a
    // known one. Without this the response time answers "is this address
    // registered?" for anyone who cares to ask.
    const hashToCompare = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
    const valid = await bcrypt.compare(dto.password, hashToCompare);

    if (!user || user.passwordHash === null || !valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    return {
      token: this.issueJwt(user.userid, user.username),
      user: { id: user.userid, username: user.username },
    };
  }

  /**
   * Issues a signed JWT for the given player identity.
   *
   * Payload: `{ sub: userid, username, iat, exp }` — iat and exp are
   * injected automatically by JwtService based on the module configuration.
   * `username` is `null` for an account that has not completed step 2 of
   * registration yet.
   */
  issueJwt(userid: string, username: string | null): string {
    return this.jwtService.sign({ sub: userid, username });
  }

  /**
   * Verifies a JWT and returns its payload.
   *
   * Propagates JsonWebTokenError and TokenExpiredError to the caller —
   * guard layers are responsible for converting these to HTTP responses.
   */
  async verifyJwt(token: string): Promise<{ sub: string; username: string | null }> {
    return this.jwtService.verifyAsync<{ sub: string; username: string | null }>(token);
  }
}
