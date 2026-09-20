import { useEffect, useCallback, useState } from 'react';
import { destructionLine } from './features/combat/destructionLine';
import { useSocket } from './socket/useSocket';
import { usePlayerList } from './state/usePlayerList';
import { EventLog } from './components/EventLog';
import { ScanMap } from './components/ScanMap';
import { CommandInput } from './components/CommandInput';
import { ConnectionBanner } from './components/ConnectionBanner';
import { DeployBanner } from './components/DeployBanner';
import { VersionBanner } from './components/VersionBanner';
import { PlayerListPanel } from './components/PlayerListPanel';
import { FkeyBar } from './components/FkeyBar';
import { ScanPanel } from './components/ScanPanel';
import { TitleBar } from './components/TitleBar';
import { PreFlightScreen } from './onboarding/PreFlightScreen';
import { clearToken } from './auth/tokenStore';
import { logout } from './auth/logout';
import { connectSocket, socket, onSocketAuthFailed } from './socket/socketClient';
import { handleCommandResult } from './socket/command-result-handlers';
import type { CombatShipDestroyedPayload } from '@ge/wire';
import { useScanMap } from './hooks/useScanMap';
import { useEventLog } from './hooks/useEventLog';
import { useDeployNotice } from './hooks/useDeployNotice';
import { useVersionCheck } from './hooks/useVersionCheck';
import { useFkeys } from './hooks/useFkeys';
import { useIsNarrow } from './hooks/useIsNarrow';

