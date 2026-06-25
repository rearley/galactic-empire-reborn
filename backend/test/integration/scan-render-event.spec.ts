/**
 * Integration test for GameGateway.emitCommandResult scan:render event routing.
 *
 * Tests the event routing contract defined in:
 *   specs/015-scan-modes/contracts/scan-render.md §1 ("Event routing canonical")
 *
 * Verifies:
 *   - Success path: both `command:result` (header only) and `scan:render` (full payload) are emitted
 *   - `command:result` on success carries exactly one `info`-category line with the header text
 *   - `scan:render` on success carries the full cells array and all payload fields
 *   - Failure path: only `command:result` is emitted (no `scan:render`)
 *   - Neither event is broadcast to a room (no `server.to().emit()` calls)
 *   - `mode` on the `scan:render` payload reflects what was in the CommandResult
 *
 * @see specs/015-scan-modes/contracts/scan-render.md §1
 * @see specs/015-scan-modes/tasks.md T009 T010
 */

import { GameGateway } from '../../src/gateway/game.gateway';
import { CommandResult, ScanRenderEvent, ScanCell } from '../../src/game/commands/command.types';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../fixtures/mock-random';
import { Socket } from 'socket.io';

/** Minimal mock socket that records emitted events. */
interface EmittedCall {
  event: string;
  payload: unknown;
}

function makeMockSocket(): { socket: Socket; calls: EmittedCall[] } {
  const calls: EmittedCall[] = [];
  const socket = {
    emit: jest.fn((event: string, payload: unknown) => {
      calls.push({ event, payload });
    }),
    id: 'test-socket-id',
    data: {},
  } as unknown as Socket;
  return { socket, calls };
}

/** Build a minimal GameGateway with all dependencies mocked out. */
function makeGateway(): GameGateway {
  const shipStateService = {} as unknown as ShipStateService;
  const commandRouter = {} as unknown as CommandRouterService;
  const registry = {} as unknown as ConnectedShipsRegistry;
  const wsAuthGuard = {} as unknown as WsAuthGuard;
  const prisma = {} as unknown as PrismaService;
  const onboardingService = {} as unknown as OnboardingService;
  const scanHandler = { clearScantab: jest.fn() } as unknown as ScanHandlerService;

  return new GameGateway(
    shipStateService,
    commandRouter,
    registry,
    wsAuthGuard,
    prisma,
    onboardingService,
    scanHandler,
    mockRandom,
    { emit: jest.fn(), on: jest.fn() } as never,
  );
}

/** Minimal ScanCell for test payloads. */
function makeCells(): ScanCell[] {
  return [
    { x: 5, y: 3, type: 'ship', char: 'A', colour: 'human' },
    { x: 12, y: 7, type: 'planet', char: '1', colour: 'planet' },
  ];
}

