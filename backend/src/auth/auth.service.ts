import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { BCRYPT_COST, DUMMY_BCRYPT_HASH } from './auth.constants';

/** Shape returned by both register and login. */
export interface AuthResult {
  token: string;
  user: { id: string; username: string };
}

/**
 * Handles player registration, login, and JWT issuance.
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
   * Registers a new player account.
   *
   * Generates a random userid, hashes the supplied password, and persists
   * a new User row. Throws ConflictException (USERNAME_TAKEN) on duplicate
   * username (Prisma P2002).
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const userid = `usr_${randomBytes(12).toString('hex')}`;
    const hash = await bcrypt.hash(dto.password, BCRYPT_COST);

    try {
      await this.prisma.user.create({
        data: {
          userid,
          username: dto.username,
          passwordHash: hash,
          options: [],
        },
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'USERNAME_TAKEN',
          message: 'Username already taken.',
        });
      }
      throw err;
    }

    return {
      token: this.issueJwt(userid, dto.username),
      user: { id: userid, username: dto.username },
    };
  }

  /**
   * Authenticates a player by username and password.
   *
   * Always runs bcrypt.compare to ensure constant-time behaviour regardless
   * of whether the user exists or has a null passwordHash (prevents enumeration).
   * Throws UnauthorizedException (INVALID_CREDENTIALS) on any mismatch.
   */
  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: dto.username, mode: 'insensitive' } },
    });

    // Constant-time path: always compare against something.
    const hashToCompare = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
    const valid = await bcrypt.compare(dto.password, hashToCompare);

    if (!user || user.passwordHash === null || !valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.',
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
   */
  issueJwt(userid: string, username: string): string {
    return this.jwtService.sign({ sub: userid, username });
  }

  /**
   * Verifies a JWT and returns its payload.
   *
   * Propagates JsonWebTokenError and TokenExpiredError to the caller —
   * guard layers are responsible for converting these to HTTP responses.
   */
  async verifyJwt(token: string): Promise<{ sub: string; username: string }> {
    return this.jwtService.verifyAsync<{ sub: string; username: string }>(token);
  }
}
