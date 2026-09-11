/**
 * T009 — Unit tests for MailInboxService.
 * Mocks: MailInboxRepository, ShipStateService, PrismaService.
 */

import { MailInboxService } from '../../src/game/mail/mail-inbox.service';
import { MailInboxRepository } from '../../src/game/mail/mail-inbox.repository';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MailStat } from '@prisma/client';
import type { Mock } from 'vitest';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<MailStat> = {}): MailStat {
  return {
    userid: 'alice',
    class: 1,
    msgno: 100n,
    type: 0,
    stamp: 1_746_576_000,
    dtime: 'bob',
    topic: 'TestShip',
    name1: 'Vega',
    int1: 3,
    int2: 5,
    cash: 0n,
    debt: 0n,
    tax: 0n,
    itemqty: Array(14).fill(0n),
    ...overrides,
  };
}

function makeService(rows: MailStat[] = [], shipnames: Map<string, string> = new Map()) {
  const mockRepo = {
    findByUserid: vi.fn().mockResolvedValue(rows),
    deleteOne: vi.fn().mockResolvedValue(true),
  } as unknown as MailInboxRepository;

  const mockShipState = {
    findByUserid: vi.fn().mockImplementation((userid: string) => {
      const name = shipnames.get(userid);
      if (!name) return [];
      return [{ shipname: name }];
    }),
  } as unknown as ShipStateService;

  const mockPrisma = {} as unknown as PrismaService;

  const service = new MailInboxService(mockRepo, mockShipState, mockPrisma);
  return { service, mockRepo, mockShipState };
}

// ─── list() — sort order ─────────────────────────────────────────────────────

describe('MailInboxService.list()', () => {
  it('returns entries with 1-based indices', async () => {
    const rows = [makeRow({ msgno: 1n }), makeRow({ msgno: 2n })];
    const { service } = makeService(rows);
    const listing = await service.list('alice');
    expect(listing.entries[0].index).toBe(1);
    expect(listing.entries[1].index).toBe(2);
  });

  it('returns empty listing when no rows', async () => {
    const { service } = makeService([]);
    const listing = await service.list('alice');
    expect(listing.empty).toBe(true);
    expect(listing.entries).toHaveLength(0);
  });

  it('preserves sort order from repository (R4)', async () => {
    const rows = [
      makeRow({ class: 3, msgno: 200n, stamp: 1000 }),
      makeRow({ class: 1, msgno: 100n, stamp: 999 }),
    ];
    const { service } = makeService(rows);
    const listing = await service.list('alice');
    expect(listing.entries[0].class).toBe(3);
    expect(listing.entries[1].class).toBe(1);
  });

  it('R3 fallback: resolves sender from ShipStateService when userid found', async () => {
    const shipnames = new Map([['bob', 'Bob Ship']]);
    const { service } = makeService([makeRow({ dtime: 'bob' })], shipnames);
    const listing = await service.list('alice');
    expect(listing.entries[0].sender).toBe('Bob Ship');
  });

  it('R3 fallback: uses raw dtime when userid not in ShipStateService', async () => {
    const { service } = makeService([makeRow({ dtime: 'unknownuser' })]);
    const listing = await service.list('alice');
    expect(listing.entries[0].sender).toBe('unknownuser');
  });

  it('R3 fallback: uses "(system)" when dtime is empty', async () => {
    const { service } = makeService([makeRow({ dtime: '' })]);
    const listing = await service.list('alice');
    expect(listing.entries[0].sender).toBe('(system)');
  });
});

// ─── resolveIndex() — validation ─────────────────────────────────────────────

describe('MailInboxService.resolveIndex()', () => {
  it('returns entry for valid index 1', async () => {
    const { service } = makeService([makeRow({ msgno: 1n })]);
    const entry = await service.resolveIndex('alice', 1);
    expect(entry).not.toBeNull();
    expect(entry?.index).toBe(1);
  });

  it('returns null for index 0', async () => {
    const { service } = makeService([makeRow()]);
    expect(await service.resolveIndex('alice', 0)).toBeNull();
  });

  it('returns null for negative index', async () => {
    const { service } = makeService([makeRow()]);
    expect(await service.resolveIndex('alice', -1)).toBeNull();
  });

  it('returns null for non-integer (NaN)', async () => {
    const { service } = makeService([makeRow()]);
    expect(await service.resolveIndex('alice', NaN)).toBeNull();
  });

  it('returns null for non-integer (float)', async () => {
    const { service } = makeService([makeRow()]);
    expect(await service.resolveIndex('alice', 1.5)).toBeNull();
  });

  it('returns null for out-of-range index', async () => {
    const { service } = makeService([makeRow()]);
    expect(await service.resolveIndex('alice', 2)).toBeNull();
  });

  it('returns null when inbox is empty', async () => {
    const { service } = makeService([]);
    expect(await service.resolveIndex('alice', 1)).toBeNull();
  });
});

// ─── deleteByIndex() ─────────────────────────────────────────────────────────

describe('MailInboxService.deleteByIndex()', () => {
  it('returns true when delete succeeds', async () => {
    const { service, mockRepo } = makeService([makeRow({ msgno: 1n, class: 1 })]);
    (mockRepo.deleteOne as Mock).mockResolvedValue(true);
    const result = await service.deleteByIndex('alice', 1);
    expect(result).toBe(true);
    expect(mockRepo.deleteOne).toHaveBeenCalledWith('alice', 1, 1n);
  });

  it('returns false when index is out-of-range', async () => {
    const { service, mockRepo } = makeService([makeRow()]);
    const result = await service.deleteByIndex('alice', 99);
    expect(result).toBe(false);
    expect(mockRepo.deleteOne).not.toHaveBeenCalled();
  });

  it('returns false on P2025 (repository returns false)', async () => {
    const { service, mockRepo } = makeService([makeRow({ msgno: 1n })]);
    (mockRepo.deleteOne as Mock).mockResolvedValue(false);
    const result = await service.deleteByIndex('alice', 1);
    expect(result).toBe(false);
  });

  it('re-resolves index on each call (R5)', async () => {
    const rows = [makeRow({ msgno: 1n }), makeRow({ msgno: 2n, class: 3 })];
    const { service, mockRepo } = makeService(rows);
    await service.deleteByIndex('alice', 1);
    expect(mockRepo.findByUserid).toHaveBeenCalledTimes(1);
  });
});
