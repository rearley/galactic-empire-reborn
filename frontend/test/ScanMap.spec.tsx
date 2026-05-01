import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScanMap } from '../src/components/ScanMap';
import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT } from '../src/types/contracts';
import type { ScanCell } from '../src/types/contracts';

describe('ScanMap', () => {
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
      { x: 5, y: 3, type: 'ship', char: '=' },
    ];
    render(<ScanMap cells={cells} />);
    expect(screen.getByTestId('cell-ship-5-3')).toBeDefined();
    expect(screen.getByTestId('cell-ship-5-3').textContent).toBe('=');
  });

  it('new payload fully replaces prior content (no stale cells)', () => {
    const { rerender } = render(
      <ScanMap cells={[{ x: 1, y: 1, type: 'ship', char: '=' }]} />,
    );
    rerender(<ScanMap cells={[{ x: 2, y: 2, type: 'planet', char: '@' }]} />);
    expect(screen.queryByTestId('cell-ship-1-1')).toBeNull();
    expect(screen.getByTestId('cell-planet-2-2')).toBeDefined();
  });

  it('null cells clears prior content', () => {
    const { rerender } = render(
      <ScanMap cells={[{ x: 0, y: 0, type: 'ship', char: '=' }]} />,
    );
    rerender(<ScanMap cells={null} />);
    expect(screen.queryByTestId('cell-ship-0-0')).toBeNull();
  });

  it('self cell receives distinct CSS class (differs from wormhole)', () => {
    const cells: ScanCell[] = [
      { x: 15, y: 7, type: 'self', char: '*' },
      { x: 5, y: 5, type: 'wormhole', char: '*' },
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
      <ScanMap cells={[{ x: 3, y: 3, type: 'ship', char: '+' }]} />,
    );
    rerender(<ScanMap cells={[]} />);
    expect(screen.queryByTestId('cell-ship-3-3')).toBeNull();
  });
});
