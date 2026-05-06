import { useState, useEffect } from 'react';
import { useSocket } from './socket/useSocket';
import { usePlayerList } from './state/usePlayerList';
import { EventLog } from './components/EventLog';
import { ScanMap } from './components/ScanMap';
import { CommandInput } from './components/CommandInput';
import { ConnectionIndicator } from './components/ConnectionIndicator';
import { ConnectionBanner } from './components/ConnectionBanner';
import { PlayerListPanel } from './components/PlayerListPanel';
import { AuthScreen } from './auth/AuthScreen';
import { ClassPickerPrompt } from './onboarding/ClassPickerPrompt';
import { ShipNamePrompt } from './onboarding/ShipNamePrompt';
import { getToken, setToken } from './auth/tokenStore';
import { connectSocket } from './socket/socketClient';
import type { EventLogLine, ScanCell } from './types/contracts';

const MAX_LOG_ENTRIES = 500;

/**
 * Root application component — five-region terminal UI (FR-002).
 * Gates on JWT token: renders AuthScreen when absent, terminal otherwise.
 * During onboarding (prompt:class-list / prompt:ship-name active), renders
 * the appropriate onboarding component instead of normal command input.
 *
 * @see specs/011-onboarding/contracts/websocket-events.md §Connection
 * @see specs/010-react-frontend/spec.md FR-002
 */
export function App(): React.JSX.Element {
  const [token, setTokenState] = useState<string | null>(getToken());

  function handleAuthenticated(newToken: string): void {
    setToken(newToken);
    setTokenState(newToken);
    connectSocket();
  }

  if (!token) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return <Terminal />;
}

function Terminal(): React.JSX.Element {
  const { players, dispatch: playerDispatch } = usePlayerList();
  const { status, lastResult, send, localShipId, onboardingPrompt, emitPromptReply } =
    useSocket(playerDispatch);
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

  const shipNameError =
    onboardingPrompt?.type === 'ship-name'
      ? ((onboardingPrompt.payload as { error?: string }).error ?? null)
      : null;

  const renderBottomInput = (): React.JSX.Element => {
    if (onboardingPrompt?.type === 'class-list') {
      const classes = (onboardingPrompt.payload as { classes: Parameters<typeof ClassPickerPrompt>[0]['classes'] }).classes;
      return (
        <ClassPickerPrompt
          classes={classes}
          onSelect={(classNumber) => emitPromptReply(classNumber)}
        />
      );
    }
    if (onboardingPrompt?.type === 'ship-name') {
      return (
        <ShipNamePrompt
          onSubmit={(name) => emitPromptReply(name)}
          error={shipNameError}
        />
      );
    }
    return <CommandInput onSubmit={send} />;
  };

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

      {/* Bottom: command input or onboarding prompt (FR-002) */}
      {renderBottomInput()}
    </div>
  );
}
