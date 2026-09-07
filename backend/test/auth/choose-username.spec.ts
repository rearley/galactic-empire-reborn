import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

function makeService(userTable: Partial<Record<string, jest.Mock>>) {
  const prisma = { user: userTable } as unknown as PrismaService;
  const jwt = { sign: jest.fn().mockReturnValue('fresh.jwt.token') } as unknown as JwtService;
  return new AuthService(prisma, jwt);
}

describe('chooseUsername', () => {
  it('sets the handle and returns a token that carries it', async () => {
    // The token issued at step 1 says username: null, and WsAuthGuard refuses
    // those. Without a fresh token here the player finishes signup and still
    // cannot open a socket.
    const findUnique = jest.fn().mockResolvedValue({ userid: 'usr_abc', username: null });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const svc = makeService({ findUnique, updateMany });

    const result = await svc.chooseUsername('usr_abc', { username: 'rick' });

    expect(updateMany).toHaveBeenCalledWith({
      where: { userid: 'usr_abc', username: null },
      data: { username: 'rick' },
    });
    expect(result.user).toEqual({ id: 'usr_abc', username: 'rick' });
    expect(result.token).toBe('fresh.jwt.token');
  });

  it('refuses a handle someone already holds', async () => {
    const findUnique = jest.fn().mockResolvedValue({ userid: 'usr_abc', username: null });
    const updateMany = jest.fn().mockRejectedValue(
      Object.assign(new Error('unique violation'), {
        code: 'P2002',
        meta: { target: 'User_username_lower_idx' },
      }),
    );
    const svc = makeService({ findUnique, updateMany });

    await expect(svc.chooseUsername('usr_abc', { username: 'rick' }))
      .rejects.toMatchObject({ response: { code: 'USERNAME_TAKEN' } });
  });

  it('refuses to rename an account that already has a handle', async () => {
    // This endpoint completes signup. It is not a rename feature, and letting
    // it act as one would let a player shed a reputation mid-war.
    const findUnique = jest.fn().mockResolvedValue({ userid: 'usr_abc', username: 'rick' });
    const updateMany = jest.fn();
    const svc = makeService({ findUnique, updateMany });

    await expect(svc.chooseUsername('usr_abc', { username: 'someoneelse' }))
      .rejects.toMatchObject({ response: { code: 'USERNAME_ALREADY_SET' } });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown userid rather than creating a row', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const svc = makeService({ findUnique, updateMany: jest.fn() });

    await expect(svc.chooseUsername('usr_ghost', { username: 'rick' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses the claim when a concurrent request already won the race', async () => {
    // The findUnique read above says username is still null — but by the time
    // the write lands, a second request on the same token got there first.
    // Correctness has to live in the write's WHERE clause (userid AND
    // username: null), not in the earlier read: updateMany matching zero rows
    // is the only signal that distinguishes "I won" from "someone beat me",
    // and the service must report USERNAME_ALREADY_SET rather than success.
    const findUnique = jest.fn().mockResolvedValue({ userid: 'usr_abc', username: null });
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const svc = makeService({ findUnique, updateMany });

    await expect(svc.chooseUsername('usr_abc', { username: 'rick' }))
      .rejects.toMatchObject({ response: { code: 'USERNAME_ALREADY_SET' } });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userid: 'usr_abc', username: null },
      data: { username: 'rick' },
    });
  });
});
