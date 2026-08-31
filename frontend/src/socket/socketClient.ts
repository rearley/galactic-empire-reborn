import { io, Socket } from 'socket.io-client';
import { getToken, clearToken } from '../auth/tokenStore';
import type { CommandRequest, CommandResultPayload } from '../types/contracts';

/**
 * Singleton Socket.io client.
 * Authenticates via JWT sent in socket.handshake.auth.token (FR-029).
 * Does not connect until a token is present — call connect() after auth.
 * Auto-reconnects with exponential backoff: initial delay 1s, max 30s with
 * 50% jitter so thundering-herd bursts are spread across ±15s (FR-020).
 *
 * @see specs/011-onboarding/contracts/websocket-events.md §Connection
 * @see specs/010-react-frontend/research.md R3 (reconnection tuning FR-020)
 */
const socket: Socket = io({
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
  randomizationFactor: 0.5,
  transports: ['websocket'],
  auth: (cb) => cb({ token: getToken() }),
});

/** Connect using the current token in tokenStore. */
export function connectSocket(): void {
  socket.connect();
}

/** Sends a text command to the server. */
export function sendCommand(input: string): void {
  const payload: CommandRequest = { input };
  socket.emit('command', payload);
}

/** Registers a listener for command results. Returns an unsubscribe function. */
export function onCommandResult(
  listener: (payload: CommandResultPayload) => void,
): () => void {
  socket.on('command:result', listener);
  return () => socket.off('command:result', listener);
}

/** Registers a listener for server errors. Returns an unsubscribe function. */
export function onError(
  listener: (err: { code: string; message?: string }) => void,
): () => void {
  socket.on('error', listener);
  return () => socket.off('error', listener);
}

type AuthFailedCallback = () => void;
let onAuthFailed: AuthFailedCallback | null = null;

/** Register a callback invoked when the server rejects the token (expired/invalid). */
export function onSocketAuthFailed(cb: AuthFailedCallback): void {
  onAuthFailed = cb;
}

/**
 * Routes server-side `error` events.
 *
 * `AUTH_REQUIRED` means the credential itself is bad — drop it and send the
 * player back to the login screen.
 *
 * `SESSION_REPLACED` means a newer socket took the seat (latest-wins); the
 * credential is still perfectly good, so the token stays. It used to be treated
 * as an auth failure, and because the token lives in localStorage — shared
 * across the whole tab — any moment where two sockets overlapped (a backend hot
 * reload, a reconnect racing a fresh page) wiped it and dumped the player at the
 * login screen mid-game, seemingly caused by whatever they had just typed. We
 * only stop reconnecting, so this session stops fighting the one that won.
 *
 * Exported for tests; also wired to the socket below.
 */
export function handleServerError(err: { code?: string; message?: string }): void {
  if (err.code === 'AUTH_REQUIRED') {
    clearToken();
    socket.disconnect();
    onAuthFailed?.();
    return;
  }
  if (err.code === 'SESSION_REPLACED') {
    socket.disconnect();
  }
}

socket.on('error', handleServerError);

// Server kicked us because the User row no longer exists (e.g. DB was reset).
// Clear the stale token so the client lands on the register screen.
socket.on('auth:logout', () => {
  clearToken();
  socket.disconnect();
  onAuthFailed?.();
});

export { socket };
