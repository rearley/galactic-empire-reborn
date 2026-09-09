import type { ConnectedPlayer } from '../types/contracts';

interface PlayerListPanelProps {
  players: ConnectedPlayer[];
  /** f1..f12 command bindings at indices 0..11; '' means unbound. */
  fkeys?: string[];
}

export function PlayerListPanel({ players, fkeys = [] }: PlayerListPanelProps) {
  return (
    <div data-testid="player-list-panel" className="font-mono text-sm flex flex-col h-full">
      <div className="border-b border-gray-800 px-3 py-1 flex-shrink-0">
        <span className="text-xs text-gray-500 uppercase tracking-widest">Players</span>
      </div>
      <div className="overflow-y-auto flex-1">
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
            {/*
              * An em dash, not "null,null": a player outside your sector is a
              * name on the roster and nothing more. Position comes from `sca`,
              * which is range-gated and announces itself to the target.
              */}
            {p.sector ? `${p.sector.x},${p.sector.y}` : '—'}
          </span>
        </div>
      ))}
      </div>

      {/*
        * F KEY MAP — the port's typed function keys.
        *
        * PORT-ORIGINAL: canon kept these in the TERMINAL, so there is no
        * in-game panel to be faithful to. It sits here because the players
        * list is nearly empty in a small galaxy, and this is the one reference
        * a pilot wants visible while typing — the job a terminal's
        * function-key legend did. @see src/game/commands/fkeys.ts
        */}
      <div className="border-t border-gray-800 flex-shrink-0">
        <div className="px-3 py-1">
          <span className="text-xs text-gray-500 uppercase tracking-widest">F Key Map</span>
        </div>
        <div className="px-1 pb-2 font-mono text-xs whitespace-pre" data-testid="fkey-map">
          {fkeys.some((c) => c !== '')
            ? fkeys.map((cmd, i) =>
                cmd === '' ? null : (
                  <div key={i} data-testid={`fkey-row-f${i + 1}`}>
                    <span className="text-yellow-400">{`f${i + 1}`.padStart(4)}</span>
                    <span className="text-gray-300">{`  ${cmd}`}</span>
                  </div>
                ),
              )
            : <div className="text-gray-600">{'   fset f1 pha 0 0'}</div>}
        </div>
      </div>
    </div>

  );
}