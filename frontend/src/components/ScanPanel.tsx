import React from 'react';
import { useScanRender } from '../hooks/useScanRender';
import type { ScanRenderEvent } from '@ge/wire';

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

interface ScanCardProps {
  event: ScanRenderEvent;
}

/**
 * Renders a single scan card: header + 30×15 monospace grid + optional side panel.
 * @see specs/015-scan-modes/contracts/scan-render.md §1
 */
function ScanCard({ event }: ScanCardProps): React.JSX.Element {

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

      {/*
        * NO GRID HERE.
        *
        * ScanPanel was built (feature 015) to replace the older ScanMap, and
        * nobody removed ScanMap — App.tsx still says "legacy ScanMap ... + new
        * ScanPanel" and mounts both. They render the same cells from the same
        * event, so every `sca se` painted the identical picture twice: once in
        * SECTOR MAP, once inside the card. The card history then accumulated
        * several near-identical grids to scroll past, and the owner's reaction
        * was the honest one — "not sure what is what".
        *
        * Each panel now has ONE job:
        *   SECTOR MAP  the live view, always the most recent scan
        *   SCAN DATA   the readout — header and contact table, with history
        *
        * That keeps the scrollback worth having (two scans' numbers side by
        * side) without duplicating the picture.
        */}

      {/* Side panel legend — stacked below grid when present */}
      {event.sidePanel != null && event.sidePanel.length > 0 && (
        <div
          className="font-mono text-xs text-gray-300 mt-1 whitespace-pre"
          data-testid="scan-card-side-panel"
        >
          {/*
            * Canon's printmapfull table (GECMDS.C:3056-3075):
            *
            *   prf("  %c  %s   %4d    %4d    %s\r", letter, dist, bearing, heading, showarp(speed))
            *   ... and with SCANNAMES set, the NAME on its own line:
            *   prf("     %s\r", username(...))
            *
            * Canon can hand-align that because its table sits BESIDE the map,
            * one row per map line, under headers baked into PLUSFULL's top
            * border. We stack it underneath, so the header has to be built
            * from the same widths as the rows — writing it as a loose string
            * put the labels and the numbers on two different grids, which is
            * what made this unreadable.
            *
            * `Heading` is the RECIPROCAL bearing (where you are from HIM), so
            * a value near zero means his nose is on you. Abbreviated to Hdg
            * because the full word does not fit the column it labels.
            */}
          {(() => {
            const W = { ltr: 3, dist: 9, brg: 6, hdg: 6, spd: 7 };
            const pad = (v: string | number, n: number) => String(v).padStart(n);
            return (
              <>
                <div className="text-gray-500">
                  {pad('Shp', W.ltr) + pad('Distance', W.dist) + pad('Brg', W.brg)
                    + pad('Hdg', W.hdg) + pad('Speed', W.spd)}
                </div>
                {event.sidePanel.map((row) => (
                  <div key={row.letter} data-testid={`side-panel-row-${row.letter}`} className="mt-0.5">
                    <span className="text-yellow-400">{pad(row.letter, W.ltr)}</span>
                    <span>
                      {pad(row.distance, W.dist) + pad(row.bearing, W.brg)
                        + pad(row.heading, W.hdg) + pad(row.speedDisplay, W.spd)}
                    </span>
                    {row.name != null
                      ? <div className="text-gray-500">{' '.repeat(W.ltr + 1) + row.name}</div>
                      : null}
                  </div>
                ))}
              </>
            );
          })()}
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
interface ScanPanelProps {
  /**
   * Hull currently boarded. Scan data belongs to the ship that gathered it —
   * the readings are discarded when this changes. @see hooks/useScanRender
   */
  shipId?: string | null;
}

export function ScanPanel({ shipId = null }: ScanPanelProps): React.JSX.Element {
  const cards = useScanRender(shipId);

  return (
    <>
      <div className="border-b border-gray-800 px-3 py-1 shrink-0">
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
          {/*
            * Only scans that produce a READOUT get a card. `sca se` and plain
            * `sca lo` return cells and no sidePanel, so with the grid moved to
            * SECTOR MAP they had nothing left to render and posted an empty
            * header — three of them stacked up in the owner's screenshot.
            * Their feedback is the map itself plus the command line in the log.
            *
            * Tested on `!= null`, not on length: a readout mode that finds
            * NOTHING should still say so rather than vanish.
            */}
          {cards.slice().reverse().filter((c) => c.sidePanel != null).map((card) => (
            <ScanCard key={card.id} event={card} />
          ))}
        </div>
      )}
    </>
  );
}
