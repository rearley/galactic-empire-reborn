import React from 'react';

interface FkeyBarProps {
  /** f1..f12 bindings at indices 0..11; '' means unbound. */
  fkeys: string[];
  /** Same path a typed command takes. */
  onSend: (command: string) => void;
}

/**
 * One-tap shortcuts, PHONE ONLY.
 *
 * `fset f1 pha 0 0` binds a slot and typing `f1` runs it — typed rather than
 * captured, because a browser cannot claim the real F-keys
 * (`game/commands/fkeys.ts`). On a desktop that is already cheap: two
 * keystrokes without leaving the home row. On a phone every character costs a
 * touch-keyboard tap, so the same binding becomes a button.
 *
 * Deliberately NOT rendered on the desktop terminal, which keeps the legend in
 * its side panel: there the bar would take log height to save two keystrokes
 * nobody minds typing. @see App.tsx, PlayerListPanel.tsx
 *
 * It sends the BOUND TEXT rather than the slot name. Either would work — the
 * router expands `f1` server-side — but sending `pha 0` means the log echoes
 * what actually ran, which is what a player needs to see when a shortcut does
 * something they did not expect.
 */
export function FkeyBar({ fkeys, onSend }: FkeyBarProps): React.JSX.Element | null {
  const bound = fkeys
    .map((command, i) => ({ slot: `f${i + 1}`, command }))
    .filter((b) => b.command !== '');

  // Nothing bound, nothing to show — an empty strip would cost log height and
  // teach a new player nothing about how to fill it. `hel fset` does that.
  if (bound.length === 0) return null;

  return (
    <div
      data-testid="fkey-bar"
      className="flex shrink-0 gap-2 overflow-x-auto whitespace-nowrap border-t border-gray-800 bg-black px-2 py-1"
    >
      {bound.map(({ slot, command }) => (
        <button
          key={slot}
          type="button"
          data-testid={`fkey-chip-${slot}`}
          onClick={() => onSend(command)}
          className="shrink-0 border border-gray-700 px-2 py-1 font-mono text-xs text-gray-300 active:bg-gray-800"
        >
          <span className="text-yellow-400">{slot}</span>
          <span>{` ${command}`}</span>
        </button>
      ))}
    </div>
  );
}
