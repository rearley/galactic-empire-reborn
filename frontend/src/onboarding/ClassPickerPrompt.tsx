import React from 'react';

export interface ShipClassEntry {
  classNumber: number;
  typeName: string;
  description: string;
  maxShields: number;
  maxPhaser: number;
  maxWarp: number;
  hasTorpedo: boolean;
  hasMissile: boolean;
}

interface Props {
  classes: ShipClassEntry[];
  onSelect: (classNumber: number) => void;
  error?: string;
}

export function ClassPickerPrompt({ classes, onSelect, error }: Props): React.JSX.Element {
  return (
    <div data-testid="class-picker" className="p-4 font-mono text-gray-100">
      <p className="mb-2 text-yellow-400">Choose your ship class:</p>
      {error && (
        <p role="alert" className="mb-2 text-red-400">{error}</p>
      )}
      <ul>
        {classes.map((c) => (
          <li key={c.classNumber} className="mb-1">
            <button
              onClick={() => onSelect(c.classNumber)}
              className="text-left hover:text-yellow-300"
            >
              <span className="text-cyan-400">{c.classNumber}. </span>
              <span>{c.typeName}</span>
              {' — '}{c.description}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
