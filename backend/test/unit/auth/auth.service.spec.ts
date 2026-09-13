import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../../src/auth/auth.service';
import { DUMMY_BCRYPT_HASH } from '../../../src/auth/auth.constants';
import { PrismaService } from '../../../src/prisma/prisma.service';
import type { Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

const mockPrisma = {
  user: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
};

const mockJwt = {
  sign: vi.fn(),
  verifyAsync: vi.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(): Promise<AuthService> {
  return Test.createTestingModule({
    providers: [
      AuthService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: JwtService, useValue: mockJwt },
    ],
  })
    .compile()
    .then((m: TestingModule) => m.get(AuthService));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
//
// The email/password contract itself (register creates username: null,
// EMAIL_TAKEN on conflict, login by email case-insensitively, login issues a
// token for a null-username account) is pinned by test/auth/email-auth.spec.ts.
// This file covers the remaining AuthService surface: the non-P2002 error
// path, DUMMY_BCRYPT_HASH plumbing, and issueJwt/verifyJwt.

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = await makeService();
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register()', () => {
    it('happy path — returns token and user with username: null', async () => {
      (bcrypt.hash as Mock).mockResolvedValue('hashed-pw');
      mockPrisma.user.create.mockResolvedValue({});
      mockJwt.sign.mockReturnValue('signed-token');

      const result = await service.register({
        email: 'pilot@example.com',
        password: 'password123',
      });

      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
      const createArg = mockPrisma.user.create.mock.calls[0][0] as {
        data: {
          userid: string;
          email: string;
          username: string | null;
          passwordHash: string;
          options: number[];
        };
      };
      expect(createArg.data.email).toBe('pilot@example.com');
      expect(createArg.data.username).toBeNull();
      expect(createArg.data.passwordHash).toBe('hashed-pw');
      expect(createArg.data.options).toEqual([]);
      expect(createArg.data.userid).toMatch(/^usr_[0-9a-f]{24}$/);

      expect(mockJwt.sign).toHaveBeenCalledWith({
        sub: createArg.data.userid,
        username: null,
      });

      expect(result).toEqual({
        token: 'signed-token',
        user: { id: createArg.data.userid, username: null },
      });
    });

    it('P2002 on the email index → ConflictException EMAIL_TAKEN', async () => {
      (bcrypt.hash as Mock).mockResolvedValue('hashed-pw');
      const p2002 = Object.assign(new Error('Unique constraint'), {
        code: 'P2002',
        meta: { target: 'user_email_lower_key' },
      });
      mockPrisma.user.create.mockRejectedValue(p2002);

      await expect(
        service.register({ email: 'taken@example.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.register({ email: 'taken@example.com', password: 'password123' }),
      ).rejects.toMatchObject({
        response: { code: 'EMAIL_TAKEN' },
      });
    });

    it('non-P2002 error is re-thrown as-is', async () => {
      (bcrypt.hash as Mock).mockResolvedValue('hashed-pw');
      const dbErr = new Error('connection error');
      mockPrisma.user.create.mockRejectedValue(dbErr);

      await expect(
        service.register({ email: 'pilot@example.com', password: 'password123' }),
      ).rejects.toThrow('connection error');
    });

    it('a P2002 on an unrelated index is re-thrown as-is, not swallowed as EMAIL_TAKEN', async () => {
      (bcrypt.hash as Mock).mockResolvedValue('hashed-pw');
      const p2002 = Object.assign(new Error('Unique constraint'), {
        code: 'P2002',
        meta: { target: 'User_username_lower_idx' },
      });
      mockPrisma.user.create.mockRejectedValue(p2002);

      await expect(
        service.register({ email: 'pilot@example.com', password: 'password123' }),
      ).rejects.toBe(p2002);
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe('login()', () => {
    const storedUser = {
      userid: 'usr_abc123',
      email: 'pilot@example.com',
      username: 'Pilot',
      passwordHash: '$2b$12$realhash',
    };

    it('happy path — correct password returns token and user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(storedUser);
      (bcrypt.compare as Mock).mockResolvedValue(true);
      mockJwt.sign.mockReturnValue('login-token');

      const result = await service.login({ email: 'pilot@example.com', password: 'correctPass1' });

      expect(bcrypt.compare).toHaveBeenCalledWith('correctPass1', storedUser.passwordHash);
      expect(result).toEqual({
        token: 'login-token',
        user: { id: storedUser.userid, username: storedUser.username },
      });
    });

    it('wrong password → UnauthorizedException INVALID_CREDENTIALS', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(storedUser);
      (bcrypt.compare as Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'pilot@example.com', password: 'wrongPass1' }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.login({ email: 'pilot@example.com', password: 'wrongPass1' }),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
    });

    it('user not found → bcrypt.compare called with DUMMY_BCRYPT_HASH (constant-time), then UnauthorizedException', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      (bcrypt.compare as Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'ghost@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      expect((bcrypt.compare as Mock).mock.calls[0][1]).toBe(DUMMY_BCRYPT_HASH);
    });

    it('user found but passwordHash is null → bcrypt.compare called with DUMMY_BCRYPT_HASH, then UnauthorizedException', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...storedUser,
        passwordHash: null,
      });
      (bcrypt.compare as Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'pilot@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      expect((bcrypt.compare as Mock).mock.calls[0][1]).toBe(DUMMY_BCRYPT_HASH);
    });
  });

  // ── verifyJwt ─────────────────────────────────────────────────────────────

  describe('verifyJwt()', () => {
    it('delegates to jwtService.verifyAsync and returns payload', async () => {
      const payload = { sub: 'usr_abc123', username: 'Pilot' };
      mockJwt.verifyAsync.mockResolvedValue(payload);

      const result = await service.verifyJwt('some.jwt.token');

      expect(mockJwt.verifyAsync).toHaveBeenCalledWith('some.jwt.token');
      expect(result).toEqual(payload);
    });

    it('propagates errors from jwtService.verifyAsync', async () => {
      mockJwt.verifyAsync.mockRejectedValue(new Error('JsonWebTokenError'));

      await expect(service.verifyJwt('bad.token')).rejects.toThrow('JsonWebTokenError');
    });
  });

  // ── issueJwt ──────────────────────────────────────────────────────────────

  describe('issueJwt()', () => {
    it('calls jwtService.sign with sub and username', () => {
      mockJwt.sign.mockReturnValue('issued-token');

      const token = service.issueJwt('usr_001', 'admiral');

      expect(mockJwt.sign).toHaveBeenCalledWith({ sub: 'usr_001', username: 'admiral' });
      expect(token).toBe('issued-token');
    });

    it('accepts a null username and signs it as-is, unsubstituted', () => {
      mockJwt.sign.mockReturnValue('issued-token');

      const token = service.issueJwt('usr_002', null);

      expect(mockJwt.sign).toHaveBeenCalledWith({ sub: 'usr_002', username: null });
      expect(token).toBe('issued-token');
    });
  });
});
