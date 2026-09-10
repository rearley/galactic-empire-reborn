import { useState, useEffect, useRef, useCallback } from 'react';
import type { LogEntry } from './types/logEntry';
import { destructionLine } from './features/combat/destructionLine';
import { useSocket } from './socket/useSocket';
import { usePlayerList } from './state/usePlayerList';
import { EventLog } from './components/EventLog';
import { ScanMap } from './components/ScanMap';
import { CommandInput } from './components/CommandInput';
import { ConnectionIndicator } from './components/ConnectionIndicator';
import { BUILD_VERSION } from './version';
import { ConnectionBanner } from './components/ConnectionBanner';
import { PlayerListPanel } from './components/PlayerListPanel';
import { ScanPanel } from './components/ScanPanel';
import { ShipNamePrompt } from './onboarding/ShipNamePrompt';
import { ShipSelectPrompt, type FleetEntry } from './onboarding/ShipSelectPrompt';
import { clearToken } from './auth/tokenStore';
import { logout } from './auth/logout';
import { connectSocket, socket, onSocketAuthFailed } from './socket/socketClient';
import { handleCommandResult } from './socket/command-result-handlers';
import type { EventLogLine, ScanCell } from './types/contracts';
import type { ScanRenderEvent } from './hooks/useScanRender';

const MAX_LOG_ENTRIES = 500;

/**
 * Root application component — five-region terminal UI (FR-002).
 * Mounted only behind `RequireAuth` at /play, which already guarantees a
 * valid token with a username, so App itself no longer branches on auth.
 * During onboarding (prompt:ship-name active) renders ShipNamePrompt, and
 * when a captain owns more than one hull (prompt:ship-select) renders the fleet
 * menu, instead of normal command input.
 *
 * @see specs/011-onboarding/contracts/websocket-events.md §Connection
 * @see specs/010-react-frontend/spec.md FR-002
 */
