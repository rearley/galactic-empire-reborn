import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket/socketClient';
// One declaration per wire contract — the frontend imports the same shapes the
// gateway emits. @see test/no-redeclared-wire-types.spec.ts
import type { ScanRenderEvent } from '@ge/wire';

/**
 * A scan card with a stable identity.
 *
 * `<ScanPanel>` renders the list REVERSED, so the array index of any given card
 * changes every time a new one arrives — React then re-renders every card and
 * can carry DOM state across to the wrong one. Same reason `useEventLog` stamps
 * its lines. @see issue #25
 */
export interface ScanCardEntry extends ScanRenderEvent {
  id: number;
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
export function useScanRender(shipId?: string | null): ScanCardEntry[] {
  const [cards, setCards] = useState<ScanCardEntry[]>([]);
  const nextCardId = useRef(0);

  // Changing hull discards the previous hull's readings. Compared during render
  // rather than reset in an effect, so the new hull never paints the old hull's
  // cards first. @see issue #25, hooks/useScanMap.ts
  const [lastShipId, setLastShipId] = useState(shipId);
  if (shipId !== lastShipId) {
    setLastShipId(shipId);
    setCards([]);
  }

  useEffect(() => {
    const handleScanRender = (event: ScanRenderEvent) => {
      const card: ScanCardEntry = { ...event, id: nextCardId.current++ };
      if (event.mode === 'overwrite') {
        setCards([card]);
      } else {
        setCards((prev) => [...prev, card].slice(-MAX_SCAN_CARDS));
      }
    };

    socket.on('scan:render', handleScanRender);
    return () => {
      socket.off('scan:render', handleScanRender);
    };
  }, []);

  return cards;
}
