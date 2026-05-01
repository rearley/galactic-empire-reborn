import React, { useState, type KeyboardEvent } from 'react';

interface CommandInputProps {
  onSubmit: (input: string) => void;
}

/**
 * Single-line command input — Enter submits and clears the field.
 * @see specs/003-ship-commands/contracts/websocket-events.md §command
 */
export function CommandInput({ onSubmit }: CommandInputProps): React.JSX.Element {
  const [value, setValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmed = value.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setValue('');
      }
    }
  };

  return (
    <div className="border-t border-gray-700 p-2 bg-black">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full bg-transparent font-mono text-sm text-gray-100 outline-none"
        placeholder="> enter command"
        data-testid="command-input"
        autoFocus
        autoComplete="off"
      />
    </div>
  );
}
