import React, { useState, type KeyboardEvent } from 'react';

interface CommandHistory {
  entries: string[]; // entries[0] = most recent, bounded to 20
  cursor: number;    // -1 = editing new input; 0..N-1 = browsing history
  draft: string;     // saved in-progress text restored when cursor returns to -1
}

interface CommandInputProps {
  onSubmit: (input: string) => void;
}

const MAX_HISTORY = 20;

/**
 * Single-line command input — Enter submits and clears the field.
 * Up/Down arrow keys navigate a 20-entry history (FR-004, FR-005).
 * @see specs/003-ship-commands/contracts/websocket-events.md §command
 * @see specs/010-react-frontend/data-model.md §B.2 CommandHistory
 */
export function CommandInput({ onSubmit }: CommandInputProps): React.JSX.Element {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<CommandHistory>({
    entries: [],
    cursor: -1,
    draft: '',
  });

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmed = value.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setHistory((prev) => ({
          entries: [trimmed, ...prev.entries].slice(0, MAX_HISTORY),
          cursor: -1,
          draft: '',
        }));
        setValue('');
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHistory((prev) => {
        if (prev.entries.length === 0) return prev;
        if (prev.cursor === -1) {
          // Save current draft and move to most-recent entry
          const newCursor = 0;
          setValue(prev.entries[newCursor]);
          return { ...prev, cursor: newCursor, draft: value };
        }
        if (prev.cursor < prev.entries.length - 1) {
          const newCursor = prev.cursor + 1;
          setValue(prev.entries[newCursor]);
          return { ...prev, cursor: newCursor };
        }
        return prev; // at oldest entry, do nothing
      });
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHistory((prev) => {
        if (prev.cursor === -1) return prev; // already at new input
        if (prev.cursor > 0) {
          const newCursor = prev.cursor - 1;
          setValue(prev.entries[newCursor]);
          return { ...prev, cursor: newCursor };
        }
        // cursor === 0: return to draft
        setValue(prev.draft);
        return { ...prev, cursor: -1, draft: '' };
      });
    }
  };

  return (
    <div className="border-t border-gray-700 p-2 bg-black flex items-center gap-1">
      <span className="font-mono text-sm text-accent select-none">{'>'}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 bg-transparent font-mono text-sm text-gray-100 outline-none"
        placeholder="enter command"
        data-testid="command-input"
        autoFocus
        autoComplete="off"
      />
    </div>
  );
}
