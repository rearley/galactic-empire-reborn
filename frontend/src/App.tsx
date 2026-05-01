import { useState, useEffect } from 'react';
import { useSocket } from './socket/useSocket';
import { EventLog } from './components/EventLog';
import { ScanMap } from './components/ScanMap';
import { CommandInput } from './components/CommandInput';
import { ConnectionIndicator } from './components/ConnectionIndicator';
import type { EventLogLine, ScanCell } from './types/contracts';

/**
 * Root application component — 3-region terminal UI.
 * Event log (left), scan map (right), command input (pinned bottom).
 *
 * @see specs/003-ship-commands/spec.md US4 acceptance scenarios
 */
export function App(): React.JSX.Element {
  const { status, lastResult, send } = useSocket();
  const [logLines, setLogLines] = useState<EventLogLine[]>([]);
  const [scanCells, setScanCells] = useState<ScanCell[] | null>(null);

  useEffect(() => {
    if (lastResult) {
      if (lastResult.lines.length > 0) {
        setLogLines((prev) => [...prev, ...lastResult.lines]);
      }
      if (lastResult.scanGrid !== undefined) {
        setScanCells(lastResult.scanGrid);
      }
    }
  }, [lastResult]);

  return (
    <div className="flex h-screen flex-col bg-black text-gray-100 font-mono">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-1">
        <span className="text-xs text-gray-500 uppercase tracking-widest">Galactic Empire</span>
        <ConnectionIndicator status={status} />
      </div>

      {/* Main area: log + map */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden border-r border-gray-800">
          <EventLog lines={logLines} />
        </div>
        <div className="w-80 flex-shrink-0">
          <ScanMap cells={scanCells} />
        </div>
      </div>

      {/* Command input pinned at bottom */}
      <CommandInput onSubmit={send} />
    </div>
  );
}
