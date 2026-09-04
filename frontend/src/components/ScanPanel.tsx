import React from 'react';
import { useScanRender } from '../hooks/useScanRender';
import type { ScanRenderEvent, ScanCell } from '../hooks/useScanRender';

export const SCAN_WIDTH = 30;
export const SCAN_HEIGHT = 15;

/**
 * Inline colour map for scan cell types.
 * Uses hex values matching Tailwind colour palette:
 *   self   → green-400  (#4ade80)
 *   human  → blue-400   (#60a5fa)
 *   ai     → red-400    (#f87171)
 *   planet → yellow-400 (#facc15)
 *
 * Inline styles are used instead of dynamic Tailwind class names because
 * Tailwind purges classes not present at build time.
 *
 * @see specs/015-scan-modes/plan.md §ScanPanel
 */
const COLOUR_MAP: Record<string, string> = {
  self: '#4ade80',
  human: '#60a5fa',
  ai: '#f87171',
  planet: '#facc15',
};

const DEFAULT_COLOUR = '#d1d5db'; // gray-300

interface GridCell {
  char: string;
  colour?: string;
}

/**
 * Builds a 15×30 grid of `{ char, colour? }` objects from a sparse cells array.
 * Empty positions are filled with ' ' (space) — the monospace pre renders them
 * as visible whitespace gaps without needing the '.' filler used by ScanMap.
 */
function buildGrid(cells: ScanCell[]): GridCell[][] {
  const grid: GridCell[][] = Array.from({ length: SCAN_HEIGHT }, () =>
    Array.from({ length: SCAN_WIDTH }, () => ({ char: ' ' })),
  );

  for (const cell of cells) {
    if (cell.x >= 0 && cell.x < SCAN_WIDTH && cell.y >= 0 && cell.y < SCAN_HEIGHT) {
      grid[cell.y][cell.x] = {
        char: cell.char,
        colour: cell.colour != null ? COLOUR_MAP[cell.colour] : undefined,
      };
    }
  }

  return grid;
}

interface ScanCardProps {
  event: ScanRenderEvent;
}

/**
 * Renders a single scan card: header + 30×15 monospace grid + optional side panel.
 * @see specs/015-scan-modes/contracts/scan-render.md §1
 */
function ScanCard({ event }: ScanCardProps): React.JSX.Element {
  const grid = buildGrid(event.cells);

  return (
    <div
      className="mb-2 border border-gray-700 bg-black p-2"
      data-testid="scan-card"
      data-kind={event.kind}
      data-mode={event.mode}
    >
      {/* Header */}
      <div
        className="mb-1 text-xs text-cyan-400 font-mono"
        data-testid="scan-card-header"
      >
        {event.header}
      </div>

      {/* 30×15 monospace grid */}
      <pre
        className="font-mono text-xs leading-tight m-0 whitespace-pre"
        data-testid="scan-card-grid"
      >
        {grid.map((row, y) => (
          <span key={y} data-testid={`scan-row-${y}`}>
            {row.map((cell, x) => (
              <span
                key={x}
                style={cell.colour != null ? { color: cell.colour } : { color: DEFAULT_COLOUR }}
                data-testid={cell.char !== ' ' ? `scan-cell-${x}-${y}` : undefined}
              >
                {cell.char}
              </span>
            ))}
            {'\n'}
          </span>
        ))}
      </pre>

      {/* Side panel legend — stacked below grid when present */}
      {event.sidePanel != null && event.sidePanel.length > 0 && (
        <div
          className="font-mono text-xs text-gray-300 mt-1"
          data-testid="scan-card-side-panel"
        >
          {event.sidePanel.map((row) => (
            <div key={row.letter} data-testid={`side-panel-row-${row.letter}`}>
              <span className="text-yellow-400">{row.letter}</span>
              {' '}
              {row.distance}
              {' '}
              Brg:{row.bearing}
              {' '}
              Hdg:{row.heading}
              {' '}
              {row.speedDisplay}
              {row.name != null ? ` ${row.name}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Renders the scan panel — a scrollable list of scan cards produced by
 * `useScanRender`. Each card corresponds to one `scan:render` socket event.
 *
 * Mount this adjacent to (not replacing) `ScanMap`. The component is inert
 * until the first `scan:render` event arrives.
 *
 * @see specs/015-scan-modes/contracts/scan-render.md §1
 * @see specs/015-scan-modes/plan.md §T012
 */
export function ScanPanel(): React.JSX.Element {
  const cards = useScanRender();

  return (
    <>
      <div className="border-b border-gray-800 px-3 py-1 flex-shrink-0">
        <span className="text-xs text-gray-500 uppercase tracking-widest">Scan Data</span>
      </div>
      {cards.length === 0 ? (
        <div
          className="font-mono text-xs text-gray-600 p-2"
          data-testid="scan-panel-empty"
        >
          No scan data
        </div>
      ) : (
        <div
          className="overflow-auto bg-black p-1"
          data-testid="scan-panel"
        >
          {cards.slice().reverse().map((card, idx) => (
            <ScanCard key={idx} event={card} />
          ))}
        </div>
      )}
    </>
  );
}
