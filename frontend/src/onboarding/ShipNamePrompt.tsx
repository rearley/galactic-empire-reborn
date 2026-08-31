import React, { useState } from 'react';

interface Props {
  onSubmit: (name: string) => void;
  error: string | null;
}

export function ShipNamePrompt({ onSubmit, error }: Props): React.JSX.Element {
  const [value, setValue] = useState('');

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key !== 'Enter') return;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 19) return;
    onSubmit(trimmed);
  }

  return (
    <div className="p-4 font-mono text-gray-100">
      <p className="mb-2 text-yellow-400">
        Enter a name for your ship (1–19 characters, no spaces):
      </p>
      {error && (
        <p role="alert" className="mb-2 text-red-400">
          {/*
            The gateway distinguishes these two; showing "already taken" for
            both sent pilots off to invent a new name when the real problem was
            a space in the one they had chosen.
          */}
          {error === 'name-taken'
            ? 'That name is already taken. Choose another.'
            : 'Use 1–19 characters, no spaces.'}
        </p>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="bg-black border border-gray-600 text-gray-100 px-2 py-1 w-64"
        autoFocus
      />
    </div>
  );
}
