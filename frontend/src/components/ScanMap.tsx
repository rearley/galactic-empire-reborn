import React from 'react';
import type { ScanCell } from '../types/contracts';
import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT } from '../types/contracts';

interface ScanMapProps {
  cells: ScanCell[] | null;
}

/**
 * Renders the range-scan character grid.
 * Grid dimensions come from the canonical shared-types constants (30×15 per GEMAIN.H:121-122).
 * The self-cell (type:'self') is rendered with a distinct CSS class to differentiate it
 * from wormhole cells (both use '*' as glyph; type discriminates).
 *
 * @see GEMAIN.H:121 MAXX=30, SCAN_GRID_WIDTH=30
 * @see GEMAIN.H:122 MAXY=15, SCAN_GRID_HEIGHT=15
 * @see GECMDS.C:2721 player centre at map[MAXY/2][MAXX/2]
 */
export function ScanMap({ cells }: ScanMapProps): React.JSX.Element {
  // Build a lookup map from grid cells: "x:y" → ScanCell
  const cellMap = new Map<string, ScanCell>();
  if (cells) {
    for (const cell of cells) {
      cellMap.set(`${cell.x}:${cell.y}`, cell);
    }
  }

  const rows: React.JSX.Element[] = [];
  for (let y = 0; y < SCAN_GRID_HEIGHT; y++) {
    const cols: React.JSX.Element[] = [];
    for (let x = 0; x < SCAN_GRID_WIDTH; x++) {
      const cell = cellMap.get(`${x}:${y}`);
      const char = cell ? cell.char : ' ';
      const className =
        cell?.type === 'self'
          ? 'text-cyan-400 font-bold'
          : cell?.type === 'wormhole'
          ? 'text-purple-400'
          : cell?.type === 'planet'
          ? 'text-yellow-400'
          : cell?.type === 'ship'
          ? 'text-green-400'
          : 'text-gray-600';
      cols.push(
        <span
          key={x}
          className={className}
          data-testid={cell ? `cell-${cell.type}-${x}-${y}` : undefined}
        >
          {char}
        </span>,
      );
    }
    rows.push(
      <div key={y} className="whitespace-pre leading-tight">
        {cols}
      </div>,
    );
  }

  return (
    <div
      className="font-mono text-xs bg-black p-2 overflow-auto"
      data-testid="scan-map"
    >
      {rows}
    </div>
  );
}
