import { useState, useEffect, useRef, useCallback } from 'react';
import type { LogEntry } from './types/logEntry';
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
  const [logLines, setLogLines] = useState<LogEntry[]>([]);

  /**
   * Every line gets a monotonic id, used as its React key.
   *
   * EventLog keyed rows by ARRAY INDEX over a `slice(-500)` window, so once the
   * log filled, each new message shifted every index and React re-rendered all
   * 500 rows — thousands of reconciliations a second during a combat burst, on
   * the same thread as the player's keystrokes. Reported from play as scrolling
   * problems and a cursor that "had some issues".
   */
  const nextLineId = useRef(0);
  const withIds = useCallback(
    (lines: EventLogLine[]): LogEntry[] =>
      lines.map((l) => ({ ...l, id: nextLineId.current++ })),
    [],
  );
  const appendLines = useCallback(
    (lines: EventLogLine[]) =>
      setLogLines((prev) => [...prev, ...withIds(lines)].slice(-MAX_LOG_ENTRIES)),
    [withIds],
  );

  // Delivered synchronously from the socket callback — no state slot to
  // overwrite, so a burst cannot drop results. @see socket/useCommandResultQueue
  const { status, send, reconnect, localShipId, onboardingPrompt, emitPromptReply } =
    useSocket(playerDispatch, (payload) =>
      handleCommandResult(payload, appendLines, () => setLogLines([])),
    );
  const [scanCells, setScanCells] = useState<ScanCell[] | null>(null);
  // Which scan produced them — ScanMap needs it to decide whether a sector
  // crossing invalidates the view. Only `sca se` is sector-scoped.
  const [scanKind, setScanKind] = useState<ScanRenderEvent['kind'] | null>(null);


  // Function-key bindings for the F KEY MAP panel. Sent on board and again
  // after every `fset`, so the panel is populated at login rather than only
  // once you change something. @see src/game/commands/fkeys.ts
  const [fkeys, setFkeys] = useState<string[]>([]);
  useEffect(() => {
    const handleFkeys = (e: { fkeys: string[] }) => setFkeys(e.fkeys ?? []);
    socket.on('fkeys.snapshot', handleFkeys);
    return () => { socket.off('fkeys.snapshot', handleFkeys); };
  }, []);

  // The sector map belongs to the hull that drew it, for the same reason the
  // SCAN DATA cards do. @see hooks/useScanRender
  useEffect(() => {
    setScanCells(null);
    setScanKind(null);
  }, [localShipId]);

  useEffect(() => {
    const handleScanRender = (event: ScanRenderEvent) => {
      setScanCells(event.cells as ScanCell[]);
      setScanKind(event.kind);
    };
    socket.on('scan:render', handleScanRender);
    return () => { socket.off('scan:render', handleScanRender); };
  }, []);

  useEffect(() => {
    const handleEntered = (payload: { shipName: string }) => {
      appendLines([{ text: `${payload.shipName} has entered the sector.`, category: 'nav' as const }]);
    };
    const handleLeft = (payload: { shipName: string }) => {
      appendLines([{ text: `${payload.shipName} has left the sector.`, category: 'nav' as const }]);
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
    const append = (line: EventLogLine) => appendLines([line]);

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
      appendLines([{ text: `${shipName(event.shipId)} fires phasers!`, category: 'combat' as const }]);
    };

    const handleCombatHit = (event: { attackerId: string; attackerName?: string; victimId: string; victimName?: string; weapon: string; damageHull: number; damageShield: number }) => {
      // Prefer the ship name the server resolved: the roster excludes AI, so
      // falling back to the key would print a userid ("Cybrg-222") that no
      // command accepts — `sca sh` wants the ship name ("Cybrg-49340").
      const attacker = event.attackerName ?? shipName(event.attackerId);
      if (event.victimId === localShipId) {
        appendLines([{
            text: `** INCOMING ${event.weapon.toUpperCase()}! Hull -${Math.round(event.damageHull)}% shields -${Math.round(event.damageShield)}% from ${attacker} **`,
            category: 'combat' as const,
          }]);
      } else {
        const victim = event.victimName ?? shipName(event.victimId);
        appendLines([{
            text: `${attacker} hits ${victim} (${event.weapon}, hull -${Math.round(event.damageHull)}%)`,
            category: 'combat' as const,
          }]);
      }
    };

    const handleShipDestroyed = (event: { victimId: string; victimUserid: string; attackerId: string | null; weapon: string | null; attackerName?: string | null }) => {
      if (event.victimId === localShipId) {
        appendLines([{ text: `** YOUR SHIP HAS BEEN DESTROYED! **`, category: 'combat' as const }]);
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
        appendLines([{
            text: attacker
              ? `${victim} has been destroyed by ${attacker}!`
              : `${victim} has been destroyed!`,
            category: 'combat' as const,
          }]);
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
      appendLines([{ text: event.message as string, category: 'combat' as const }]
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
      appendLines([{
        text: `The ${what} locked on to the decoy Sir! It has exploded destroying both!`,
        category: 'combat' as const,
      }]);
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
          <ScanMap cells={scanCells} shipId={localShipId} kind={scanKind} />
          <div className="flex-1 overflow-auto border-t border-gray-800">
            <ScanPanel shipId={localShipId} />
          </div>
        </div>

        {/* Side: player-list panel (FR-002, FR-016..FR-018) */}
        <div className="w-48 flex-shrink-0">
          <PlayerListPanel players={players} fkeys={fkeys} />
        </div>
      </div>

      {/* Bottom: command input or onboarding prompt (FR-002) */}
      {renderBottomInput()}
    </div>
  );
}
