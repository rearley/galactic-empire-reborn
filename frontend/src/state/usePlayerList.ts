import { useReducer } from 'react';
import type {
  ConnectedPlayer,
  PlayerSnapshotPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PhysicsSectorTransitionPayload,
  ShipRenamedPayload,
} from '../types/contracts';

type Action =
  | { type: 'SNAPSHOT'; payload: PlayerSnapshotPayload }
  | { type: 'JOIN'; payload: PlayerJoinedPayload }
  | { type: 'LEFT'; payload: PlayerLeftPayload }
  | { type: 'TRANSITION'; payload: PhysicsSectorTransitionPayload }
  | { type: 'RENAMED'; payload: ShipRenamedPayload };

type State = Map<string, ConnectedPlayer>;

function sortedPlayers(map: State): ConnectedPlayer[] {
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SNAPSHOT': {
      const next = new Map<string, ConnectedPlayer>();
      for (const p of action.payload.players) next.set(p.shipId, p);
      return next;
    }
    case 'JOIN': {
      const next = new Map(state);
      next.set(action.payload.shipId, action.payload);
      return next;
    }
    case 'LEFT': {
      const next = new Map(state);
      next.delete(action.payload.shipId);
      return next;
    }
    case 'TRANSITION': {
      const next = new Map(state);
      const existing = next.get(action.payload.shipId);
      if (existing) next.set(action.payload.shipId, { ...existing, sector: action.payload.toSector });
      return next;
    }
    case 'RENAMED': {
      const next = new Map(state);
      const existing = next.get(action.payload.shipId);
      if (existing) next.set(action.payload.shipId, { ...existing, name: action.payload.newName });
      return next;
    }
  }
}

export interface UsePlayerListReturn {
  players: ConnectedPlayer[];
  dispatch: React.Dispatch<Action>;
}

export function usePlayerList(): UsePlayerListReturn {
  const [state, dispatch] = useReducer(reducer, new Map<string, ConnectedPlayer>());
  return { players: sortedPlayers(state), dispatch };
}
