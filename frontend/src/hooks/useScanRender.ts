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
/**
 * How many SCAN DATA cards to keep.
 *
 * The list appended without any bound. `mode` is 'overwrite' only when the
 * player has SCANHOME on; the default is 'append', so every `sca` added a card
 * that was never removed — hundreds of live DOM blocks over an evening, each
 * carrying a full side panel, all re-rendered whenever a new one arrived.
 * The event log has capped at 500 since it was written; this had no equivalent.
 * @see test/scan-card-cap.spec.tsx
 */
export const MAX_SCAN_CARDS = 40;

/**
 * @param shipId  The hull currently boarded. Scan data belongs to the ship
 *   that gathered it — the backend keys its scantab `userid#shipno`, so a newly
 *   boarded hull starts blind. The display kept its cards across a switch, so a
 *   captain leaving a Stealth Fighter (200,000 scan range) for an Interceptor
 *   (100,000) still saw contacts the new hull cannot detect, rendered as if
 *   current. Stale scan data is worse than none: it is indistinguishable from a
 *   live reading. @see test/scan-resets-on-ship-change.spec.tsx
 */
export function useScanRender(shipId?: string | null): ScanRenderEvent[] {
  const [cards, setCards] = useState<ScanRenderEvent[]>([]);

  // Changing hull discards the previous hull's readings.
  useEffect(() => { setCards([]); }, [shipId]);

  useEffect(() => {
    const handleScanRender = (event: ScanRenderEvent) => {
      if (event.mode === 'overwrite') {
        setCards([event]);
      } else {
        setCards((prev) => [...prev, event].slice(-MAX_SCAN_CARDS));
      }
    };

    socket.on('scan:render', handleScanRender);
    return () => {
      socket.off('scan:render', handleScanRender);
    };
  }, []);

  return cards;
}
