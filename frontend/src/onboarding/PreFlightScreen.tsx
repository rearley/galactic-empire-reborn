import React from 'react';
import type { OnboardingPrompt } from '../socket/useSocket';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { TitleBar } from '../components/TitleBar';
import { ShipNamePrompt } from './ShipNamePrompt';
import { ShipSelectPrompt } from './ShipSelectPrompt';

interface Props {
  prompt: OnboardingPrompt;
  status: React.ComponentProps<typeof ConnectionBanner>['status'];
  onReconnect: () => void;
  onReply: (value: string | number) => void;
  onLogout: () => void;
}

/**
 * Where a captain is between hulls: naming their first ship, choosing from a
 * fleet, or picking up after one was destroyed.
 *
 * It exists because ship entry used to swap only the bottom input bar and left
 * the entire terminal mounted behind it — event log, scan map, scan readout,
 * roster. A pilot who typed `x` sat watching a game they were no longer in, and
 * until v0.21.2 that view was live: the socket had never left its sector room.
 * The server no longer feeds it, and this stops the client drawing a world for
 * someone who is not in one.
 *
 * The connection banner and title bar stay. Both are facts about the SESSION,
 * not the game, and a socket that drops while you are choosing has to be able
 * to say so.
 *
 * The event log is deliberately unmounted rather than cleared. Dying mid-session
 * lands you here (`recoverAfterDeath` → `presentShipEntry`), and the YOURDEAD
 * lines that explain what killed you are in that scrollback — hiding it keeps
 * it for when you board again; clearing it would throw it away.
 *
 * Top-left rather than centred: this is a terminal, and a terminal writes from
 * the top-left corner. A centred panel would be a card, which this game is not.
 */
export function PreFlightScreen({
  prompt,
  status,
  onReconnect,
  onReply,
  onLogout,
}: Props): React.JSX.Element {
  return (
    <div
      className="flex h-screen flex-col bg-black text-gray-100 font-mono"
      data-testid="preflight-screen"
    >
      <ConnectionBanner status={status} onReconnect={onReconnect} />
      <TitleBar status={status} />

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl">
          {prompt.type === 'ship-name' ? (
            <ShipNamePrompt
              onSubmit={(name) => onReply(name)}
              error={prompt.payload.error ?? null}
            />
          ) : (
            <ShipSelectPrompt
              ships={prompt.payload.ships}
              onSelect={(index) => onReply(index)}
              // Present only on a RE-emitted menu: the gateway says whether the
              // number was outside the list or the hull is gone. @see issue #6
              error={prompt.payload.error ?? null}
              onLogout={onLogout}
            />
          )}
        </div>
      </div>
    </div>
  );
}
