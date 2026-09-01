import React from 'react';
import type { ConnectionStatus } from '../socket/useSocket';

const STATUS_CONFIG: Record<ConnectionStatus, { color: string; label: string }> = {
  connected: { color: 'bg-green-500', label: 'Connected' },
  connecting: { color: 'bg-yellow-500', label: 'Connecting…' },
  reconnecting: { color: 'bg-yellow-500', label: 'Reconnecting…' },
  disconnected: { color: 'bg-red-500', label: 'Disconnected' },
  // Seat handed to a newer login, not a network fault. @see useSocket.ts
  displaced: { color: 'bg-blue-500', label: 'Session moved' },
};

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
}

/**
 * Renders a coloured dot + label for the socket connection status.
 * @see specs/003-ship-commands/contracts/websocket-events.md §Connection
 */
export function ConnectionIndicator({ status }: ConnectionIndicatorProps): React.JSX.Element {
  const { color, label } = STATUS_CONFIG[status];
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} data-testid="status-dot" />
      <span data-testid="status-label">{label}</span>
    </div>
  );
}
