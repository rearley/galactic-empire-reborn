import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ScanPanel } from '../src/components/ScanPanel';
import type { ScanRenderEvent } from '../src/hooks/useScanRender';

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

const baseScanEvent: ScanRenderEvent = {
  kind: 'lo',
  mode: 'overwrite',
  cells: [
    { x: 5, y: 3, type: 'self', char: '*', colour: 'self' },
    { x: 10, y: 7, type: 'ship', char: 'A', colour: 'human' },
  ],
  header: 'Range: 450 — Sector 5,7',
};

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

    const headers = screen.getAllByTestId('scan-card-header');
    expect(headers[0].textContent).toBe('Scan 1');
    expect(headers[1].textContent).toBe('Scan 2');
    expect(headers[2].textContent).toBe('Scan 3');
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
  it('renders a 30-column × 15-row grid', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({ ...baseScanEvent, mode: 'overwrite' });
    });

    const grid = screen.getByTestId('scan-card-grid');
    // 15 rows
    const rows = grid.querySelectorAll('[data-testid^="scan-row-"]');
    expect(rows).toHaveLength(15);
    // Each row contains 30 spans (one per column)
    const firstRowSpans = rows[0].querySelectorAll('span');
    expect(firstRowSpans).toHaveLength(30);
  });

  // T012: header text is rendered
  it('renders the scan event header text', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({ ...baseScanEvent, mode: 'overwrite', header: 'Range: 450 — Sector 5,7' });
    });

    expect(screen.getByTestId('scan-card-header').textContent).toBe('Range: 450 — Sector 5,7');
  });

  // T012: self cell gets green colour
  it('self cell renders with self colour (#4ade80)', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({
        ...baseScanEvent,
        mode: 'overwrite',
        cells: [{ x: 5, y: 3, type: 'self', char: '*', colour: 'self' }],
      });
    });

    const cellEl = screen.getByTestId('scan-cell-5-3');
    expect(cellEl.textContent).toBe('*');
    expect((cellEl as HTMLElement).style.color).toBe('rgb(74, 222, 128)');
  });

  // T012: human ship cell gets blue colour
  it('human ship cell renders with human colour (#60a5fa)', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({
        ...baseScanEvent,
        mode: 'overwrite',
        cells: [{ x: 10, y: 7, type: 'ship', char: 'A', colour: 'human' }],
      });
    });

    const cellEl = screen.getByTestId('scan-cell-10-7');
    expect(cellEl.textContent).toBe('A');
    expect((cellEl as HTMLElement).style.color).toBe('rgb(96, 165, 250)');
  });

  // T012: ai ship cell gets red colour
  it('ai ship cell renders with ai colour (#f87171)', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({
        ...baseScanEvent,
        mode: 'overwrite',
        cells: [{ x: 2, y: 2, type: 'ship', char: 'B', colour: 'ai' }],
      });
    });

    const cellEl = screen.getByTestId('scan-cell-2-2');
    expect((cellEl as HTMLElement).style.color).toBe('rgb(248, 113, 113)');
  });

  // T012: planet cell gets yellow colour
  it('planet cell renders with planet colour (#facc15)', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({
        ...baseScanEvent,
        mode: 'overwrite',
        cells: [{ x: 15, y: 8, type: 'planet', char: '1', colour: 'planet' }],
      });
    });

    const cellEl = screen.getByTestId('scan-cell-15-8');
    expect((cellEl as HTMLElement).style.color).toBe('rgb(250, 204, 21)');
  });

  // T012: side panel renders when present
  it('renders side panel rows when sidePanel is present', () => {
    render(<ScanPanel />);

    act(() => {
      triggerScanRender({
        ...baseScanEvent,
        mode: 'overwrite',
        sidePanel: [
          { letter: 'A', distance: 120, bearing: 45, heading: 270, speedDisplay: 'Warp 4.5', name: 'Avenger' },
          { letter: 'B', distance: 300, bearing: 90, heading: 180, speedDisplay: 'Impulse' },
        ],
      });
    });

    expect(screen.getByTestId('scan-card-side-panel')).toBeDefined();
    expect(screen.getByTestId('side-panel-row-A')).toBeDefined();
    expect(screen.getByTestId('side-panel-row-B')).toBeDefined();

    const rowA = screen.getByTestId('side-panel-row-A');
    expect(rowA.textContent).toContain('120pc');
    expect(rowA.textContent).toContain('Brg:45');
    expect(rowA.textContent).toContain('Hdg:270');
    expect(rowA.textContent).toContain('Warp 4.5');
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
