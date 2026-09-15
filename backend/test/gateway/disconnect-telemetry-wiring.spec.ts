/**
 * The telemetry has to see the disconnect the way the KILL path sees it.
 *
 * `cantexit` and the ship's position are read from live state that the very
 * next lines mutate — the kill arm emits COMBAT_SHIP_DESTROYED (which evicts
 * the hull) and the clean arm calls `unboard` (which also evicts). A row
 * written after either one would record zeros, or nothing at all, for exactly
 * the disconnects worth studying.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionLifecycleService } from '../../src/gateway/connection-lifecycle.service';
import type { DisconnectTelemetryService } from '../../src/gateway/disconnect-telemetry.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { PresenceService } from '../../src/public/presence.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Random } from '../../src/game/combat/random.port';
import type { GameSocket } from '../../src/gateway/types';
import type { LifecycleHost } from '../../src/gateway/connection-lifecycle.service';

const USERID = 'u1';

function liveShip(over: Record<string, unknown> = {}) {
  return {
    userid: USERID, shipno: 1, shipname: 'Ship1', shpclass: 1,
    xcoord: 12.5, ycoord: -3.25, speed: 4, cantexit: 0, lastfired: 255,
    status: 1, channel: 4, cloak: 0, username: 'rick', fkeys: [],
    items: new Array<bigint>(14).fill(0n), ...over,
  };
}

function make(ship: Record<string, unknown> | undefined, guardOk = false) {
  const telemetry = {
    recordDisconnect: vi.fn().mockResolvedValue(undefined),
    recordReturn: vi.fn().mockResolvedValue(undefined),
  };
  const shipStateService = {
    get: vi.fn(() => ship),
    findAllShips: vi.fn(() => []),
    unboard: vi.fn().mockResolvedValue(undefined),
    mutate: vi.fn(),
  } as unknown as ShipStateService;
  const registry = {
    getSocketId: vi.fn(() => 'sock1'),
    remove: vi.fn(() => undefined),
  } as unknown as ConnectedShipsRegistry;
  const prisma = {
    shipClass: { findFirst: vi.fn().mockResolvedValue({ points: 10 }) },
    ship: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ userid: USERID }) },
    mailStat: { findFirst: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;

  const svc = new ConnectionLifecycleService(
    shipStateService,
    registry,
    (guardOk
      ? { validate: vi.fn().mockResolvedValue({ sub: USERID, username: 'rick' }) }
      : {}) as unknown as WsAuthGuard,
    prisma,
    { clearScantab: vi.fn() } as unknown as ScanHandlerService,
    { getMaxTons: vi.fn(() => 1000) } as unknown as ShipClassCacheService,
    { next: vi.fn(() => 0) } as unknown as Random,
    { emit: vi.fn() } as unknown as EventEmitter2,
    new PresenceService(),
    undefined,
    telemetry as unknown as DisconnectTelemetryService,
  );

  const host = {
    server: { to: () => ({ except: () => ({ emit: vi.fn() }) }), emit: vi.fn() },
    log: vi.fn(),
    error: vi.fn(),
  } as unknown as LifecycleHost;

  return { svc, host, telemetry };
}

function socket(reason: string) {
  return {
    id: 'sock1',
    data: { userid: USERID, activeShipNo: 1, disconnectReason: reason },
  } as unknown as GameSocket;
}

describe('disconnect telemetry wiring', () => {
  it('records the drop with the state the kill decision was made from', async () => {
    const { svc, host, telemetry } = make(liveShip({ cantexit: 0, speed: 4 }));
    await svc.onDisconnect(host, socket('transport close'));

    expect(telemetry.recordDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        userid: USERID, shipno: 1, username: 'rick',
        reason: 'transport close', cantexit: 0, killed: false,
        xcoord: 12.5, ycoord: -3.25, speed: 4,
      }),
    );
  });

  it('marks killed when the anti-rage-quit actually fired', async () => {
    // cantexit > 0 AND a client-side reason. This is the row that answers
    // "how many of our kills were really just bad wifi?"
    const { svc, host, telemetry } = make(liveShip({ cantexit: 7 }));
    await svc.onDisconnect(host, socket('ping timeout'));

    expect(telemetry.recordDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({ cantexit: 7, killed: true }),
    );
  });

  it('does not mark killed when the server caused the disconnect', async () => {
    // A deploy restart hits every player at once, combat-locked or not. Those
    // rows must not read as rage-quit kills or every deploy looks like a massacre.
    const { svc, host, telemetry } = make(liveShip({ cantexit: 7 }));
    await svc.onDisconnect(host, socket('server namespace disconnect'));

    expect(telemetry.recordDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({ cantexit: 7, killed: false }),
    );
  });

  it('records nothing when the socket had no ship aboard', async () => {
    // Someone reading the landing page is not a disconnect worth studying.
    const { svc, host, telemetry } = make(undefined);
    await svc.onDisconnect(host, socket('transport close'));
    expect(telemetry.recordDisconnect).not.toHaveBeenCalled();
  });
});

describe('closing the gap on return', () => {
  it('closes the open row as soon as the player is authenticated', async () => {
    // Deliberately on AUTH, not on boarding a ship. A player who reconnects and
    // sits at the ship-select prompt has still come back, and measuring the gap
    // only for players who reboard would bias every percentile downward.
    const { svc, host, telemetry } = make(undefined, true);
    const client = {
      id: 'sock2',
      data: {},
      on: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as GameSocket;

    await svc.onConnect(host, client);

    expect(telemetry.recordReturn).toHaveBeenCalledWith(USERID);
  });
});
