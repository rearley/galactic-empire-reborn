import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayerList } from '../src/state/usePlayerList';
import type { ConnectedPlayer, PlayerSnapshotPayload, PlayerJoinedPayload, PlayerLeftPayload, PhysicsSectorTransitionPayload } from '../src/types/contracts';

/**
 * Tests for the usePlayerList reducer hook (data-model.md §B.3, FR-016..FR-018).
 */
describe('usePlayerList', () => {
  const player1: ConnectedPlayer = {
    shipId: 'user1:1',
    name: 'Defiant',
    sector: { x: 5, y: 3 },
    shipClass: 3,
  };
  const player2: ConnectedPlayer = {
    shipId: 'user2:1',
    name: 'Enterprise',
    sector: { x: 10, y: 7 },
    shipClass: 5,
  };

  it('starts with an empty list', () => {
    const { result } = renderHook(() => usePlayerList());
    expect(result.current.players).toHaveLength(0);
  });

  it('SNAPSHOT replaces the entire player list', () => {
    const { result } = renderHook(() => usePlayerList());
    const payload: PlayerSnapshotPayload = { players: [player1, player2] };

    act(() => result.current.dispatch({ type: 'SNAPSHOT', payload }));

    expect(result.current.players).toHaveLength(2);
    expect(result.current.players.map((p) => p.shipId)).toContain('user1:1');
    expect(result.current.players.map((p) => p.shipId)).toContain('user2:1');
  });

  it('SNAPSHOT clears prior state before hydrating', () => {
    const { result } = renderHook(() => usePlayerList());
    act(() => result.current.dispatch({ type: 'SNAPSHOT', payload: { players: [player1] } }));
    act(() => result.current.dispatch({ type: 'SNAPSHOT', payload: { players: [player2] } }));

    expect(result.current.players).toHaveLength(1);
    expect(result.current.players[0].shipId).toBe('user2:1');
  });

  it('JOIN adds a new player (FR-024)', () => {
    const { result } = renderHook(() => usePlayerList());
    const payload: PlayerJoinedPayload = player1;
    act(() => result.current.dispatch({ type: 'JOIN', payload }));
    expect(result.current.players).toHaveLength(1);
    expect(result.current.players[0].shipId).toBe('user1:1');
  });

  it('JOIN overwrites existing entry for same shipId (last-write-wins, FR-025a)', () => {
    const { result } = renderHook(() => usePlayerList());
    act(() => result.current.dispatch({ type: 'JOIN', payload: player1 }));
    const updated: ConnectedPlayer = { ...player1, name: 'Defiant-II' };
    act(() => result.current.dispatch({ type: 'JOIN', payload: updated }));
    expect(result.current.players).toHaveLength(1);
    expect(result.current.players[0].name).toBe('Defiant-II');
  });

  it('LEFT removes the player by shipId (FR-025)', () => {
    const { result } = renderHook(() => usePlayerList());
    act(() => result.current.dispatch({ type: 'SNAPSHOT', payload: { players: [player1, player2] } }));
    const payload: PlayerLeftPayload = { shipId: 'user1:1' };
    act(() => result.current.dispatch({ type: 'LEFT', payload }));
    expect(result.current.players).toHaveLength(1);
    expect(result.current.players[0].shipId).toBe('user2:1');
  });

  it('LEFT is a no-op for unknown shipId (defensive)', () => {
    const { result } = renderHook(() => usePlayerList());
    act(() => result.current.dispatch({ type: 'SNAPSHOT', payload: { players: [player1] } }));
    act(() => result.current.dispatch({ type: 'LEFT', payload: { shipId: 'unknown:1' } }));
    expect(result.current.players).toHaveLength(1);
  });

  it('TRANSITION mutates sector for matching shipId (FR-026)', () => {
    const { result } = renderHook(() => usePlayerList());
    act(() => result.current.dispatch({ type: 'SNAPSHOT', payload: { players: [player1] } }));
    const payload: PhysicsSectorTransitionPayload = {
      transitions: [
        { shipId: 'user1:1', fromSector: { x: 5, y: 3 }, toSector: { x: 6, y: 3 } },
      ],
    };
    act(() => result.current.dispatch({ type: 'TRANSITION', payload }));
    expect(result.current.players[0].sector).toEqual({ x: 6, y: 3 });
  });

  it('TRANSITION ignores unknown shipId (out-of-order defensive, FR-026)', () => {
    const { result } = renderHook(() => usePlayerList());
    act(() => result.current.dispatch({ type: 'SNAPSHOT', payload: { players: [player1] } }));
    const payload: PhysicsSectorTransitionPayload = {
      transitions: [
        { shipId: 'ghost:1', fromSector: { x: 0, y: 0 }, toSector: { x: 1, y: 0 } },
      ],
    };
    expect(() =>
      act(() => result.current.dispatch({ type: 'TRANSITION', payload })),
    ).not.toThrow();
    expect(result.current.players).toHaveLength(1);
  });

  it('output is alphabetically sorted by name (FR-018)', () => {
    const { result } = renderHook(() => usePlayerList());
    const players = [
      { shipId: 'u3:1', name: 'Zephyr', sector: { x: 1, y: 1 }, shipClass: 1 },
      { shipId: 'u1:1', name: 'Albatross', sector: { x: 2, y: 2 }, shipClass: 2 },
      { shipId: 'u2:1', name: 'Meridian', sector: { x: 3, y: 3 }, shipClass: 3 },
    ];
    act(() => result.current.dispatch({ type: 'SNAPSHOT', payload: { players } }));
    const names = result.current.players.map((p) => p.name);
    expect(names).toEqual(['Albatross', 'Meridian', 'Zephyr']);
  });
});
