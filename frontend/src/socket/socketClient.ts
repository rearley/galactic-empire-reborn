import { io, Socket } from 'socket.io-client';
import type { CommandRequest, CommandResultPayload } from '../types/contracts';

/**
 * Singleton Socket.io client.
 * Connects with a hard-coded development userid (FR-029).
 * Auto-reconnects with exponential backoff: initial delay 1s, max 30s with
 * 50% jitter so thundering-herd bursts are spread across ±15s (FR-020).
 *
 * @see specs/003-ship-commands/contracts/websocket-events.md §Connection
 * @see specs/010-react-frontend/research.md R3 (reconnection tuning FR-020)
 */
export const LOCAL_USERID = 'DEV';

const socket: Socket = io({
  query: { userid: LOCAL_USERID },
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
  randomizationFactor: 0.5,
  transports: ['websocket'],
});

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
  listener: (err: { code: string; message: string }) => void,
): () => void {
  socket.on('error', listener);
  return () => socket.off('error', listener);
}

export { socket };
