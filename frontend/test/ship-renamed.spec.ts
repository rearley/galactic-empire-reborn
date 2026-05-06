import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayerList } from '../src/state/usePlayerList';
import type { ConnectedPlayer, ShipRenamedPayload } from '../src/types/contracts';

/**
 * Tests for the RENAMED action in usePlayerList (T063, US3).
 * Verifies that a `ship.renamed` socket event updates the displayed ship name
 * without requiring a full player.snapshot refresh.
 */
describe('usePlayerList RENAMED action', () => {
  const player: ConnectedPlayer = {
    shipId: 'rick:1',
    name: 'Defiant',
    sector: { x: 5, y: 3 },
    shipClass: 3,
  };
  const other: ConnectedPlayer = {
    shipId: 'jane:1',
    name: 'Enterprise',
    sector: { x: 10, y: 7 },
    shipClass: 5,
  };

  it('RENAMED updates the name of the matching ship', () => {
    const { result } = renderHook(() => usePlayerList());
    act(() =>
      result.current.dispatch({ type: 'SNAPSHOT', payload: { players: [player, other] } }),
    );

    const payload: ShipRenamedPayload = {
      shipId: 'rick:1',
      oldName: 'Defiant',
      newName: 'Defiant-II',
    };
    act(() => result.current.dispatch({ type: 'RENAMED', payload }));

    const renamed = result.current.players.find((p) => p.shipId === 'rick:1');
    expect(renamed?.name).toBe('Defiant-II');
  });

  it('RENAMED does not affect other players', () => {
    const { result } = renderHook(() => usePlayerList());
    act(() =>
      result.current.dispatch({ type: 'SNAPSHOT', payload: { players: [player, other] } }),
    );

    act(() =>
      result.current.dispatch({
        type: 'RENAMED',
        payload: { shipId: 'rick:1', oldName: 'Defiant', newName: 'Defiant-II' },
      }),
    );

    const untouched = result.current.players.find((p) => p.shipId === 'jane:1');
    expect(untouched?.name).toBe('Enterprise');
  });

  it('RENAMED is a no-op for unknown shipId (defensive)', () => {
    const { result } = renderHook(() => usePlayerList());
    act(() =>
      result.current.dispatch({ type: 'SNAPSHOT', payload: { players: [player] } }),
    );

    act(() =>
      result.current.dispatch({
        type: 'RENAMED',
        payload: { shipId: 'ghost:1', oldName: 'Ghost', newName: 'Ghost-II' },
      }),
    );

    expect(result.current.players).toHaveLength(1);
    expect(result.current.players[0].name).toBe('Defiant');
  });

  it('RENAMED preserves all other fields on the renamed player', () => {
    const { result } = renderHook(() => usePlayerList());
    act(() =>
      result.current.dispatch({ type: 'SNAPSHOT', payload: { players: [player] } }),
    );

    act(() =>
      result.current.dispatch({
        type: 'RENAMED',
        payload: { shipId: 'rick:1', oldName: 'Defiant', newName: 'Predator' },
      }),
    );

    const renamed = result.current.players[0];
    expect(renamed.sector).toEqual({ x: 5, y: 3 });
    expect(renamed.shipClass).toBe(3);
    expect(renamed.shipId).toBe('rick:1');
  });

  it('sorted order is maintained after rename', () => {
    const { result } = renderHook(() => usePlayerList());
    act(() =>
      result.current.dispatch({ type: 'SNAPSHOT', payload: { players: [player, other] } }),
    );
    // Before rename: Defiant < Enterprise alphabetically
    expect(result.current.players[0].name).toBe('Defiant');

    // After rename to 'Zenith', order should flip
    act(() =>
      result.current.dispatch({
        type: 'RENAMED',
        payload: { shipId: 'rick:1', oldName: 'Defiant', newName: 'Zenith' },
      }),
    );

    const names = result.current.players.map((p) => p.name);
    expect(names).toEqual(['Enterprise', 'Zenith']);
  });
});
