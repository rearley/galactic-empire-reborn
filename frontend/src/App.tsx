import { useState, useEffect } from 'react';
import { useSocket } from './socket/useSocket';
import { usePlayerList } from './state/usePlayerList';
import { EventLog } from './components/EventLog';
import { ScanMap } from './components/ScanMap';
import { CommandInput } from './components/CommandInput';
import { ConnectionIndicator } from './components/ConnectionIndicator';
import { ConnectionBanner } from './components/ConnectionBanner';
import { PlayerListPanel } from './components/PlayerListPanel';
import { ScanPanel } from './components/ScanPanel';
import { AuthScreen } from './auth/AuthScreen';
import { ShipNamePrompt } from './onboarding/ShipNamePrompt';
import { getToken, setToken } from './auth/tokenStore';
import { connectSocket, socket, onSocketAuthFailed } from './socket/socketClient';
import { handleCommandResult } from './socket/command-result-handlers';
import type { EventLogLine, ScanCell } from './types/contracts';
import type { ScanRenderEvent } from './hooks/useScanRender';

const MAX_LOG_ENTRIES = 500;

/**
 * Root application component — five-region terminal UI (FR-002).
 * Gates on JWT token: renders AuthScreen when absent, terminal otherwise.
 * During onboarding (prompt:ship-name active), renders ShipNamePrompt
 * instead of normal command input.
 *
 * @see specs/011-onboarding/contracts/websocket-events.md §Connection
 * @see specs/010-react-frontend/spec.md FR-002
 */
export function App(): React.JSX.Element {
  const [token, setTokenState] = useState<string | null>(getToken());

  useEffect(() => {
    onSocketAuthFailed(() => setTokenState(null));
    if (getToken()) connectSocket();
  }, []);

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
      handleCommandResult(
        lastResult,
        (lines) => setLogLines((prev) => [...prev, ...lines].slice(-MAX_LOG_ENTRIES)),
        () => setLogLines([]),
      );
    }
  }, [lastResult]);

  useEffect(() => {
    const handleScanRender = (event: ScanRenderEvent) => {
      setScanCells(event.cells as ScanCell[]);
    };
    socket.on('scan:render', handleScanRender);
    return () => { socket.off('scan:render', handleScanRender); };
  }, []);

  useEffect(() => {
    const handleEntered = (payload: { shipName: string }) => {
      setLogLines((prev) =>
        [...prev, { text: `${payload.shipName} has entered the sector.`, category: 'nav' as const }].slice(-MAX_LOG_ENTRIES),
      );
    };
    const handleLeft = (payload: { shipName: string }) => {
      setLogLines((prev) =>
        [...prev, { text: `${payload.shipName} has left the sector.`, category: 'nav' as const }].slice(-MAX_LOG_ENTRIES),
      );
    };
    socket.on('sector:ship-entered', handleEntered);
    socket.on('sector:ship-left', handleLeft);
    return () => {
      socket.off('sector:ship-entered', handleEntered);
      socket.off('sector:ship-left', handleLeft);
    };
  }, []);

  useEffect(() => {
    const shipName = (shipId: string): string => {
      return players.find(p => p.shipId === shipId)?.name ?? shipId.split(':')[0];
    };

    const handlePhaserFired = (event: { shipId: string }) => {
      if (event.shipId === localShipId) return;
      setLogLines(prev =>
        [...prev, { text: `${shipName(event.shipId)} fires phasers!`, category: 'combat' as const }].slice(-MAX_LOG_ENTRIES),
      );
    };

    const handleCombatHit = (event: { attackerId: string; victimId: string; weapon: string; damageHull: number; damageShield: number }) => {
      const attacker = shipName(event.attackerId);
      if (event.victimId === localShipId) {
        setLogLines(prev =>
          [...prev, {
            text: `** INCOMING ${event.weapon.toUpperCase()}! Hull -${Math.round(event.damageHull)}% shields -${Math.round(event.damageShield)}% from ${attacker} **`,
            category: 'combat' as const,
          }].slice(-MAX_LOG_ENTRIES),
        );
      } else {
        const victim = shipName(event.victimId);
        setLogLines(prev =>
          [...prev, {
            text: `${attacker} hits ${victim} (${event.weapon}, hull -${Math.round(event.damageHull)}%)`,
            category: 'combat' as const,
          }].slice(-MAX_LOG_ENTRIES),
        );
      }
    };

    const handleShipDestroyed = (event: { victimId: string; victimUserid: string; attackerId: string | null; weapon: string | null }) => {
      if (event.victimId === localShipId) {
        setLogLines(prev =>
          [...prev, { text: `** YOUR SHIP HAS BEEN DESTROYED! **`, category: 'combat' as const }].slice(-MAX_LOG_ENTRIES),
        );
      } else {
        const victim = players.find(p => p.shipId === event.victimId)?.name ?? event.victimUserid;
        const attacker = event.attackerId ? shipName(event.attackerId) : 'unknown';
        setLogLines(prev =>
          [...prev, {
            text: `${victim} has been destroyed by ${attacker}!`,
            category: 'combat' as const,
          }].slice(-MAX_LOG_ENTRIES),
        );
      }
    };

    socket.on('combat.phaser-fired', handlePhaserFired);
    socket.on('combat.hit', handleCombatHit);
    socket.on('combat.ship-destroyed', handleShipDestroyed);
    return () => {
      socket.off('combat.phaser-fired', handlePhaserFired);
      socket.off('combat.hit', handleCombatHit);
      socket.off('combat.ship-destroyed', handleShipDestroyed);
    };
  }, [players, localShipId]);

  const shipNameError =
    onboardingPrompt?.type === 'ship-name'
      ? ((onboardingPrompt.payload as { error?: string }).error ?? null)
      : null;

  const renderBottomInput = (): React.JSX.Element => {
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

        {/* Main-right: ASCII sector-map panel (legacy ScanMap) + new ScanPanel (015) */}
        <div className="w-80 flex-shrink-0 border-r border-gray-800 flex flex-col overflow-hidden">
          <ScanMap cells={scanCells} shipId={localShipId} />
          <div className="flex-1 overflow-auto border-t border-gray-800">
            <ScanPanel />
          </div>
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
