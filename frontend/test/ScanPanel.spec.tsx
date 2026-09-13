// Canon's side-panel row is a FIXED-WIDTH table under the PLUSFULL column
// labels (GECMDS.C:3061, MBMGEMSG.MSG:3683) — "  A     120     45     270",
// not "A 120 Brg:45 Hdg:270". The Brg:/Hdg: labels were ours.
// Canon's side-panel row prints the raw distance with NO unit:
// `prf("  %c  %s   %4d    %4d    %s\r", ...)` with spr("%ld",(long)dist)
// (GECMDS.C:3061). 'pc' was ours, and it labelled raw coordinate units as
// parsecs while the header used it for sectors — the same suffix 10 000x apart.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ScanPanel } from '../src/components/ScanPanel';
import type { ScanRenderEvent } from '@ge/wire';

// T011/T012/T013: mock socket so we can trigger scan:render in tests
const socketListeners = new Map<string, Set<(...args: unknown[]) => void>>();

vi.mock('../src/socket/socketClient', () => ({
  socket: {
    connected: false,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!socketListeners.has(event)) socketListeners.set(event, new Set());
      socketListeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      socketListeners.get(event)?.delete(handler);
    }),
    emit: vi.fn(),
  },
  sendCommand: vi.fn(),
  onCommandResult: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
}));

function triggerScanRender(payload: ScanRenderEvent): void {
  socketListeners.get('scan:render')?.forEach((h) => h(payload));
}

/**
 * A READOUT-producing scan. SCAN DATA now cards only modes that return a
 * sidePanel: `sca se` and plain `sca lo` return cells alone, and with the grid
 * moved to SECTOR MAP those posted an empty header. `sca lo full` and `sca ra`
 * are the modes with a table, so the base fixture carries one.
 */
const baseScanEvent: ScanRenderEvent = {
  kind: 'lo',
  mode: 'overwrite',
  cells: [
    { x: 5, y: 3, type: 'self', char: '*', colour: 'self' },
    { x: 10, y: 7, type: 'ship', char: 'A', colour: 'human' },
  ],
  header: '   Range Scan Dist:450 (s:5 7)',
  sidePanel: [
    { letter: 'A', distance: 450, bearing: 45, heading: 270, speedDisplay: '4.50' },
  ],
};

/**
 * The grid moved out.
 *
 * ScanPanel was built to REPLACE the older ScanMap and both stayed mounted, so
 * every scan painted the same picture twice — once in SECTOR MAP, once inside
 * the card — and the card history stacked near-identical grids. Each panel now
 * has one job: SECTOR MAP is the live view, SCAN DATA is the readout.
 *
 * The grid assertions that lived here (dimensions, per-type colour) are
 * ScanMap's, and ScanMap already covers them plus replacement, clearing,
 * overlap priority and sector transition.
 */
