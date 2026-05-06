# Quickstart — 011-onboarding

End-to-end manual verification once `/speckit-implement` has run.

## Prereqs

- Backend and frontend running locally (`docker compose up` or equivalent).
- `JWT_SECRET` set in backend env.
- `prisma migrate dev` applied; `prisma db seed` run so `ShipClass` is populated.

## Path 1 — First-time player (US1)

1. Open the frontend in a fresh browser profile (no `localStorage` token).
2. The app shows the auth screen. Click **Register**.
3. Submit username `Goliath`, password `correctbattery`. Expect HTTP 201 and
   a stored JWT. The terminal UI loads automatically.
4. The terminal displays the class list (rendered from `prompt:class-list`).
5. Type the class number (e.g. `1` for Tugboat) and submit.
6. The terminal prompts for a ship name. Submit `Falcon`.
7. The terminal welcomes you (`Welcome aboard, Falcon.`).
8. Issue `report` — expect a normal status block. Issue `scan` — expect the
   sector map. The ship is at the neutral-zone origin.

## Path 2 — Returning player (US2)

1. Reload the browser. The JWT from step 3 above is still in `localStorage`.
2. The terminal UI loads directly (no auth screen, no class list).
3. The welcome line shows `Welcome aboard, Falcon.` immediately.
4. `report` shows the same sector and loadout as before disconnect.

## Path 3 — Rename (US3)

1. With Path 2 active, open a second browser profile and create a second
   account (`Trader` / any password). Pick any class, ship name `Hawk`.
   Move `Hawk` to the same sector as `Falcon` (or just leave both at origin).
2. In `Falcon`'s terminal, run `rename Phoenix`.
3. Expect a `command:result` confirmation. The `Hawk` terminal shows the
   `ship.renamed` event reflected in the player list / sector view as
   `Phoenix` (old name `Falcon`).
4. Run `rename Hawk` from `Falcon`'s terminal — expect a "name taken"
   error and no state change.

## Path 4 — Latest-wins single session

1. With Path 2 active in browser A, paste the same JWT into browser B's
   `localStorage` and connect.
2. Browser A is disconnected with a `SESSION_REPLACED` error.
3. Browser B continues normally; the sector / player snapshot reflects a
   single bound socket.

## Path 5 — Disconnect mid-onboarding (edge case)

1. Open a new browser profile and register account `Tester`.
2. The class list appears. Close the tab without submitting.
3. Reopen the tab. The same class list appears (no orphan `Ship` or
   `User`-without-ship-and-no-onboarding-state in DB).

## Path 6 — Concurrent name claim (SC-004)

(Manual test optional — covered by integration test
`onboarding/race-uniqueness.spec.ts`.) Hammer 10 concurrent `cmd_new`
finalize requests with the same ship name; exactly one succeeds, nine
receive a `name-taken` re-prompt.

## Smoke checks

- `curl -X POST http://localhost:3000/auth/register -H 'Content-Type: application/json' -d '{"username":"abc"}'`
  → 400 `INVALID_PASSWORD`.
- `curl ... /auth/login` with bad credentials → 401 `INVALID_CREDENTIALS`
  with response time ≥ ~250 ms (constant-time bcrypt path is exercised).
- Connect to the WebSocket without an `auth.token` → server emits
  `error { code: 'AUTH_REQUIRED' }` and disconnects.
