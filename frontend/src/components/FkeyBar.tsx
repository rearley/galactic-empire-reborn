import React from 'react';

interface FkeyBarProps {
  /** f1..f12 bindings at indices 0..11; '' means unbound. */
  fkeys: string[];
  /** Same path a typed command takes. */
  onSend: (command: string) => void;
}

/**
 * How much of a binding a chip shows. Long enough to tell `scan lo full` from
 * `scan sh @`, short enough that two chips fit a 390px row. The whole command
 * stays on the button's title and accessible name, and in the legend under
 * PLAYERS & SHORTCUTS.
 */
const CHIP_CHARS = 9;

export function chipLabel(command: string): string {
  return command.length <= CHIP_CHARS + 1 ? command : `${command.slice(0, CHIP_CHARS)}…`;
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
 * WRAPS rather than scrolling sideways. One row hid everything past the fourth
 * chip with nothing to say so — the owner had nine slots bound and could see
 * four. Height is capped so a full dozen cannot eat the log.
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
      className="flex max-h-24 shrink-0 flex-wrap gap-1 overflow-y-auto border-t border-gray-800 bg-black px-2 py-1"
    >
      {bound.map(({ slot, command }) => (
        <button
          key={slot}
          type="button"
          data-testid={`fkey-chip-${slot}`}
          onClick={() => onSend(command)}
          title={`${slot}: ${command}`}
          aria-label={`${slot} ${command}`}
          className="shrink-0 border border-gray-700 px-2 py-1 font-mono text-xs whitespace-nowrap text-gray-300 active:bg-gray-800"
        >
          <span className="text-yellow-400">{slot}</span>
          <span>{` ${chipLabel(command)}`}</span>
        </button>
      ))}
    </div>
  );
}
