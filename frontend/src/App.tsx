import { useEffect, useCallback } from 'react';
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
import { ShipSelectPrompt } from './onboarding/ShipSelectPrompt';
import { clearToken } from './auth/tokenStore';
import { logout } from './auth/logout';
import { connectSocket, socket, onSocketAuthFailed } from './socket/socketClient';
import { handleCommandResult } from './socket/command-result-handlers';
import type { CombatShipDestroyedPayload } from '@ge/wire';
import { useScanMap } from './hooks/useScanMap';
import { useEventLog } from './hooks/useEventLog';
import { useFkeys } from './hooks/useFkeys';

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

  // `useCallback` so the combat-subscription effect below can depend on this
  // rather than on the values it happens to read. That comment used to say "if
  // `shipName` starts reading anything beyond `players`, add it to that dep
  // array by hand", because no React lint plugin was loaded and nothing
  // enforced it. One is loaded now, so the rule holds this invariant instead of
  // a reader remembering to. @see issue #25
  const shipName = useCallback(
    (shipId: string): string =>
      players.find((p) => p.shipId === shipId)?.name ?? shipId.split(':')[0],
    [players],
  );

  const { lines: logLines, append: appendLines, clear: clearLog } = useEventLog();

  // Delivered synchronously from the socket callback — no state slot to
  // overwrite, so a burst cannot drop results. @see socket/useCommandResultQueue
  const { status, send, reconnect, localShipId, onboardingPrompt, emitPromptReply } =
    useSocket(playerDispatch, (payload) =>
      handleCommandResult(payload, appendLines, clearLog),
    );
  const { cells: scanCells, kind: scanKind } = useScanMap(localShipId);

  const fkeys = useFkeys();

  useEffect(() => {
    // NOTHING is rendered for `combat.phaser-fired` or `combat.hit`.
    //
    // Every line canon has about a weapon landing is sent by the SERVER as
    // event.log text: PHITHIM/PDEFLECT to a phaser's firer, PHITYOU/PHITDEF and
    // THIT/MHIT/MINE4 to the victim, and — the one that closes this out —
    // MTACC1/MTACC2 to the firer of a torpedo or missile, which is what `acctm`
    // exists to print (GEFUNCS.C:1738-1743 `outprfge(ALWAYS,channel)`).
    //
    // The client used to add "Sensors confirm a <weapon> strike on <ship>." for
    // torpedoes and missiles, a port-original string written when acctm was read
    // as scoring rather than as a message. It is not: it prints. So a pilot got
    // both tellings, which is what the playtest log in issue #8 shows. Canon's
    // words win and the invention goes. A mine's layer is told nothing at all,
    // which is also canon — MINE4 goes to the victim and MINE5 to bystanders.
    // @see docs/DECISIONS.md 2026-09-07, CORRECTED 2026-09-12
    const handleShipDestroyed = (event: CombatShipDestroyedPayload) => {
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

    socket.on('combat.decoy-intercept', handleDecoyIntercept);
    return () => {
      socket.off('combat.ship-destroyed', handleShipDestroyed);
      socket.off('combat.decoy-intercept', handleDecoyIntercept);
    };
  }, [players, localShipId, shipName, appendLines]);

  const shipNameError =
    onboardingPrompt?.type === 'ship-name' ? (onboardingPrompt.payload.error ?? null) : null;

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
      return (
        <ShipSelectPrompt
          ships={onboardingPrompt.payload.ships}
          onSelect={(index) => emitPromptReply(index)}
          // Present only on a RE-emitted menu: the gateway says whether the
          // number was outside the list or the hull is gone. @see issue #6
          error={onboardingPrompt.payload.error ?? null}
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
