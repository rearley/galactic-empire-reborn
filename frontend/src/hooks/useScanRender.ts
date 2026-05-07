import { useEffect, useState } from 'react';
import { socket } from '../socket/socketClient';

/**
 * A single cell on the scan:render grid.
 * @see specs/015-scan-modes/data-model.md §3
 * @see backend/src/game/commands/command.types.ts ScanCell
 */
export interface ScanCell {
  x: number;
  y: number;
  type: 'ship' | 'planet' | 'mine' | 'self' | 'wormhole';
  char: string;
  colour?: 'self' | 'human' | 'ai' | 'planet';
}

/**
 * A single row in the side panel legend of a scan display.
 * @see specs/015-scan-modes/data-model.md §3
 * @see backend/src/game/commands/command.types.ts SidePanelRow
 */
export interface SidePanelRow {
  letter: string;
  distance: number;
  bearing: number;
  heading: number;
  speedDisplay: string;
  name?: string;
}

/**
 * Structured scan render event received via `scan:render` socket event.
 * @see specs/015-scan-modes/contracts/scan-render.md §1
 * @see backend/src/game/commands/command.types.ts ScanRenderEvent
 */
export interface ScanRenderEvent {
  kind: 'ra' | 'se' | 'lo' | 'lo-full';
  mode: 'overwrite' | 'append';
  cells: ScanCell[];
  header: string;
  sidePanel?: SidePanelRow[];
}

/**
 * Subscribes to `scan:render` socket events and maintains an ordered list of
 * scan cards. A missing `scan:render` event means no update — the previous
 * cards remain visible.
 *
 * Mode semantics (per contract):
 * - `mode === 'overwrite'`: replace cards with `[newEvent]` (scanhome=on)
 * - `mode === 'append'`:    push newEvent onto cards (scanhome=off)
 *
 * @see specs/015-scan-modes/contracts/scan-render.md §1 Mode semantics
 */
export function useScanRender(): ScanRenderEvent[] {
  const [cards, setCards] = useState<ScanRenderEvent[]>([]);

  useEffect(() => {
    const handleScanRender = (event: ScanRenderEvent) => {
      if (event.mode === 'overwrite') {
        setCards([event]);
      } else {
        setCards((prev) => [...prev, event]);
      }
    };

    socket.on('scan:render', handleScanRender);
    return () => {
      socket.off('scan:render', handleScanRender);
    };
  }, []);

  return cards;
}
