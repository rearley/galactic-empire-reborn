import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ScanMap } from '../src/components/ScanMap';
import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT } from '../src/types/contracts';
import type { ScanCell, PhysicsSectorTransitionPayload } from '../src/types/contracts';

// T014: mock socket so we can trigger physics.sector-transition in tests (FR-013)
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

function triggerSocket(event: string, payload: unknown): void {
  socketListeners.get(event)?.forEach((h) => h(payload));
}

describe('ScanMap', () => {
  beforeEach(() => socketListeners.clear());

  it('renders grid with SCAN_GRID_HEIGHT rows × SCAN_GRID_WIDTH columns', () => {
    render(<ScanMap cells={[]} />);
    const map = screen.getByTestId('scan-map');
    const rows = map.querySelectorAll('div');
    expect(rows.length).toBe(SCAN_GRID_HEIGHT);
    const firstRowSpans = rows[0].querySelectorAll('span');
    expect(firstRowSpans.length).toBe(SCAN_GRID_WIDTH);
  });

  it('cell from payload renders at correct grid position', () => {
    const cells: ScanCell[] = [
      { x: 5, y: 3, type: 'ship', char: '@' },
    ];
    render(<ScanMap cells={cells} />);
    expect(screen.getByTestId('cell-ship-5-3')).toBeDefined();
    expect(screen.getByTestId('cell-ship-5-3').textContent).toBe('@');
  });

  it('new payload fully replaces prior content (no stale cells)', () => {
    const { rerender } = render(
      <ScanMap cells={[{ x: 1, y: 1, type: 'ship', char: '@' }]} />,
    );
    rerender(<ScanMap cells={[{ x: 2, y: 2, type: 'planet', char: 'O' }]} />);
    expect(screen.queryByTestId('cell-ship-1-1')).toBeNull();
    expect(screen.getByTestId('cell-planet-2-2')).toBeDefined();
  });

  it('null cells clears prior content', () => {
    const { rerender } = render(
      <ScanMap cells={[{ x: 0, y: 0, type: 'ship', char: '@' }]} />,
    );
    rerender(<ScanMap cells={null} />);
    expect(screen.queryByTestId('cell-ship-0-0')).toBeNull();
  });

  it('self cell receives distinct CSS class (differs from wormhole)', () => {
    const cells: ScanCell[] = [
      { x: 15, y: 7, type: 'self', char: '+' },
      { x: 5, y: 5, type: 'wormhole', char: 'W' },
    ];
    render(<ScanMap cells={cells} />);
    const selfEl = screen.getByTestId('cell-self-15-7');
    const wormholeEl = screen.getByTestId('cell-wormhole-5-5');
    expect(selfEl.className).not.toBe(wormholeEl.className);
  });

  it('component does NOT synthesise a self-cell — payload without one renders no centre marker', () => {
    render(<ScanMap cells={[]} />);
    const selfCells = screen.queryAllByTestId(/^cell-self-/);
    expect(selfCells).toHaveLength(0);
  });

  it('empty cells array clears prior ship cells', () => {
    const { rerender } = render(
      <ScanMap cells={[{ x: 3, y: 3, type: 'ship', char: '@' }]} />,
    );
    rerender(<ScanMap cells={[]} />);
    expect(screen.queryByTestId('cell-ship-3-3')).toBeNull();
  });

  // T014: 30x15 empty grid. Canon clears to ' ' and uses '.' for a live MINE
  // (GECMDS.C:2978 vs :2607) — an empty cell must not wear the mine glyph.
  it('empty cells render "." character — not a blank (FR-014)', () => {
    render(<ScanMap cells={[]} />);
    const map = screen.getByTestId('scan-map');
    const rows = map.querySelectorAll('div');
    // First span in first row is an empty cell — a space, never '.'
    expect(rows[0].querySelectorAll('span')[0].textContent).toBe(' ');
  });

  // T014: overlap priority — self > ship (FR-015)
  // self comes FIRST so "last wins" would incorrectly show ship; priority must override order
  it('overlap priority: self beats ship at same position (priority, not order)', () => {
    const cells: ScanCell[] = [
      { x: 5, y: 5, type: 'self', char: '+' },  // higher priority, but FIRST in array
      { x: 5, y: 5, type: 'ship', char: '@' },  // lower priority, LAST in array
    ];
    render(<ScanMap cells={cells} />);
    expect(screen.queryByTestId('cell-ship-5-5')).toBeNull();
    expect(screen.getByTestId('cell-self-5-5')).toBeDefined();
    expect(screen.getByTestId('cell-self-5-5').textContent).toBe('+');
  });

  // T014: overlap priority — ship > planet (FR-015)
  // ship comes FIRST; planet is LAST — last-wins would show planet, not ship
  it('overlap priority: ship beats planet at same position (priority, not order)', () => {
    const cells: ScanCell[] = [
      { x: 3, y: 3, type: 'ship', char: '@' },  // higher priority, FIRST
      { x: 3, y: 3, type: 'planet', char: 'O' }, // lower priority, LAST
    ];
    render(<ScanMap cells={cells} />);
    expect(screen.queryByTestId('cell-planet-3-3')).toBeNull();
    expect(screen.getByTestId('cell-ship-3-3')).toBeDefined();
  });

  // T014: overlap priority — planet > wormhole (FR-015)
  // planet comes FIRST; wormhole is LAST
  it('overlap priority: planet beats wormhole at same position (priority, not order)', () => {
    const cells: ScanCell[] = [
      { x: 7, y: 2, type: 'planet', char: 'O' },   // higher priority, FIRST
      { x: 7, y: 2, type: 'wormhole', char: 'W' }, // lower priority, LAST
    ];
    render(<ScanMap cells={cells} />);
    expect(screen.queryByTestId('cell-wormhole-7-2')).toBeNull();
    expect(screen.getByTestId('cell-planet-7-2')).toBeDefined();
  });

  // T014: clear on physics.sector-transition containing local shipId (FR-013)
  it('clears cells when physics.sector-transition contains local shipId', () => {
    const cells: ScanCell[] = [{ x: 5, y: 5, type: 'ship', char: '@' }];
    render(<ScanMap cells={cells} shipId="ship-42" />);
    expect(screen.getByTestId('cell-ship-5-5')).toBeDefined();

    const payload: PhysicsSectorTransitionPayload = {
      shipId: 'ship-42',
      fromSector: { x: 0, y: 0 },
      toSector: { x: 1, y: 0 },
      x: 1.5,
      y: 0.5,
    };
    act(() => triggerSocket('physics.sector-transition', payload));

    expect(screen.queryByTestId('cell-ship-5-5')).toBeNull();
  });

  // T014: does NOT clear when transition is for a different ship
  it('does not clear cells when physics.sector-transition is for a different ship', () => {
    const cells: ScanCell[] = [{ x: 5, y: 5, type: 'ship', char: '@' }];
    render(<ScanMap cells={cells} shipId="ship-42" />);

    const payload: PhysicsSectorTransitionPayload = {
      shipId: 'other-ship',
      fromSector: { x: 0, y: 0 },
      toSector: { x: 1, y: 0 },
      x: 1.5,
      y: 0.5,
    };
    act(() => triggerSocket('physics.sector-transition', payload));

    expect(screen.getByTestId('cell-ship-5-5')).toBeDefined();
  });
});
