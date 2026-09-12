import { useEffect, useState, useCallback } from 'react';
import { socket, sendCommand, onCommandResult, connectSocket } from './socketClient';
import { useCommandResultQueue } from './useCommandResultQueue';
import type {
  CommandResultPayload,
  PlayerSnapshotPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PhysicsSectorTransitionPayload,
  PlayerSectorPayload,
  ShipRenamedPayload,
  PromptShipNamePayload,
  PromptShipSelectPayload,
} from '@ge/wire';
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

/**
 * `ship-select` is the fleet menu a captain with more than one hull gets on
 * connect. The gateway boards nothing until it receives the reply, so without
 * a listener the session sits with no active ship.
 *
 * A discriminated union on `type` rather than a loose `Record<string, unknown>`
 * payload: typing the socket with the `@ge/wire` generics (see `socketClient.ts`)
 * means a handler receiving `PromptShipNamePayload`/`PromptShipSelectPayload`
 * can no longer be smuggled into a `Record<string, unknown>` field — TypeScript
 * correctly refuses that assignment (no index signature). The two payload
 * Both payloads carry an optional `error`: `prompt:ship-name` for a rejected
 * name, and `prompt:ship-select` for a refused selection — a number outside the
 * list, or a hull destroyed between the prompt and the reply. The select form
 * used to send nothing, so the client's banner could never fill. @see issue #6
 */
export type OnboardingPrompt =
  | { type: 'ship-name'; payload: PromptShipNamePayload }
  | { type: 'ship-select'; payload: PromptShipSelectPayload };

export interface UseSocketReturn {
  status: ConnectionStatus;
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
  /**
   * Called for EVERY command result, synchronously from the socket callback.
   *
   * Results used to be parked in a single `lastResult` state slot with App
   * reacting to it. React 18 batches state updates, so two payloads arriving
   * in the same batch collapsed and the first was never rendered — a one-slot
   * mailbox used as a queue. Reported from play as messages going missing
   * during a fight, which is exactly when command traffic is densest.
   * @see socket/useCommandResultQueue.ts, test/message-loss.spec.tsx
   */
  onResult?: (payload: CommandResultPayload) => void,
): UseSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>(
    socket.connected ? 'connected' : 'connecting',
  );
  const resultSink = useCommandResultQueue<CommandResultPayload>(onResult ?? (() => {}));
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
    // `reconnect_attempt` is a MANAGER event (socket.io-client's `Manager`,
    // exposed as `socket.io`), not a Socket event — it is not even a member of
    // `SocketReservedEvents`. Registering it on `socket` itself compiled only
    // because the untyped `Socket` used `DefaultEventsMap`'s permissive index
    // signature; typing the socket with the wire generics turned this into a
    // build error, which is how it surfaced. The handler never fired: this
    // status transition to 'reconnecting' was dead since it was written.
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.on('connect_error', handleConnectError);

    const unsubResult = onCommandResult((payload) => resultSink.push(payload));

    const handleShipName = (payload: PromptShipNamePayload) => {
      setOnboardingPrompt({ type: 'ship-name', payload });
    };

    const handleShipSelect = (payload: PromptShipSelectPayload) => {
      setOnboardingPrompt({ type: 'ship-select', payload });
    };

    socket.on('prompt:ship-name', handleShipName);
    socket.on('prompt:ship-select', handleShipSelect);

    return () => {
      socket.off('error', handleServerErr);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.off('connect_error', handleConnectError);
      socket.off('prompt:ship-name', handleShipName);
      socket.off('prompt:ship-select', handleShipSelect);
      unsubResult();
    };
  }, [resultSink]);

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

    // Positions are scoped server-side; this is how one becomes visible or
    // goes dark. @see backend/src/gateway/player-visibility.ts
    const handleSector = (payload: PlayerSectorPayload) => {
      playerDispatch({ type: 'SECTOR', payload });
    };

    const handleRenamed = (payload: ShipRenamedPayload) => {
      playerDispatch({ type: 'RENAMED', payload });
    };

    socket.on('player.snapshot', handleSnapshot);
    socket.on('player.joined', handleJoined);
    socket.on('player.left', handleLeft);
    socket.on('physics.sector-transition', handleTransition);
    socket.on('player.sector', handleSector);
    socket.on('ship.renamed', handleRenamed);

    return () => {
      socket.off('player.snapshot', handleSnapshot);
      socket.off('player.joined', handleJoined);
      socket.off('player.left', handleLeft);
      socket.off('physics.sector-transition', handleTransition);
      socket.off('player.sector', handleSector);
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

  return { status, send, reconnect, localShipId, onboardingPrompt, emitPromptReply };
}
