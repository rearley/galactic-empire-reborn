import { useEffect, useState, useCallback } from 'react';
import { socket, sendCommand, onCommandResult, connectSocket } from './socketClient';
import type {
  CommandResultPayload,
  PlayerSnapshotPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PhysicsSectorTransitionPayload,
  ShipRenamedPayload,
} from '../types/contracts';
import type { UsePlayerListReturn } from '../state/usePlayerList';

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  /**
   * The server gave the seat to a newer login (SESSION_REPLACED) and this
   * client stopped reconnecting on purpose. Distinct from `disconnected`
   * because the network is fine and the player can take the seat back.
   */
  | 'displaced';

export interface OnboardingPrompt {
  /**
   * `ship-select` is the fleet menu a captain with more than one hull gets on
   * connect. The gateway boards nothing until it receives the reply, so without
   * a listener the session sits with no active ship.
   */
  type: 'ship-name' | 'ship-select';
  payload: Record<string, unknown>;
}

export interface UseSocketReturn {
  status: ConnectionStatus;
  lastResult: CommandResultPayload | null;
  send: (input: string) => void;
  /** Re-open the socket after this session was displaced by a newer login. */
  reconnect: () => void;
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
    const handleDisconnect = () => setStatus((prev) => (prev === 'displaced' ? prev : 'disconnected'));
    // The server explains itself; don't overwrite that with a network story.
    const handleServerErr = (err: { code?: string }) => {
      if (err?.code === 'SESSION_REPLACED') setStatus('displaced');
    };
    socket.on('error', handleServerErr);
    const handleReconnectAttempt = () => setStatus('reconnecting');
    const handleConnectError = () => setStatus('disconnected');

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('reconnect_attempt', handleReconnectAttempt);
    socket.on('connect_error', handleConnectError);

    const unsubResult = onCommandResult((payload) => setLastResult(payload));

    const handleShipName = (payload: Record<string, unknown>) => {
      setOnboardingPrompt({ type: 'ship-name', payload });
    };

    const handleShipSelect = (payload: Record<string, unknown>) => {
      setOnboardingPrompt({ type: 'ship-select', payload });
    };

    socket.on('prompt:ship-name', handleShipName);
    socket.on('prompt:ship-select', handleShipSelect);

    return () => {
      socket.off('error', handleServerErr);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('reconnect_attempt', handleReconnectAttempt);
      socket.off('connect_error', handleConnectError);
      socket.off('prompt:ship-name', handleShipName);
      socket.off('prompt:ship-select', handleShipSelect);
      unsubResult();
    };
  }, []);

  useEffect(() => {
    if (!playerDispatch) return;

    const handleSnapshot = (payload: PlayerSnapshotPayload) => {
      playerDispatch({ type: 'SNAPSHOT', payload });
      // Onboarding complete — clear prompt
      setOnboardingPrompt(null);
      if (payload.selfShipId) setLocalShipId(payload.selfShipId);
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

  /** Take the seat back after being displaced. */
  const reconnect = () => {
    setStatus('connecting');
    connectSocket();
  };

  return { status, lastResult, send, reconnect, localShipId, onboardingPrompt, emitPromptReply };
}
