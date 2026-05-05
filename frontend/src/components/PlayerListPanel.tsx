import type { ConnectedPlayer } from '../types/contracts';

interface PlayerListPanelProps {
  players: ConnectedPlayer[];
}

export function PlayerListPanel({ players }: PlayerListPanelProps) {
  return (
    <div data-testid="player-list-panel" className="font-mono text-sm overflow-y-auto">
      {players.map((p) => (
        <div
          key={p.shipId}
          data-testid={`player-row-${p.shipId}`}
          className="flex justify-between gap-2 px-1 py-0.5"
        >
          <span className="truncate">{p.name}</span>
          <span
            data-testid={`player-sector-${p.shipId}`}
            className="text-gray-400 shrink-0"
          >
            {p.sector.x},{p.sector.y}
          </span>
        </div>
      ))}
    </div>
  );
}
