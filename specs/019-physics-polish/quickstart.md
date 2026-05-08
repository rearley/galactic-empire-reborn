# Quickstart — Physics Polish (manual smoke test)

This walks through verifying every FR cluster against a running dev stack. Assumes
backend + frontend up via Docker Compose, two browser sessions logged in as `pilot1`
and `pilot2`.

## Setup

```bash
docker compose up --build
# in another terminal
cd backend && npm run prisma:migrate -- deploy   # no new migrations expected
```

Confirm `score_f2 = 100` is loaded:

```bash
curl -s http://localhost:3000/health/config | jq .scoreF2
# → 100
```

## US1 — Universe wrap (FR-001, FR-002)

Pilot1, in a high-warp ship near the east edge:

```
warp 9
rot 90    # face east
```

Wait until x crosses MAXX. Expected: ship reappears at x≈0, sector-transition event
fires once on the post-wrap sector. Pilot2 in sector (0, current_y) sees the arrival
event. Heading, speed, cargo, and any active locks remain unchanged.

Repeat for north (rot 0), south (rot 180), west (rot 270), and a diagonal
(rot 45 from corner) to confirm both axes wrap on the same tick.

## US2 — Overspeed damage (FR-003, FR-004)

Pilot1 in a topspeed=8 hull:

```
warp 13
```

Watch the event log over ~1–2 minutes. Expected sequence:
1. `WARPFAST` warnings escalate as `warncntr` increments.
2. Once `warncntr > 4`, the next lottery-hit tick produces a `WARPBRK` event,
   topspeed snaps to 0, ship coasts to a stop, and hull damage rises by 0–19.
3. Drop to a safe warp (`warp 4`); `WARPSPD` fires once and `topspeed` settles
   to a reduced value (`old_topspeed / final_warncntr`).

## US3 — Auto-repair (FR-005)

```
set auto-repair on
```

Take damage (e.g., let a Cybertron hit you, or use the dev `/debug/damage` endpoint).
Within one ship-update tick:
- repair queued exactly as if `maint` were typed
- cash deducted
Toggle `set auto-repair off` and confirm no further charges land on the next damage.

Negative cases: in NZ (non-Zygor), in combat lock, or with insufficient cash → no
charge, no repair queued.

## US4 — Auto-shield (FR-006)

```
set auto-shield on
shi off
warp 3
warp 0    # warp exit
```

Expected: shields raise on the next ship-update tick after warp exit.

```
shi off
tor <target>
```

Expected: shields raise on the next ship-update tick after the self-fired torpedo,
provided no combat lock active. With a lock present, shields stay down.

## US5 — AI kill scoring (FR-007, FR-008, FR-008a)

Pre-conditions: spawn a Cybertron via `/debug/cyb/spawn` near pilot1; record
`pilot1.klscore` and `pilot1.score` from `/debug/user/<userid>`.

Let Cybertron destroy pilot1. Expected:
- `pilot1.klscore` decremented by `floor(((scr) / 100) * score_f2 / 10)` where
  `scr = max_points + bonus` from the ship class. For default `score_f2=100`,
  the deduction equals `scr / 10` rounded down.
- `pilot1.score` decremented by the same amount.
- Cybertron's persisted `kills` count incremented (verify in DB).

Repeat with a Droid (e.g., spawn the Murdonian Transport via `/debug/droid/spawn`).
Expected:
- Same victim deduction as the Cybertron case.
- Droid attacker `kills` NOT persisted (no `@Droid-N` row should grow).

PvP regression: pilot1 vs pilot2 kill produces the *un-reduced* deduction
(`floor(scr/100 * score_f2)`), confirming the AI 1/10 only applies on AI attacker.

Mutual-kill: configure two AI ships to fire on each other simultaneously
(deterministic seed). When the killing AI dies on the same tick, victim klscore
still updates correctly (mutual-kill snapshot fix).

## US6 — Droid presence bridge (FR-009, FR-010, FR-011)

Pilot1 + pilot2 connect to the same sector. `/debug/droid/spawn` a class-10 droid
into that sector.

Expected:
- Both pilots see the droid in their sector roster within one event tick.
- Roster entry tagged ephemeral (frontend marker visible in dev tools).

`/debug/droid/kill <id>`:
- Both pilots see the droid disappear from the sector roster.
- A global kill notification reaches all connected sockets.

DB invariant check:
```bash
psql ... -c "select userid from \"User\" where userid like '@Droid-%';"
# → 0 rows
```

## Pass criteria

All six story flows above produce the documented outcomes. Existing automated
balance regression tests for `MAXX`, `MAXY`, `TICKTIME`, `TICKTIME2`, plus a new
regression for `score_f2 = 100`, all green.
