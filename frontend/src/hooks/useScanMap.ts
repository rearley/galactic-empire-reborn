import { useEffect, useState } from 'react';
import { socket } from '../socket/socketClient';
import type { ScanCell, ScanRenderEvent } from '@ge/wire';

/**
 * Subscribes to `scan:render` socket events and keeps only the most recent
 * grid — the LIVE view fed to `<ScanMap>`. This is a peer of
 * `useScanRender`, which keeps an ordered history of cards for `<ScanPanel>`
 * from the same event; the two are separate consumers by design, not a
 * duplicated subscription.
 *
 * The sector map belongs to the hull that drew it, for the same reason the
 * SCAN DATA cards do. @see hooks/useScanRender
 */
export function useScanMap(
  shipId?: string | null,
): { cells: ScanCell[] | null; kind: ScanRenderEvent['kind'] | null } {
  const [cells, setCells] = useState<ScanCell[] | null>(null);
  // Which scan produced them — ScanMap needs it to decide whether a sector
  // crossing invalidates the view. Only `sca se` is sector-scoped.
  const [kind, setKind] = useState<ScanRenderEvent['kind'] | null>(null);

  /**
   * A new hull starts blind.
   *
   * Compared during render rather than reset in an effect: React's own recipe
   * for adjusting state when a prop changes, and it avoids the extra render an
   * effect-reset costs — the old shape painted the previous hull's grid once
   * before clearing it. @see issue #25
   */
  const [lastShipId, setLastShipId] = useState(shipId);
  if (shipId !== lastShipId) {
    setLastShipId(shipId);
    setCells(null);
    setKind(null);
  }

  useEffect(() => {
    const handleScanRender = (event: ScanRenderEvent) => {
      setCells(event.cells);
      setKind(event.kind);
    };
    socket.on('scan:render', handleScanRender);
    return () => { socket.off('scan:render', handleScanRender); };
  }, []);

  return { cells, kind };
}
