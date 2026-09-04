import React, { useEffect, useState } from 'react';
import type { ScanCell, PhysicsSectorTransitionPayload } from '../types/contracts';
import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT, PHYSICS_SECTOR_TRANSITION } from '../types/contracts';
import { socket } from '../socket/socketClient';

/**
 * Overlap priority for cells at the same grid position (FR-015, research.md R7).
 * Higher value = higher priority.
 * @see GECMDS.C:2681 scan_lo cell projection
 */
const PRIORITY: Record<string, number> = {
  self: 5,
  ship: 4,
  planet: 3,
  wormhole: 2,
  mine: 1,
};

const CELL_CLASS: Record<string, string> = {
  self: 'text-cyan-400 font-bold',
  ship: 'text-green-400',
  planet: 'text-yellow-400',
  wormhole: 'text-purple-400',
  mine: 'text-orange-400',
};

interface ScanMapProps {
  cells: ScanCell[] | null;
  /** Local ship's ID — used to detect sector transitions that clear the map (FR-013) */
  shipId?: string | null;
}

/**
 * Renders the 30×15 range-scan character grid.
 * Clears on `physics.sector-transition` when the local ship transitions (FR-013).
 * Resolves overlapping cells by priority: self > ship > planet > wormhole > mine (FR-015).
 * Empty positions render a SPACE. Canon's `clearmap()` fills the grid with
 * ' ' (GECMDS.C:2978) and reserves '.' for a live MINE (GECMDS.C:2607, :2542).
 * This rendered '.' for empty, so once mines were drawn they were invisible
 * against the background — and the port had papered over that by inventing a
 * "Mine detected — bearing ..." line where canon has MINE6.
 *
 * @see GEMAIN.H:121 MAXX=30
 * @see GEMAIN.H:122 MAXY=15
 * @see GECMDS.C:2681 xfactor / yfactor projection
 * @see GECMDS.C:2721 player centre at map[MAXY/2][MAXX/2]
 * @see specs/010-react-frontend/data-model.md §B.4 ScanMapState
 */
export function ScanMap({ cells, shipId = null }: ScanMapProps): React.JSX.Element {
  // Internal display state — cleared on sector transition, refreshed when cells prop changes
  const [displayCells, setDisplayCells] = useState<ScanCell[] | null>(cells);

  useEffect(() => {
    setDisplayCells(cells);
  }, [cells]);

  useEffect(() => {
    if (!shipId) return;

    const handleTransition = (payload: PhysicsSectorTransitionPayload) => {
      if (payload.shipId === shipId) setDisplayCells(null);
    };

    socket.on(PHYSICS_SECTOR_TRANSITION, handleTransition as (...args: unknown[]) => void);
    return () => {
      socket.off(PHYSICS_SECTOR_TRANSITION, handleTransition as (...args: unknown[]) => void);
    };
  }, [shipId]);

  // Build priority-resolved cell lookup: "x:y" → highest-priority ScanCell
  const cellMap = new Map<string, ScanCell>();
  for (const cell of displayCells ?? []) {
    const key = `${cell.x}:${cell.y}`;
    const existing = cellMap.get(key);
    const cellPrio = PRIORITY[cell.type] ?? 0;
    const existingPrio = existing != null ? (PRIORITY[existing.type] ?? 0) : -1;
    if (cellPrio > existingPrio) {
      cellMap.set(key, cell);
    }
  }

  const rows: React.JSX.Element[] = [];
  for (let y = 0; y < SCAN_GRID_HEIGHT; y++) {
    const cols: React.JSX.Element[] = [];
    for (let x = 0; x < SCAN_GRID_WIDTH; x++) {
      const cell = cellMap.get(`${x}:${y}`);
      const char = cell ? cell.char : ' ';
      const className = cell ? (CELL_CLASS[cell.type] ?? 'text-gray-400') : 'text-gray-600';
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
    <>
      <div className="border-b border-gray-800 px-3 py-1 flex-shrink-0">
        <span className="text-xs text-gray-500 uppercase tracking-widest">Sector Map</span>
      </div>
      <div
        className="font-mono text-xs bg-black p-2 overflow-auto"
        data-testid="scan-map"
      >
        {rows}
      </div>
    </>
  );
}
