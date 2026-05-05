# Quickstart — Feature 010 React Frontend

Verifies the terminal UI works end-to-end against a running backend.

## Prerequisites

- Node 20+
- Postgres running locally or via `docker compose up db`
- Repo bootstrapped (`backend/node_modules`, `frontend/node_modules` installed)
- A test ship exists for at least one userid (see `backend/test/fixtures`)

## 1. Boot backend

```bash
cd backend
npm run start:dev
```

Watch for:
- `[GameGateway] connection ...` log line on each socket connect
- `[ConnectedShipsRegistry]` upsert/remove logs
- One `physics.sector-transition` log line per physics tick that contains
  movement (silent ticks are silent)

## 2. Boot frontend

```bash
cd frontend
npm run dev
# open http://localhost:5173/?userid=<test-userid>
```

You should see:
- A dark monospace terminal
- Top: connection banner (hidden if connected, visible if not)
- Main left: scrolling event log with welcome line
- Main right: 30×15 ASCII sector map (initially all `.`)
- Side: player-list panel populated from `player.snapshot`
- Bottom: command input bar (focused)

## 3. Manual acceptance walk

| Step | Expected |
|------|----------|
| Type `scan`, press Enter | Log shows scan result lines; map renders cells |
| Up arrow, Enter | Re-runs `scan`; input clears |
| Type 21 commands; up-arrow 21 times | Only the most-recent 20 are recallable |
| Type empty space, Enter | Nothing submitted, no log entry |
| Open second tab to same userid | First tab disconnects; player-list shows one entry, not two |
| Stop backend (Ctrl-C in step 1) | Banner appears within ~3 s |
| Restart backend | Banner clears within ~30 s; commands work again |
| Open second browser as different userid | Both clients see each other in player-list |
| Warp the second ship | First client's player-list updates that ship's sector within one physics tick |
| Scroll up in the event log; new event arrives | Log does NOT auto-scroll; scroll back to bottom; auto-scroll resumes |

## 4. Run automated tests

```bash
cd backend && npm test          # Jest — must include new gateway + transition specs
cd ../frontend && npm test      # Vitest — must include all 003 + 010 specs
```

Both suites must be green. CI uses the same commands.

## 5. Cleanup

```bash
# nothing to clean — feature has no DB migrations and no persisted state
```

## Troubleshooting

- **Banner stuck on "Disconnected"**: check the backend is on the expected
  port and the `userid` query param is present in the URL.
- **Player-list empty**: confirm `player.snapshot` arrived in DevTools
  Network → WS frames; if missing, `handleConnection` errored before the
  emit — check backend log.
- **Map not updating after warp**: confirm `physics.sector-transition` is
  firing (backend log). If silent, the subscriber may not be wired to the
  tick — see `tick.module.ts`.