describe('ScanPanel', () => {
  beforeEach(() => socketListeners.clear());

  // T013: no scan:render event → panel shows empty state, not cleared
  it('renders empty state when no scan:render event has arrived', () => {
    render(<ScanPanel />);
    expect(screen.getByTestId('scan-panel-empty')).toBeDefined();
    expect(screen.queryByTestId('scan-card')).toBeNull();
  });

  // T013: missing scan:render leaves panel unchanged
  it('missing scan:render does not change panel after initial render', () => {
    render(<ScanPanel />);
    // No event fired — panel remains in empty state
    expect(screen.getByTestId('scan-panel-empty')).toBeDefined();
    expect(screen.queryByTestId('scan-panel')).toBeNull();
  });

  // T011/T013: overwrite mode replaces single card
  it('overwrite mode: first event renders exactly one card', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({ ...baseScanEvent, mode: 'overwrite' });
    });

    expect(screen.getAllByTestId('scan-card')).toHaveLength(1);
  });

  // T013: overwrite replaces — subsequent overwrite produces single card, not two
  it('overwrite mode: second overwrite event replaces the first card', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({ ...baseScanEvent, mode: 'overwrite', header: 'First scan' });
    });
    act(() => {
      triggerScanRender({ ...baseScanEvent, mode: 'overwrite', header: 'Second scan' });
    });

    const cards = screen.getAllByTestId('scan-card');
    expect(cards).toHaveLength(1);

    const headers = screen.getAllByTestId('scan-card-header');
    expect(headers[0].textContent).toBe('Second scan');
  });

  // T013: append produces multiple stacked cards
  it('append mode: produces multiple stacked cards', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({ ...baseScanEvent, mode: 'append', header: 'Scan 1' });
    });
    act(() => {
      triggerScanRender({ ...baseScanEvent, mode: 'append', header: 'Scan 2' });
    });
    act(() => {
      triggerScanRender({ ...baseScanEvent, mode: 'append', header: 'Scan 3' });
    });

    const cards = screen.getAllByTestId('scan-card');
    expect(cards).toHaveLength(3);

    // Newest scan renders on top — see commit 687275c ("newest scan on top").
    const headers = screen.getAllByTestId('scan-card-header');
    expect(headers[0].textContent).toBe('Scan 3');
    expect(headers[1].textContent).toBe('Scan 2');
    expect(headers[2].textContent).toBe('Scan 1');
  });

  // T011: overwrite after append replaces all cards
  it('overwrite after append: replaces all appended cards with single new card', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({ ...baseScanEvent, mode: 'append', header: 'Old 1' });
    });
    act(() => {
      triggerScanRender({ ...baseScanEvent, mode: 'append', header: 'Old 2' });
    });
    act(() => {
      triggerScanRender({ ...baseScanEvent, mode: 'overwrite', header: 'Fresh overwrite' });
    });

    const cards = screen.getAllByTestId('scan-card');
    expect(cards).toHaveLength(1);
    expect(screen.getByTestId('scan-card-header').textContent).toBe('Fresh overwrite');
  });

  // T012: grid dimensions — renders 30×15 grid

  // T012: header text is rendered
  it('renders the scan event header text', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({ ...baseScanEvent, mode: 'overwrite', header: 'Range: 450 — Sector 5,7' });
    });

    expect(screen.getByTestId('scan-card-header').textContent).toBe('Range: 450 — Sector 5,7');
  });

  // T012: self cell gets green colour

  // T012: human ship cell gets blue colour

  // T012: ai ship cell gets red colour

  // T012: planet cell gets yellow colour

  // T012: side panel renders when present
  it('renders side panel rows when sidePanel is present', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({
        ...baseScanEvent,
        mode: 'overwrite',
        sidePanel: [
          { letter: 'A', distance: 120, bearing: 45, heading: 270, speedDisplay: '4.50', name: 'Avenger' },
          { letter: 'B', distance: 300, bearing: 90, heading: 180, speedDisplay: 'Impulse' },
        ],
      });
    });

    expect(screen.getByTestId('scan-card-side-panel')).toBeDefined();
    expect(screen.getByTestId('side-panel-row-A')).toBeDefined();
    expect(screen.getByTestId('side-panel-row-B')).toBeDefined();

    const rowA = screen.getByTestId('side-panel-row-A');
    expect(rowA.textContent).toContain('120');
    expect(rowA.textContent).toMatch(/\s45\s/);
    expect(rowA.textContent).toMatch(/\s270\s/);
    expect(rowA.textContent).toContain('4.50');
    expect(rowA.textContent).toContain('Avenger');
  });

  // T012: side panel is absent when sidePanel is undefined
  it('does not render side panel when sidePanel is absent', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({ ...baseScanEvent, mode: 'overwrite', sidePanel: undefined });
    });

    expect(screen.queryByTestId('scan-card-side-panel')).toBeNull();
  });

  // T034: sca lo full renders kind:'lo-full' with side panel — including name field
  it('lo-full kind: renders side panel with name field when present', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({
        kind: 'lo-full',
        mode: 'overwrite',
        cells: [{ x: 15, y: 7, type: 'self', char: '*', colour: 'self' }],
        header: 'Range: 1000 — Sector 5,5',
        sidePanel: [
          { letter: 'A', distance: 42, bearing: 90, heading: 0, speedDisplay: '2.00', name: 'Avenger' },
          { letter: 'B', distance: 88, bearing: 270, heading: 180, speedDisplay: 'Stopped' },
        ],
      });
    });

    const card = screen.getByTestId('scan-card');
    expect((card as HTMLElement).dataset['kind']).toBe('lo-full');

    expect(screen.getByTestId('scan-card-side-panel')).toBeDefined();

    const rowA = screen.getByTestId('side-panel-row-A');
    expect(rowA.textContent).toContain('42');
    expect(rowA.textContent).toMatch(/\s90\s/);
    expect(rowA.textContent).toMatch(/\s0\s/);
    expect(rowA.textContent).toContain('2.00');
    expect(rowA.textContent).toContain('Avenger');

    const rowB = screen.getByTestId('side-panel-row-B');
    expect(rowB.textContent).toContain('88');
    expect(rowB.textContent).toContain('Stopped');
    // No name field on rowB
    expect(rowB.textContent).not.toContain('Avenger');
  });

  // T034: lo-full with no name field (SCANNAMES off) does not show name text
  it('lo-full kind: name field absent when undefined', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({
        kind: 'lo-full',
        mode: 'overwrite',
        cells: [{ x: 15, y: 7, type: 'self', char: '*', colour: 'self' }],
        header: 'Range: 1000 — Sector 5,5',
        sidePanel: [
          { letter: 'C', distance: 10, bearing: 45, heading: 90, speedDisplay: 'Impulse' },
        ],
      });
    });

    const rowC = screen.getByTestId('side-panel-row-C');
    expect(rowC.textContent).toContain('Impulse');
    // name is undefined → only trailing space rendered (no ship name text)
    expect(rowC.textContent?.trim()).not.toMatch(/\b[A-Za-z]{4,}\b.*\b[A-Za-z]{4,}\b/);
  });

  // T012: kind and mode metadata available on the card element
  it('card element exposes kind and mode as data attributes', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({ ...baseScanEvent, kind: 'ra', mode: 'overwrite' });
    });

    const card = screen.getByTestId('scan-card');
    expect((card as HTMLElement).dataset['kind']).toBe('ra');
    expect((card as HTMLElement).dataset['mode']).toBe('overwrite');
  });
});
