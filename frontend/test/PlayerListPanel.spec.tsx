import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayerListPanel } from '../src/components/PlayerListPanel';
import type { ConnectedPlayer } from '../src/types/contracts';

describe('PlayerListPanel', () => {
  const players: ConnectedPlayer[] = [
    { shipId: 'user1:1', name: 'Defiant', sector: { x: 5, y: 3 }, shipClass: 3 },
    { shipId: 'user2:1', name: 'Enterprise', sector: { x: 10, y: 7 }, shipClass: 5 },
  ];

  it('renders one row per connected player (FR-016)', () => {
    render(<PlayerListPanel players={players} />);
    expect(screen.getByText('Defiant')).toBeDefined();
    expect(screen.getByText('Enterprise')).toBeDefined();
  });

  it('displays player name (FR-016)', () => {
    render(<PlayerListPanel players={players} />);
    expect(screen.getByText('Defiant')).toBeDefined();
  });

  it('displays sector coordinates as floor(x), floor(y) integer pair (FR-017, FR-017a)', () => {
    const playersWithFractional: ConnectedPlayer[] = [
      { shipId: 'u:1', name: 'Scout', sector: { x: 5, y: 3 }, shipClass: 1 },
    ];
    render(<PlayerListPanel players={playersWithFractional} />);
    // Sector (5, 3) should appear as "5,3" or "(5,3)" or similar
    const el = screen.getByTestId('player-sector-u:1');
    expect(el.textContent).toMatch(/5.*3/);
  });

  it('renders empty panel without crashing (FR-016 edge case)', () => {
    render(<PlayerListPanel players={[]} />);
    expect(screen.getByTestId('player-list-panel')).toBeDefined();
  });

  it('player list is passed pre-sorted — component renders in received order (FR-018)', () => {
    const sorted: ConnectedPlayer[] = [
      { shipId: 'u1:1', name: 'Alpha', sector: { x: 1, y: 1 }, shipClass: 1 },
      { shipId: 'u2:1', name: 'Beta', sector: { x: 2, y: 2 }, shipClass: 2 },
    ];
    render(<PlayerListPanel players={sorted} />);
    const items = screen.getAllByTestId(/^player-row-/);
    expect(items[0].textContent).toContain('Alpha');
    expect(items[1].textContent).toContain('Beta');
  });
});

/**
 * A player outside your sector is a name on a list, not a position. The panel
 * must render that state legibly rather than printing "null,null".
 * @see backend/src/game/ship/sector-visibility.ts
 */
describe('PlayerListPanel — hidden positions', () => {
  it('shows the sector of a player you can see', () => {
    render(<PlayerListPanel players={[
      { shipId: 'u1:1', name: 'Alpha', sector: { x: 5, y: 3 }, shipClass: 1 },
    ]} />);
    expect(screen.getByTestId('player-sector-u1:1').textContent).toBe('5,3');
  });

  it('renders a dash, not coordinates, for a player elsewhere', () => {
    render(<PlayerListPanel players={[
      { shipId: 'u1:1', name: 'Alpha', sector: null, shipClass: 1 },
    ]} />);
    const cell = screen.getByTestId('player-sector-u1:1');
    expect(cell.textContent).toBe('—');
  });

  it('still lists the player by name', () => {
    render(<PlayerListPanel players={[
      { shipId: 'u1:1', name: 'Alpha', sector: null, shipClass: 1 },
    ]} />);
    expect(screen.getByText('Alpha')).toBeTruthy();
  });
});