export function App(): React.JSX.Element {
  useEffect(() => {
    // A token rejected mid-session (expired, or an account deleted by the
    // midnight sweep) sends the player back to the front door rather than
    // leaving a dead terminal on screen.
    //
    // A plain navigation rather than `useNavigate()` deliberately: App is
    // exercised directly (no <Router> ancestor) by a number of existing
    // Terminal-behaviour tests (test/App.spec.tsx, server-notices,
    // own-hit-not-narrated-third-person), and `useNavigate` throws outside a
    // Router context. A full reload on auth failure is also fine here — the
    // player is being sent back to square one regardless.
    onSocketAuthFailed(() => {
      clearToken();
      window.location.assign('/login');
    });
    connectSocket();
  }, []);

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

    // Canon shows a bystander NOTHING about someone else's weapons fire.
    // `PFIRED` goes `outprfge(FILTER, usrn)` — to the firer alone
    // (GECMDS.C:943-944). The sector-wide broadcasts canon does make are cloak
    // collapse (GEFUNCS.C:1380), the self-destruct countdown (:1836), sector
    // entry/exit (:717-722), radio traffic and the destruction energy burst.
    // Combat is not among them: to know whether two ships off your bow are
    // fighting, you scan them and read their damage.
    // @see docs/DECISIONS.md 2026-09-07
    const handlePhaserFired = (_event: { shipId: string }) => {};

    const handleCombatHit = (event: { attackerId: string; attackerName?: string; victimId: string; victimName?: string; weapon: string; damageHull: number; damageShield: number }) => {
      if (event.victimId === localShipId) {
        // Nothing. The gateway already relays canon's own text for whatever hit
        // you — THIT1/THIT2, MHIT1/MHIT2, PHITYOU/PHITDEF, MINE4 — over
        // `event.log`, and this banner was a second telling of the same event
        // with two departures baked in.
        //
        // Canon reports hull damage as a number NOWHERE: not to the attacker
        // (PHITHIM passes a damstr word), not to the victim (THIT2 gives no
        // magnitude at all), not even to you about your own ship — `rep` sends
        // REP14 with the damstr word too (GECMDS.C:2037-2040). Shield charge
        // gets a number; hull never does. And canon names the attacker at
        // LAUNCH (TFIRE2, by scan letter) and deliberately not at impact.
        //
        // So: you are told you were hit and by what. `rep` tells you your
        // condition, in words. @see docs/DECISIONS.md 2026-09-07
        return;
      }

      // Ordnance the LOCAL ship fired: confirm the strike, assess nothing.
      //
      // Canon's silence to the firer is deliberate — every message about a
      // torpedo after launch goes to the TARGET: the tracking alert (TORP1),
      // the decoy intercept (TORDEST, GEFUNCS.C:1587-1588) and the impact
      // (THIT1/THIT2). The firer is meant to `sca sh <name>` and read
      // `Damage: severe damage` off the target, which is what the scan's damage
      // line exists for. Handing the shooter a hull percentage removed the
      // reason to type it, and was more precise than canon is anywhere: hull
      // condition is one of damstr's six words, always (GECMDS.C:2110).
      //
      // Phaser and hyper-phaser are excluded: canon narrates those to the firer
      // itself (PHITHIM / PDEFLECT, GECMDS.C:985-995) and the gateway relays
      // them, so a line here would duplicate — and arrive first, since the
      // broadcast leaves the server inside the command handler while
      // `command:result` is written only after it returns.
      if (event.attackerId === localShipId) {
        const narratedToFirer = event.weapon === 'phaser' || event.weapon === 'hyper-phaser';
        if (narratedToFirer) return;
        // Prefer the ship name the server resolved: the roster excludes AI, so
        // falling back to the key would print a userid ("Cybrg-222") that no
        // command accepts — `sca sh` wants the ship name ("Cybrg-49340").
        const victim = event.victimName ?? shipName(event.victimId);
        appendLines([{
          text: `Sensors confirm a ${event.weapon} strike on ${victim}.`,
          category: 'combat' as const,
        }]);
      }

      // Anyone else's fight is not narrated to you at all — see the note on
      // handlePhaserFired above.
    };

    const handleShipDestroyed = (event: { victimId: string; victimUserid: string; attackerId: string | null; weapon: string | null; attackerName?: string | null }) => {
      // The server narrates deaths in canon's words now — KILLEDBY for a kill,
      // DIED for a death nothing caused, YOURDEAD to the pilot who died — and
      // all three arrive as ordinary event.log lines. Everything this handler
      // used to compose was a SECOND line about the same death, and its
      // fallback named the victim by userid, which for an automaton is the
      // internal `Cybrg-NNN` account canon's username() hides.
      // @see features/combat/destructionLine.ts
      const victim = players.find(p => p.shipId === event.victimId)?.name
        ?? shipName(event.victimId)
        ?? 'A ship';
      const line = destructionLine(event, victim);
      if (line) {
        appendLines([{ text: line, category: 'combat' as const }]);
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
          onLogout={() => logout()}
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
        <span className="text-xs text-gray-500 uppercase tracking-widest">
          Galactic Empire
          {/* Build identity. Deploys are hands-off, so this is the only way to
              tell whether what you are looking at is the change you pushed.
              @see src/version.ts */}
          <span className="ml-2 normal-case tracking-normal text-gray-700" title="build">
            {BUILD_VERSION}
          </span>
        </span>
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
        <div className="w-80 shrink-0 border-r border-gray-800 flex flex-col overflow-hidden">
          <ScanMap cells={scanCells} shipId={localShipId} kind={scanKind} />
          <div className="flex-1 overflow-auto border-t border-gray-800">
            <ScanPanel shipId={localShipId} />
          </div>
        </div>

        {/* Side: player-list panel (FR-002, FR-016..FR-018) */}
        <div className="w-48 shrink-0">
          <PlayerListPanel players={players} fkeys={fkeys} />
        </div>
      </div>

      {/* Bottom: command input or onboarding prompt (FR-002) */}
      {renderBottomInput()}
    </div>
  );
}
