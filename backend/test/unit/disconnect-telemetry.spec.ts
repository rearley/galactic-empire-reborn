import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DisconnectTelemetryService } from '../../src/gateway/disconnect-telemetry.service';

function facts(over: Partial<Parameters<DisconnectTelemetryService['recordDisconnect']>[0]> = {}) {
  return {
    userid: 'u1',
    shipno: 1,
    username: 'rick',
    reason: 'transport close',
    cantexit: 0,
    killed: false,
    xcoord: 12.5,
    ycoord: -3.25,
    speed: 4,
    ...over,
  };
}

function fakePrisma() {
  return {
    disconnectEvent: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

let prisma: ReturnType<typeof fakePrisma>;
let logged: string[];
let svc: DisconnectTelemetryService;

beforeEach(() => {
  prisma = fakePrisma();
  logged = [];
  svc = new DisconnectTelemetryService(prisma as never, { error: (m: string) => logged.push(m) });
});

describe('recordDisconnect', () => {
  it('writes one row carrying the facts that decide the fix', () => {
    // The whole point of this table: choosing the park timeout and the grace
    // period from measured gaps instead of invented numbers. Reason, combat
    // lock, position and speed are what separate a harmless idle drop from the
    // one that kills a pilot on approach to a planet.
    const at = new Date('2026-09-15T00:00:00.000Z');
    return svc.recordDisconnect(facts({ cantexit: 7, speed: 9 }), at).then(() => {
      expect(prisma.disconnectEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userid: 'u1',
          shipno: 1,
          username: 'rick',
          reason: 'transport close',
          cantexit: 7,
          killed: false,
          xcoord: 12.5,
          ycoord: -3.25,
          speed: 9,
          disconnectedAt: at,
        }),
      });
    });
  });

  it('swallows a database failure instead of breaking the disconnect', async () => {
    // This runs inside handleDisconnect, which also flushes the hull and may
    // apply the anti-rage-quit kill. Telemetry that can throw would turn a
    // logging outage into lost ships.
    prisma.disconnectEvent.create.mockRejectedValue(new Error('db down'));
    await expect(svc.recordDisconnect(facts())).resolves.toBeUndefined();
    expect(logged.join(' ')).toMatch(/disconnect telemetry/i);
  });
});

describe('recordReturn', () => {
  it('closes the open row and records how long the player was gone', async () => {
    const left = new Date('2026-09-15T00:00:00.000Z');
    const back = new Date('2026-09-15T00:00:08.500Z');
    prisma.disconnectEvent.findFirst.mockResolvedValue({ id: 'e1', disconnectedAt: left });

    await svc.recordReturn('u1', back);

    expect(prisma.disconnectEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userid: 'u1', returnedAt: null } }),
    );
    expect(prisma.disconnectEvent.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { returnedAt: back, returnedAfterMs: 8500 },
    });
  });

  it('does nothing when the player has no open disconnect', async () => {
    // A first-ever connection, or one already closed by an earlier return.
    await svc.recordReturn('u1', new Date());
    expect(prisma.disconnectEvent.update).not.toHaveBeenCalled();
  });

  it('never lets a telemetry failure block a reconnect', async () => {
    prisma.disconnectEvent.findFirst.mockRejectedValue(new Error('db down'));
    await expect(svc.recordReturn('u1', new Date())).resolves.toBeUndefined();
  });

  it('clamps a negative gap to zero rather than storing nonsense', async () => {
    // Clock skew between the two writes is possible and a negative duration
    // would poison any percentile drawn from this column.
    const left = new Date('2026-09-15T00:00:10.000Z');
    const back = new Date('2026-09-15T00:00:09.000Z');
    prisma.disconnectEvent.findFirst.mockResolvedValue({ id: 'e1', disconnectedAt: left });
    await svc.recordReturn('u1', back);
    expect(prisma.disconnectEvent.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { returnedAt: back, returnedAfterMs: 0 },
    });
  });
});
