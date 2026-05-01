import { io, Socket } from 'socket.io-client';
import type { CommandRequest, CommandResultPayload } from '../types/contracts';

/**
 * Singleton Socket.io client.
 * Connects with a hard-coded development userid (FR-029).
 * Auto-reconnects with exponential backoff capped at 5s (research.md Decision 6).
 *
 * @see specs/003-ship-commands/contracts/websocket-events.md §Connection
 */
const socket: Socket = io({
  query: { userid: 'DEV' },
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
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
