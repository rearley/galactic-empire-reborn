import { useEffect, useState, useCallback } from 'react';
import { socket, sendCommand, onCommandResult } from './socketClient';
import type { CommandResultPayload } from '../types/contracts';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface UseSocketReturn {
  status: ConnectionStatus;
  lastResult: CommandResultPayload | null;
  send: (input: string) => void;
}

/**
 * Bridges the socket singleton to React component state.
 * Derives connection status from socket.io lifecycle events.
 *
 * @see specs/003-ship-commands/contracts/websocket-events.md §Connection
 */
export function useSocket(): UseSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>(
    socket.connected ? 'connected' : 'connecting',
  );
  const [lastResult, setLastResult] = useState<CommandResultPayload | null>(null);

  useEffect(() => {
    const handleConnect = () => setStatus('connected');
    const handleDisconnect = () => setStatus('disconnected');
    const handleReconnectAttempt = () => setStatus('reconnecting');
    const handleConnectError = () => setStatus('disconnected');

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('reconnect_attempt', handleReconnectAttempt);
    socket.on('connect_error', handleConnectError);

    const unsubResult = onCommandResult((payload) => setLastResult(payload));

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('reconnect_attempt', handleReconnectAttempt);
      socket.off('connect_error', handleConnectError);
      unsubResult();
    };
  }, []);

  const send = useCallback((input: string) => sendCommand(input), []);

  return { status, lastResult, send };
}