describe('GameGateway.emitCommandResult — scan:render event routing', () => {
  let gateway: GameGateway;

  beforeEach(() => {
    gateway = makeGateway();
  });

  // ── Success path ────────────────────────────────────────────────────────────

  describe('success path (scanRender present)', () => {
    const scanRender: ScanRenderEvent = {
      kind: 'ra',
      mode: 'overwrite',
      cells: makeCells(),
      header: 'Range: 4500 — Sector 12,7',
    };

    const commandResult: CommandResult = {
      lines: [{ text: 'Range: 4500 — Sector 12,7', category: 'info' }],
      scanRender,
    };

    it('emits both command:result and scan:render events', () => {
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, commandResult);

      const events = calls.map((c) => c.event);
      expect(events).toContain('command:result');
      expect(events).toContain('scan:render');
    });

    it('emits exactly 2 events — no extras', () => {
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, commandResult);

      expect(calls).toHaveLength(2);
    });

    it('command:result carries exactly one info-category line with the header text', () => {
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, commandResult);

      const resultCall = calls.find((c) => c.event === 'command:result');
      expect(resultCall).toBeDefined();
      const payload = resultCall!.payload as { lines: Array<{ text: string; category: string }> };
      expect(payload.lines).toHaveLength(1);
      expect(payload.lines[0].text).toBe('Range: 4500 — Sector 12,7');
      expect(payload.lines[0].category).toBe('info');
    });

    it('command:result does NOT contain the cells array', () => {
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, commandResult);

      const resultCall = calls.find((c) => c.event === 'command:result');
      const payload = resultCall!.payload as Record<string, unknown>;
      // Should not have a cells property or scanRender property
      expect(payload).not.toHaveProperty('cells');
      expect(payload).not.toHaveProperty('scanRender');
    });

    it('scan:render carries the full cells array', () => {
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, commandResult);

      const renderCall = calls.find((c) => c.event === 'scan:render');
      expect(renderCall).toBeDefined();
      const payload = renderCall!.payload as ScanRenderEvent;
      expect(payload.cells).toEqual(makeCells());
    });

    it('scan:render carries the header string', () => {
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, commandResult);

      const renderCall = calls.find((c) => c.event === 'scan:render');
      const payload = renderCall!.payload as ScanRenderEvent;
      expect(payload.header).toBe('Range: 4500 — Sector 12,7');
    });

    it('scan:render carries the kind field', () => {
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, commandResult);

      const renderCall = calls.find((c) => c.event === 'scan:render');
      const payload = renderCall!.payload as ScanRenderEvent;
      expect(payload.kind).toBe('ra');
    });

    it('two events carry strictly disjoint content (no shared property names)', () => {
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, commandResult);

      const resultPayload = calls.find((c) => c.event === 'command:result')!.payload as Record<string, unknown>;
      const renderPayload = calls.find((c) => c.event === 'scan:render')!.payload as Record<string, unknown>;

      const resultKeys = new Set(Object.keys(resultPayload));
      const renderKeys = new Set(Object.keys(renderPayload));
      const intersection = [...resultKeys].filter((k) => renderKeys.has(k));
      expect(intersection).toHaveLength(0);
    });
  });

  // ── mode reflects ShipState.scanHome ────────────────────────────────────────

  describe('mode field reflects scanHome preference', () => {
    it('mode = overwrite when scanHome = true', () => {
      const scanRender: ScanRenderEvent = {
        kind: 'se',
        mode: 'overwrite',
        cells: [],
        header: 'Sector 5,5',
      };
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, { lines: [], scanRender });

      const renderCall = calls.find((c) => c.event === 'scan:render');
      const payload = renderCall!.payload as ScanRenderEvent;
      expect(payload.mode).toBe('overwrite');
    });

    it('mode = append when scanHome = false', () => {
      const scanRender: ScanRenderEvent = {
        kind: 'lo',
        mode: 'append',
        cells: [],
        header: 'Range: 300 — Sector 5,5',
      };
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, { lines: [], scanRender });

      const renderCall = calls.find((c) => c.event === 'scan:render');
      const payload = renderCall!.payload as ScanRenderEvent;
      expect(payload.mode).toBe('append');
    });
  });

  // ── Failure path ─────────────────────────────────────────────────────────────

  describe('failure path (scanRender absent)', () => {
    const failureResult: CommandResult = {
      lines: [{ text: 'You are not in flight.', category: 'system' }],
    };

    it('emits only command:result — no scan:render', () => {
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, failureResult);

      const events = calls.map((c) => c.event);
      expect(events).toContain('command:result');
      expect(events).not.toContain('scan:render');
    });

    it('emits exactly one event', () => {
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, failureResult);

      expect(calls).toHaveLength(1);
    });

    it('command:result payload preserves all handler lines', () => {
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, failureResult);

      const resultCall = calls.find((c) => c.event === 'command:result');
      const payload = resultCall!.payload as { lines: Array<{ text: string; category: string }> };
      expect(payload.lines).toEqual(failureResult.lines);
    });

    it('command:result on failure uses system category', () => {
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, failureResult);

      const resultCall = calls.find((c) => c.event === 'command:result');
      const payload = resultCall!.payload as { lines: Array<{ text: string; category: string }> };
      expect(payload.lines[0].category).toBe('system');
    });
  });

  // ── No broadcast to rooms ────────────────────────────────────────────────────

  describe('no room broadcasts', () => {
    it('emitCommandResult never calls server.to().emit() for scan events', () => {
      // Attach a mock server that spies on `to` — it must NOT be called.
      const toMock = jest.fn().mockReturnValue({ emit: jest.fn() });
      (gateway as unknown as { server: { to: jest.Mock } }).server = { to: toMock };

      const scanRender: ScanRenderEvent = {
        kind: 'lo-full',
        mode: 'overwrite',
        cells: makeCells(),
        header: 'Range: 300 — Sector 8,4',
      };
      const { socket } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, { lines: [], scanRender });

      expect(toMock).not.toHaveBeenCalled();
    });

    it('failure path also never calls server.to().emit()', () => {
      const toMock = jest.fn().mockReturnValue({ emit: jest.fn() });
      (gateway as unknown as { server: { to: jest.Mock } }).server = { to: toMock };

      const { socket } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, {
          lines: [{ text: 'Cannot scan while docked.', category: 'system' }],
        });

      expect(toMock).not.toHaveBeenCalled();
    });
  });

  // ── sidePanel passthrough ────────────────────────────────────────────────────

  describe('sidePanel passthrough', () => {
    it('scan:render includes sidePanel when present in scanRender', () => {
      const scanRender: ScanRenderEvent = {
        kind: 'lo-full',
        mode: 'overwrite',
        cells: makeCells(),
        header: 'Range: 300 — Sector 8,4',
        sidePanel: [
          { letter: 'A', distance: 150, bearing: 45, heading: 180, speedDisplay: 'Warp 4.5', name: 'Ship Alpha' },
        ],
      };
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, { lines: [], scanRender });

      const renderCall = calls.find((c) => c.event === 'scan:render');
      const payload = renderCall!.payload as ScanRenderEvent;
      expect(payload.sidePanel).toHaveLength(1);
      expect(payload.sidePanel![0].letter).toBe('A');
    });

    it('scan:render sidePanel is absent when not set in scanRender', () => {
      const scanRender: ScanRenderEvent = {
        kind: 'ra',
        mode: 'append',
        cells: [],
        header: 'Range: 2000 — Sector 3,9',
        // no sidePanel
      };
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, { lines: [], scanRender });

      const renderCall = calls.find((c) => c.event === 'scan:render');
      const payload = renderCall!.payload as ScanRenderEvent;
      expect(payload.sidePanel).toBeUndefined();
    });
  });
});
