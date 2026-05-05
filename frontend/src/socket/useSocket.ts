import { useEffect, useState, useCallback } from 'react';
import { socket, sendCommand, onCommandResult, LOCAL_USERID } from './socketClient';
import type {
  CommandResultPayload,
  PlayerSnapshotPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PhysicsSectorTransitionPayload,
} from '../types/contracts';
import type { UsePlayerListReturn } from '../state/usePlayerList';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface UseSocketReturn {
  status: ConnectionStatus;
  lastResult: CommandResultPayload | null;
  send: (input: string) => void;
  /** Local ship's canonical shipId (set from player.snapshot in US3; null until then) */
  localShipId: string | null;
}

/**
 * Bridges the socket singleton to React component state.
 * Derives connection status from socket.io lifecycle events.
 * When `playerDispatch` is provided, subscribes to player list events and
 * dispatches corresponding usePlayerList actions (FR-017, FR-017a).
 *
 * @see specs/003-ship-commands/contracts/websocket-events.md §Connection
 * @see specs/010-react-frontend/contracts/websocket-events.md §player.snapshot
 */
export function useSocket(
  playerDispatch?: UsePlayerListReturn['dispatch'],
): UseSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>(
    socket.connected ? 'connected' : 'connecting',
  );
  const [lastResult, setLastResult] = useState<CommandResultPayload | null>(null);
  const [localShipId, setLocalShipId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!playerDispatch) return;

    const handleSnapshot = (payload: PlayerSnapshotPayload) => {
      playerDispatch({ type: 'SNAPSHOT', payload });
      const local = payload.players.find((p) =>
        p.shipId.startsWith(LOCAL_USERID + ':'),
      );
      if (local) setLocalShipId(local.shipId);
    };

    const handleJoined = (payload: PlayerJoinedPayload) => {
      playerDispatch({ type: 'JOIN', payload });
    };

    const handleLeft = (payload: PlayerLeftPayload) => {
      playerDispatch({ type: 'LEFT', payload });
    };

    const handleTransition = (payload: PhysicsSectorTransitionPayload) => {
      playerDispatch({ type: 'TRANSITION', payload });
    };

    socket.on('player.snapshot', handleSnapshot);
    socket.on('player.joined', handleJoined);
    socket.on('player.left', handleLeft);
    socket.on('physics.sector-transition', handleTransition);

    return () => {
      socket.off('player.snapshot', handleSnapshot);
      socket.off('player.joined', handleJoined);
      socket.off('player.left', handleLeft);
      socket.off('physics.sector-transition', handleTransition);
    };
  }, [playerDispatch]);

  const send = useCallback((input: string) => sendCommand(input), []);

  return { status, lastResult, send, localShipId };
}
