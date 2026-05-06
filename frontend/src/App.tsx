import { useState, useEffect } from 'react';
import { useSocket } from './socket/useSocket';
import { usePlayerList } from './state/usePlayerList';
import { EventLog } from './components/EventLog';
import { ScanMap } from './components/ScanMap';
import { CommandInput } from './components/CommandInput';
import { ConnectionIndicator } from './components/ConnectionIndicator';
import { ConnectionBanner } from './components/ConnectionBanner';
import { PlayerListPanel } from './components/PlayerListPanel';
import type { EventLogLine, ScanCell } from './types/contracts';

const MAX_LOG_ENTRIES = 500;

/**
 * Root application component — five-region terminal UI (FR-002):
 *   top: connection-status banner area
 *   main-left: scrolling event log
 *   main-right: ASCII sector-map panel
 *   side: player-list panel (populated by feature 010 US3)
 *   bottom: command input bar (fixed)
 *
 * @see specs/010-react-frontend/spec.md FR-002
 */
export function App(): React.JSX.Element {
  const { players, dispatch: playerDispatch } = usePlayerList();
  const { status, lastResult, send, localShipId } = useSocket(playerDispatch);
  const [logLines, setLogLines] = useState<EventLogLine[]>([]);
  const [scanCells, setScanCells] = useState<ScanCell[] | null>(null);

  useEffect(() => {
    if (lastResult) {
      if (lastResult.lines.length > 0) {
        setLogLines((prev) =>
          [...prev, ...lastResult.lines].slice(-MAX_LOG_ENTRIES),
        );
      }
      if (lastResult.scanGrid !== undefined) {
        setScanCells(lastResult.scanGrid);
      }
    }
  }, [lastResult]);

  return (
    <div className="flex h-screen flex-col bg-black text-gray-100 font-mono">
      {/* Top: connection status banner (FR-019) — hidden when connected */}
      <ConnectionBanner status={status} />

      {/* Top bar: title + connection indicator (FR-002, FR-022) */}
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-1">
        <span className="text-xs text-gray-500 uppercase tracking-widest">Galactic Empire</span>
        <ConnectionIndicator status={status} />
      </div>

      {/* Main area: log (left), map (right), player-list side-panel slot (FR-002) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main-left: scrolling event-log pane */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-gray-800">
          <EventLog lines={logLines} />
        </div>

        {/* Main-right: ASCII sector-map panel */}
        <div className="w-80 flex-shrink-0 border-r border-gray-800">
          <ScanMap cells={scanCells} shipId={localShipId} />
        </div>

        {/* Side: player-list panel (FR-002, FR-016..FR-018) */}
        <div className="w-48 flex-shrink-0">
          <PlayerListPanel players={players} />
        </div>
      </div>

      {/* Bottom: command input bar fixed at bottom (FR-002) */}
      <CommandInput onSubmit={send} />
    </div>
  );
}
