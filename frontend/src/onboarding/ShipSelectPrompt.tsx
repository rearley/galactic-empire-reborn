import React, { useState } from 'react';

export interface FleetEntry {
  index: number;
  shipno: number;
  className: string;
  shipname: string;
  sector: { x: number; y: number };
}

interface Props {
  ships: FleetEntry[];
  onSelect: (index: number) => void;
  error: string | null;
}

/**
 * Fleet menu shown when a captain owns more than one ship.
 *
 * The gateway emits `prompt:ship-select` and boards nothing until it gets a
 * `prompt:reply` carrying a 1-based index. Nothing on the client listened for
 * that event, so buying a second ship left the account connected with no active
 * ship and "No active ship." as the reply to every command.
 *
 * @see specs/030-multi-ship/task-7-brief.md T7
 */
export function ShipSelectPrompt({ ships, onSelect, error }: Props): React.JSX.Element {
  const [value, setValue] = useState('');

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key !== 'Enter') return;
    const choice = Number(value.trim());
    if (!Number.isInteger(choice) || choice < 1 || choice > ships.length) return;
    onSelect(choice);
  }

  return (
    <div className="p-4 font-mono text-gray-100" data-testid="ship-select">
      <p className="mb-2 text-yellow-400">Choose a ship (enter its number):</p>
      {error && (
        <p role="alert" className="mb-2 text-red-400">
          {error}
        </p>
      )}
      {/* pre: the rows are space-padded columns, which HTML would otherwise collapse. */}
      <ul className="mb-2 whitespace-pre">
        {ships.map((s) => (
          <li key={s.shipno}>
            {`${String(s.index).padStart(2)}. ${s.shipname.padEnd(20).slice(0, 20)} ${s.className.padEnd(20).slice(0, 20)} (${s.sector.x}, ${s.sector.y})`}
          </li>
        ))}
      </ul>
      <input
        type="text"
        data-testid="ship-select-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="bg-black border border-gray-600 text-gray-100 px-2 py-1 w-24"
        autoFocus
      />
    </div>
  );
}
