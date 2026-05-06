import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../../src/auth/auth.service';
import { DUMMY_BCRYPT_HASH } from '../../../src/auth/auth.constants';
import { PrismaService } from '../../../src/prisma/prisma.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const mockPrisma = {
  user: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn(),
  verifyAsync: jest.fn(),
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

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await makeService();
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register()', () => {
    it('happy path — returns token and user', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      mockPrisma.user.create.mockResolvedValue({});
      mockJwt.sign.mockReturnValue('signed-token');

      const result = await service.register({
        username: 'pilot',
        password: 'password123',
      });

      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
      const createArg = mockPrisma.user.create.mock.calls[0][0] as {
        data: { userid: string; username: string; passwordHash: string; options: number[] };
      };
      expect(createArg.data.username).toBe('pilot');
      expect(createArg.data.passwordHash).toBe('hashed-pw');
      expect(createArg.data.options).toEqual([]);
      expect(createArg.data.userid).toMatch(/^usr_[0-9a-f]{24}$/);

      expect(mockJwt.sign).toHaveBeenCalledWith({
        sub: createArg.data.userid,
        username: 'pilot',
      });

      expect(result).toEqual({
        token: 'signed-token',
        user: { id: createArg.data.userid, username: 'pilot' },
      });
    });

    it('P2002 unique violation → ConflictException USERNAME_TAKEN', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      mockPrisma.user.create.mockRejectedValue(p2002);

      await expect(
        service.register({ username: 'taken', password: 'password123' }),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.register({ username: 'taken', password: 'password123' }),
      ).rejects.toMatchObject({
        response: { code: 'USERNAME_TAKEN' },
      });
    });

    it('non-P2002 error is re-thrown as-is', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      const dbErr = new Error('connection error');
      mockPrisma.user.create.mockRejectedValue(dbErr);

      await expect(
        service.register({ username: 'pilot', password: 'password123' }),
      ).rejects.toThrow('connection error');
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe('login()', () => {
    const storedUser = {
      userid: 'usr_abc123',
      username: 'Pilot',
      passwordHash: '$2b$12$realhash',
    };

    it('happy path — correct password returns token and user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(storedUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwt.sign.mockReturnValue('login-token');

      const result = await service.login({ username: 'Pilot', password: 'correctPass1' });

      expect(bcrypt.compare).toHaveBeenCalledWith('correctPass1', storedUser.passwordHash);
      expect(result).toEqual({
        token: 'login-token',
        user: { id: storedUser.userid, username: storedUser.username },
      });
    });

    it('wrong password → UnauthorizedException INVALID_CREDENTIALS', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(storedUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ username: 'Pilot', password: 'wrongPass1' }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.login({ username: 'Pilot', password: 'wrongPass1' }),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
    });

    it('user not found → bcrypt.compare called with DUMMY_BCRYPT_HASH (constant-time), then UnauthorizedException', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ username: 'ghost', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      expect((bcrypt.compare as jest.Mock).mock.calls[0][1]).toBe(DUMMY_BCRYPT_HASH);
    });

    it('user found but passwordHash is null → bcrypt.compare called with DUMMY_BCRYPT_HASH, then UnauthorizedException', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...storedUser,
        passwordHash: null,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ username: 'Pilot', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      expect((bcrypt.compare as jest.Mock).mock.calls[0][1]).toBe(DUMMY_BCRYPT_HASH);
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
  });
});
