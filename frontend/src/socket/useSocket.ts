import { useEffect, useState, useCallback } from 'react';
import { socket, sendCommand, onCommandResult } from './socketClient';
import type {
  CommandResultPayload,
  PlayerSnapshotPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PhysicsSectorTransitionPayload,
  ShipRenamedPayload,
} from '../types/contracts';
import type { UsePlayerListReturn } from '../state/usePlayerList';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface OnboardingPrompt {
  type: 'class-list' | 'ship-name';
  payload: Record<string, unknown>;
}

export interface UseSocketReturn {
  status: ConnectionStatus;
  lastResult: CommandResultPayload | null;
  send: (input: string) => void;
  /** Local ship's canonical shipId (set from player.snapshot; null until then) */
  localShipId: string | null;
  /** Active onboarding prompt from server, or null when in normal play */
  onboardingPrompt: OnboardingPrompt | null;
  emitPromptReply: (value: number | string) => void;
}

/**
 * Bridges the socket singleton to React component state.
 * Derives connection status from socket.io lifecycle events.
 * When `playerDispatch` is provided, subscribes to player list events and
 * dispatches corresponding usePlayerList actions (FR-017, FR-017a).
 *
 * @see specs/011-onboarding/contracts/websocket-events.md §Connection
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
  const [onboardingPrompt, setOnboardingPrompt] = useState<OnboardingPrompt | null>(null);

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

    const handleClassList = (payload: Record<string, unknown>) => {
      setOnboardingPrompt({ type: 'class-list', payload });
    };
    const handleShipName = (payload: Record<string, unknown>) => {
      setOnboardingPrompt({ type: 'ship-name', payload });
    };

    socket.on('prompt:class-list', handleClassList);
    socket.on('prompt:ship-name', handleShipName);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('reconnect_attempt', handleReconnectAttempt);
      socket.off('connect_error', handleConnectError);
      socket.off('prompt:class-list', handleClassList);
      socket.off('prompt:ship-name', handleShipName);
      unsubResult();
    };
  }, []);

  useEffect(() => {
    if (!playerDispatch) return;

    const handleSnapshot = (payload: PlayerSnapshotPayload) => {
      playerDispatch({ type: 'SNAPSHOT', payload });
      // Onboarding complete — clear prompt
      setOnboardingPrompt(null);
      const local = payload.players.find((p) => p.shipId != null);
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

    const handleRenamed = (payload: ShipRenamedPayload) => {
      playerDispatch({ type: 'RENAMED', payload });
    };

    socket.on('player.snapshot', handleSnapshot);
    socket.on('player.joined', handleJoined);
    socket.on('player.left', handleLeft);
    socket.on('physics.sector-transition', handleTransition);
    socket.on('ship.renamed', handleRenamed);

    return () => {
      socket.off('player.snapshot', handleSnapshot);
      socket.off('player.joined', handleJoined);
      socket.off('player.left', handleLeft);
      socket.off('physics.sector-transition', handleTransition);
      socket.off('ship.renamed', handleRenamed);
    };
  }, [playerDispatch]);

  const send = useCallback((input: string) => sendCommand(input), []);

  const emitPromptReply = useCallback((value: number | string) => {
    socket.emit('prompt:reply', { value });
  }, []);

  return { status, lastResult, send, localShipId, onboardingPrompt, emitPromptReply };
}
