import type { ConnectionStatus } from '../socket/useSocket';

interface ConnectionBannerProps {
  status: ConnectionStatus;
  /** Invoked when a displaced player asks to take their seat back. */
  onReconnect?: () => void;
}

const BANNER_COPY: Record<Exclude<ConnectionStatus, 'connected'>, string> = {
  connecting: 'Connecting to server…',
  disconnected: 'Disconnected — check your connection',
  reconnecting: 'Reconnecting…',
  // Not a network fault: the server handed the seat to a newer login
  // (SESSION_REPLACED, game.gateway.ts:374) and this client deliberately
  // stopped reconnecting so the two sessions do not fight. Saying "check your
  // connection" sent the player off to diagnose a network that was fine.
  displaced: 'Another session opened with your credentials — this window is idle.',
};

const BANNER_CLASS: Record<Exclude<ConnectionStatus, 'connected'>, string> = {
  connecting: 'bg-yellow-900 text-yellow-200',
  disconnected: 'bg-red-900 text-red-200',
  reconnecting: 'bg-orange-900 text-orange-200',
  displaced: 'bg-blue-900 text-blue-200',
};

/**
 * Renders a top-of-screen status banner when the connection is not established.
 * Renders nothing when status is 'connected' (FR-019).
 *
 * @see specs/010-react-frontend/data-model.md §B.5
 */
export function ConnectionBanner({ status, onReconnect }: ConnectionBannerProps) {
  if (status === 'connected') return null;

  return (
    <div
      role="status"
      className={`w-full px-4 py-1 text-center text-xs font-mono ${BANNER_CLASS[status]}`}
    >
      {BANNER_COPY[status]}
      {status === 'displaced' && (
        <button
          type="button"
          onClick={onReconnect}
          className="ml-3 underline hover:no-underline"
        >
          Reconnect here
        </button>
      )}
    </div>
  );
}