/**
 * Root application component — five-region terminal UI (FR-002).
 * Mounted only behind `RequireAuth` at /play, which already guarantees a
 * valid token with a username, so App itself no longer branches on auth.
 * Ship entry — naming a first ship, or choosing from a fleet — is its own
 * screen rather than a swapped input bar, so none of the game renders for a
 * captain who is not in it. @see onboarding/PreFlightScreen.tsx
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
  // ABOVE the PreFlightScreen early return, like `useIsNarrow`: a hook called
  // conditionally changes the hook order between renders.
  const deployNotice = useDeployNotice();
  const versionCheck = useVersionCheck();

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

  /**
   * A new hull starts with a clean log.
   *
   * Every boarding prints WELCOM — tossingegame,
   * GEFUNCS.C:172 `prfmsg(WELCOM,waruptr->userid);` — and canon is right to: it runs each time a
   * pilot is tossed into the arena. In canon `x` dropped you to the main menu,
   * which redrew the screen, so the next welcome never landed directly under
   * the last. Our single scrollback stacked them, and `x` / select / `x` /
   * select read as three identical greetings. Reported from play.
   *
   * Cleared when ship entry BEGINS, not when it ends. `player.snapshot` is
   * what clears the prompt, and boarding emits the WELCOM `command:result`
   * BEFORE that snapshot — so clearing on the way out would wipe the welcome
   * the player just arrived for and leave an empty log.
   *
   * Compared during render rather than reset in an effect, the same recipe
   * `useScanMap` uses for the same job — scan data is dropped on a hull change
   * for the same reason. @see hooks/useScanMap.ts, issue #25
   */
  const [wasEnteringShip, setWasEnteringShip] = useState(onboardingPrompt !== null);
  if ((onboardingPrompt !== null) !== wasEnteringShip) {
    setWasEnteringShip(onboardingPrompt !== null);
    if (onboardingPrompt !== null) clearLog();
  }

  // The three columns need 512px of fixed width before the log gets any, so on
  // a phone the log was squeezed to nothing and pushed off-screen — you had to
  // turn the handset sideways to read it. Narrow gets its own tree.
  const narrow = useIsNarrow();

  // Between hulls — naming a first ship, choosing from a fleet, or picking up
  // after one was destroyed — none of the game is rendered at all. It used to
  // be: ship entry swapped the bottom input bar and left the log, the scan
  // panels and the roster mounted behind it, so a captain who had typed `x`
  // watched a game they were no longer in. @see onboarding/PreFlightScreen.tsx
  if (onboardingPrompt) {
    return (
      <PreFlightScreen
        prompt={onboardingPrompt}
        status={status}
        onReconnect={reconnect}
        onReply={(value) => emitPromptReply(value)}
        onLogout={() => logout()}
      />
    );
  }

  if (narrow) {
    return (
      <div className="flex h-screen flex-col bg-black text-gray-100 font-mono">
        <DeployBanner notice={deployNotice} />
        <VersionBanner
          serverVersion={versionCheck.serverVersion}
          onReload={versionCheck.reload}
          onDismiss={versionCheck.dismiss}
        />
        <ConnectionBanner status={status} onReconnect={reconnect} />
        <TitleBar status={status} />

        {/*
          * The command line sits ABOVE the log here. iOS puts the keyboard over
          * the bottom of the viewport, so an input pinned to the bottom is the
          * first thing it covers — and with it the newest lines of the log.
          */}
        <CommandInput onSubmit={send} />

        {/*
          * Phone only. Every character costs a touch-keyboard tap here, so a
          * bound slot is worth a button; on the desktop terminal the legend in
          * the side panel is enough. @see components/FkeyBar.tsx
          */}
        <FkeyBar fkeys={fkeys} onSend={send} />

        <div className="flex flex-1 flex-col overflow-hidden border-t border-gray-800">
          <EventLog lines={logLines} />
        </div>

        {/*
          * Folded, not stacked. Both panels are worth reaching for on a phone
          * and neither is worth the screen while you are reading the log, so
          * they are closed until asked for. Still MOUNTED when closed, which is
          * what keeps their subscriptions and history alive.
          */}
        <details data-testid="panel-scan" className="shrink-0 border-t border-gray-800">
          <summary className="cursor-pointer px-3 py-2 text-xs uppercase tracking-widest text-gray-500">
            Scan
          </summary>
          <div className="max-h-[50vh] overflow-auto border-t border-gray-800">
            <ScanMap cells={scanCells} shipId={localShipId} kind={scanKind} />
            <div className="border-t border-gray-800">
              <ScanPanel shipId={localShipId} />
            </div>
          </div>
        </details>

        {/*
          * The f-key legend STAYS on a phone. These are typed shortcuts —
          * `fset f1 pha 0 0` then `f1` — not captured keypresses, because a
          * browser cannot claim the real F-keys (see game/commands/fkeys.ts).
          * Typing `f1` instead of `pha 0 0` is worth more on a touch keyboard
          * than on a desktop, not less. This panel was dropped here on the
          * first pass, on the false reasoning that a phone has no F-keys.
          */}
        <details data-testid="panel-players" className="shrink-0 border-t border-gray-800">
          <summary className="cursor-pointer px-3 py-2 text-xs uppercase tracking-widest text-gray-500">
            Players &amp; shortcuts
          </summary>
          <div className="max-h-[40vh] overflow-auto border-t border-gray-800">
            <PlayerListPanel players={players} fkeys={fkeys} />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-black text-gray-100 font-mono">
      {/*
        * ABOVE the connection banner on purpose: when a redeploy drops the
        * socket both are showing, and "the server is restarting" is the one
        * that explains the other.
        */}
      <DeployBanner notice={deployNotice} />

      {/*
        * BELOW the deploy banner: during a redeploy the countdown is the one
        * that matters, and this only becomes true once the server is back.
        */}
      <VersionBanner
        serverVersion={versionCheck.serverVersion}
        onReload={versionCheck.reload}
        onDismiss={versionCheck.dismiss}
      />

      {/* Top: connection status banner (FR-019) — hidden when connected */}
      <ConnectionBanner status={status} onReconnect={reconnect} />

      {/* Top bar: title + connection indicator (FR-002, FR-022) */}
      <TitleBar status={status} />

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

      {/* Bottom: command input (FR-002) */}
      <CommandInput onSubmit={send} />
    </div>
  );
}
