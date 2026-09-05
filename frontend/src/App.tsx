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
import { ShipSelectPrompt, type FleetEntry } from './onboarding/ShipSelectPrompt';
import { getToken, setToken } from './auth/tokenStore';
import { connectSocket, socket, onSocketAuthFailed } from './socket/socketClient';
import { handleCommandResult } from './socket/command-result-handlers';
import type { EventLogLine, ScanCell } from './types/contracts';
import type { ScanRenderEvent } from './hooks/useScanRender';

const MAX_LOG_ENTRIES = 500;

/**
 * Root application component — five-region terminal UI (FR-002).
 * Gates on JWT token: renders AuthScreen when absent, terminal otherwise.
 * During onboarding (prompt:ship-name active) renders ShipNamePrompt, and
 * when a captain owns more than one hull (prompt:ship-select) renders the fleet
 * menu, instead of normal command input.
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
  const { status, lastResult, send, reconnect, localShipId, onboardingPrompt, emitPromptReply } =
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

  /**
   * Unsolicited server notices.
   *
   * `event.log` is the catch-all the gateway uses for anything that is not a
   * reply to a command: the self-destruct countdown and its detonation, cloak
   * collapse from energy starvation, subsystem damage warnings, the
   * call-for-help alert when someone attacks your planet, and the sector notice
   * when a captain abandons ship. `message.send` carries radio traffic.
   *
   * Neither had a listener, so all of it was dropped: `des` started a countdown
   * the pilot never saw, and `sen`/`fre` transmitted into a void.
   */
  useEffect(() => {
    const append = (line: EventLogLine) =>
      setLogLines((prev) => [...prev, line].slice(-MAX_LOG_ENTRIES));

    const handleServerNotice = (payload: { text?: string; category?: EventLogLine['category'] }) => {
      if (typeof payload?.text !== 'string') return;
      append({ text: payload.text, category: payload.category ?? 'system' });
    };

    const handleTransmission = (payload: { from?: string; channel?: string; text?: string }) => {
      if (typeof payload?.text !== 'string' || typeof payload.from !== 'string') return;
      const channel = payload.channel ? `[${payload.channel}] ` : '';
      append({ text: `${channel}${payload.from}: ${payload.text}`, category: 'chat' });
    };

    socket.on('event.log', handleServerNotice);
    socket.on('message.send', handleTransmission);
    return () => {
      socket.off('event.log', handleServerNotice);
      socket.off('message.send', handleTransmission);
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

    const handleCombatHit = (event: { attackerId: string; attackerName?: string; victimId: string; victimName?: string; weapon: string; damageHull: number; damageShield: number }) => {
      // Prefer the ship name the server resolved: the roster excludes AI, so
      // falling back to the key would print a userid ("Cybrg-222") that no
      // command accepts — `sca sh` wants the ship name ("Cybrg-49340").
      const attacker = event.attackerName ?? shipName(event.attackerId);
      if (event.victimId === localShipId) {
        setLogLines(prev =>
          [...prev, {
            text: `** INCOMING ${event.weapon.toUpperCase()}! Hull -${Math.round(event.damageHull)}% shields -${Math.round(event.damageShield)}% from ${attacker} **`,
            category: 'combat' as const,
          }].slice(-MAX_LOG_ENTRIES),
        );
      } else {
        const victim = event.victimName ?? shipName(event.victimId);
        setLogLines(prev =>
          [...prev, {
            text: `${attacker} hits ${victim} (${event.weapon}, hull -${Math.round(event.damageHull)}%)`,
            category: 'combat' as const,
          }].slice(-MAX_LOG_ENTRIES),
        );
      }
    };

    const handleShipDestroyed = (event: { victimId: string; victimUserid: string; attackerId: string | null; weapon: string | null; attackerName?: string | null }) => {
      if (event.victimId === localShipId) {
        setLogLines(prev =>
          [...prev, { text: `** YOUR SHIP HAS BEEN DESTROYED! **`, category: 'combat' as const }].slice(-MAX_LOG_ENTRIES),
        );
      } else {
        const victim = players.find(p => p.shipId === event.victimId)?.name ?? event.victimUserid;
        // A planet's ion cannons leave no attacking ship — `fireion` sets the
        // victim's lastfired to -1 — so `attackerId` is null and this used to
        // fall through to "unknown", hiding the fact that someone's colony had
        // defended itself. The server names the planet when it can.
        const attacker = event.attackerId
          ? shipName(event.attackerId)
          : event.weapon === 'ion'
            ? (event.attackerName ?? 'planetary defences')
            : null;
        // Some deaths genuinely have no killer — a gravity crash sets damage
        // to 101 with no attacker (GEFUNCS.C:887), and a self-destruct has
        // none by definition. Saying "destroyed by unknown" invented an
        // assailant for a pilot who flew into a planet.
        setLogLines(prev =>
          [...prev, {
            text: attacker
              ? `${victim} has been destroyed by ${attacker}!`
              : `${victim} has been destroyed!`,
            category: 'combat' as const,
          }].slice(-MAX_LOG_ENTRIES),
        );
      }
    };

    // A Cybertron taunting you, or a droid complaining that you shot it.
    //
    // The server has emitted these since the AI landed and nothing has ever
    // listened, so every one of them was dropped on the floor. That matters
    // more than flavour: scan ranges are asymmetric — an Obliterator sees six
    // sectors and a starter Interceptor one and a half — so the thing hunting
    // you is routinely outside your own scanners, and canon's taunt is the
    // only warning the game gives before it opens fire.
    //
    // Canon's message text is multi-line ("***\nHailing message from The X\n
    // < ... >"); EventLog renders with `whitespace-pre-wrap`, so it survives.
    // @see GECYBS.C:382-410 cyb_annoy, GEDROIDS.C:232-245 droid_annoy
    const handleAiTaunt = (event: { message?: string }) => {
      if (!event?.message) return;
      setLogLines(prev =>
        [...prev, { text: event.message as string, category: 'combat' as const }]
          .slice(-MAX_LOG_ENTRIES),
      );
    };

    socket.on('combat.phaser-fired', handlePhaserFired);
    socket.on('combat.hit', handleCombatHit);
    socket.on('combat.ship-destroyed', handleShipDestroyed);
    // Your decoy ate an incoming torpedo or missile. Canon tells the DEFENDER:
    // the `ltorps` being walked in checktm are the weapons locked ONTO you, and
    // `decout` is your own decoy screen, so TORDEST/MISDEST go out
    // `outprfge(FILTER, usrn)` to the ship that was saved.
    // @see GEFUNCS.C:1581-1594, GE/REL/MBMGEMSG.MSG TORDEST / MISDEST
    const handleDecoyIntercept = (event: { defenderId: string; weapon: 'torpedo' | 'missile' }) => {
      if (event.defenderId !== localShipId) return;
      const what = event.weapon === 'missile' ? 'missile' : 'torpedo';
      setLogLines(prev =>
        [...prev, {
          text: `The ${what} locked on to the decoy Sir! It has exploded destroying both!`,
          category: 'combat' as const,
        }].slice(-MAX_LOG_ENTRIES),
      );
    };

    socket.on('cybertron.taunt', handleAiTaunt);
    socket.on('droid.annoy', handleAiTaunt);
    socket.on('combat.decoy-intercept', handleDecoyIntercept);
    return () => {
      socket.off('combat.phaser-fired', handlePhaserFired);
      socket.off('combat.hit', handleCombatHit);
      socket.off('combat.ship-destroyed', handleShipDestroyed);
      socket.off('cybertron.taunt', handleAiTaunt);
      socket.off('droid.annoy', handleAiTaunt);
      socket.off('combat.decoy-intercept', handleDecoyIntercept);
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
    if (onboardingPrompt?.type === 'ship-select') {
      const payload = onboardingPrompt.payload as { ships?: FleetEntry[]; error?: string };
      return (
        <ShipSelectPrompt
          ships={payload.ships ?? []}
          onSelect={(index) => emitPromptReply(index)}
          error={payload.error ?? null}
        />
      );
    }
    return <CommandInput onSubmit={send} />;
  };

  return (
    <div className="flex h-screen flex-col bg-black text-gray-100 font-mono">
      {/* Top: connection status banner (FR-019) — hidden when connected */}
      <ConnectionBanner status={status} onReconnect={reconnect} />

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

        {/*
          * Two panels, one job each.
          *
          * ScanMap is the LIVE view — the most recent scan, always current,
          * the thing you glance at while typing. ScanPanel is the READOUT —
          * header and contact table, with history you can scroll to compare
          * two scans.
          *
          * They used to render the same grid from the same event (this comment
          * previously read "legacy ScanMap + new ScanPanel", ScanPanel having
          * been built to replace it and nothing having removed it), so a
          * `sca se` painted the identical picture twice and the history filled
          * with near-duplicates.
          */}
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
