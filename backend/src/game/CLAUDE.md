# Game engine — the three things this codebase keeps getting wrong

Scoped to `backend/src/game/`. The root `CLAUDE.md` carries the one-line rules;
this file carries the derivations, because each of these has been re-litigated
from memory and got the wrong answer.

## Module map

```
backend/src/game/
  tick/           ← TickService — drives the 1s and 6s game loops
  ship/           ← ShipStateService — in-memory state Map + async DB flush;
                    ShipTickService, MaintenanceService, ShipChannelRegistry
  planet/         ← PlanetStateService, PlanetEconomyService,
                    PlanetTickService, PlanetAttackService
  combat/         ← CombatTickService (phasors, torps, missiles, mines),
                    MineRegistry, MineRepository
  galaxy/         ← GalaxyService + procedural generator
  commands/       ← CommandRouterService — routes player text input to
                    handlers in commands/handlers/
  cybertron/      ← CybertronTickService + CybertronRepository
  droid/          ← DroidTickService + DroidSpawner
  midnight/       ← MidnightService — nightly maintenance cron
```

State lives in a NestJS service singleton (`Map<shipId, ShipState>`) and is the
source of truth during gameplay. Postgres is the durable store, flushed async.
**No Redis. No external cache layer.**

## 1. The two tick timers are not split the way you would guess

- **Ship update tick, 1 second** (`setInterval(…, 1000)`) — **movement**:
  rotate, accelerate, move, and the self-destruct countdown. Also energy regen
  and the DB flush.

  Canon runs these from `warrti2a`, registered on `TICKTIME2` (1s), striding the
  ship table by 3 (`zothusn += 3`, `clicker = (clicker+1)%3`), so **each ship
  moves once every 3 seconds** (`GEMAIN.C:2462-2493`).

- **Physics tick, 6 seconds** (`setInterval(…, 6000)` in `TickService`) —
  canon's `warrtia`: mines, flux, repair, shields (`shieldchg`), cloak,
  torpedo/missile/decoy flight (`checktm`, including the `hypha` and `cantexit`
  countdowns), ion cannons, phaser recharge and damage control.

- **Midnight job**, `@Cron('0 0 * * *')` — recalculate scores, send planet
  production reports, purge mail older than 3 days (`MAILDAYS`, GEMAIN.C:497 —
  7 is the clamp ceiling, not the default), rebuild team scores. Must be
  idempotent and wrapped in a Postgres transaction.

**This table used to have the two backwards on movement**, saying the 6-second
tick moves ships. `positionIntegration` carries canon's per-CALL displacement
with no `dt` term, so every ship flew at exactly HALF canon's speed, turned half
as fast, took twice as long to reach an ordered warp and twice as long to
self-destruct. The code was correct against the doc and wrong against canon; the
2026-09-05 audit found it.

If you are tempted to move something between these two timers, find it in
`GEMAIN.C` first. Canon's split is not intuitive: shields regenerate on the SLOW
tick, movement on the fast one.

## 2. `MAXX` and `MAXY` are not the size of the galaxy

They are the character dimensions of the ASCII scan map — `map[MAXY][MAXX]`,
centred with `map[MAXY/2][MAXX/2] = '*'` (`GECMDS.C:2569`), with the scan's range
divided across them as `xfactor = range/(MAXX-1.0)` (`GECMDS.C:2526-2527`). They
are a viewport. They never move.

The galaxy is a square running `-UNIVMAX..+UNIVMAX` on both axes
(`univmax = numopt(UNIVMAX,10,32767)`, `GEMAIN.C:474`). Canon's default is
**300**; we deploy at **100**, a deliberate deviation recorded in
`docs/DECISIONS.md`.

Anything expressed in sectors that must stay proportional to the world — scan
projection above all — is therefore **coupled to `UNIVMAX`** and has to move
with it.

Reading `MAXX`/`MAXY` as the galaxy is a mistake this project has now made
three times. It once capped every weapon gate at 7.5 sectors; in round 6 it
produced three false defect reports in one session; and it survived in the
`docs/PROGRESS.md` roadmap until 2026-09-09.

## 3. The starter target is the Vakory Drone, not the Scow

Two AI types, both driven entirely by the server tick with no client involvement:

- **Cybertrons** — persistent, saved to DB between sessions. Escalating
  difficulty based on player kill count (`CYB_BE_NICE=30`, `CYB_BE_EASY=60`).
  Skill variance (`cybskill`), accumulate gold, respect the neutral zone.
  See `GECYBS.C`.
- **Droids** — ephemeral, not persisted, respawn fresh. Classes 31 (Lydorian
  Garbage Scow), 32 (Murdonian Transport), 33 (Vakory Survey Drone). See
  `GEDROIDS.C`.

**This has been wrong twice.** It first called the Murdonian "a heavily armed
freighter that serves as a PvE target for new players"; it was then corrected to
the Scow, on arithmetic computed with `PFIRDST` 7 — a value taken from the stale
`GE/MSG/` copy of the option database. The shipped value is 5, and the answer
moves again.

Phaser damage is divided by `1.0 + max_tons/TONFACT`, `TONFACT 15000`
(GECMDS.C:962-969, GEMAIN.H:102), and shields absorb it whole (GECMDS.C:986-997
never touches `wptr->damage` in the SHIELDUP branch). What decides a fight is
therefore whether one shot strips more shield than the target regenerates before
your bank is hot again. `shieldchg` puts back `shieldtype*3` per tick
(GEFUNCS.C:2510) while `preload` is `phasrtype * PRELOAD` (GEFUNCS.C:1031), so a
Mark-1 fires every 36s and a Mark-2 every 18s.

At point-blank range, focus 1. The targets do NOT all carry the same shield: the
Scow and the Vakory are Mark-1 (`S31SHLD 1`, `S33SHLD 1`) but the Murdonian is
Mark-2 (`S32SHLD 2`, MBMGESHP.MSG:7146), so it regenerates twice as fast as the
other two. A table that assumes one shield for all three understates it.

| target | tons | shield | stock Mark-1 | with a Mark-2 |
|---|---|---|---|---|
| Vakory Survey Drone (33) | 100 | Mk-1 | strips 22 vs 18 regen — **wins** | — |
| Lydorian Scow (31) | 10,000 | Mk-1 | 12 vs 18 — **can never get through** | 19 vs 9 — wins |
| Murdonian Transport (32) | 30,000 | **Mk-2** | 6 vs 36 — hopeless | 9 vs 18 — still cannot strip it, and out-gunned 5:1 |

So a *stock* Interceptor cannot beat a Scow at any range or cadence, and the
Vakory is the only thing it can actually kill. One phaser upgrade (list 10,000,
~6,666 after trade-in) opens the Scow up. `hel combat` says all of this
in-world, without the table.

**Recompute this section from the code if `PFIRDST`, `PRELOAD`, `TONFACT` or the
shield constants ever move.** It has been wrong every time someone reasoned
about it from memory.

## WebSocket topology

One `GameGateway` using Socket.io. Players join a Socket.io room for their
current sector on entry, leave it and join the new one on warp or move. The
physics tick broadcasts sector-scoped events to relevant rooms only; global
events (kills, major announcements) go to all.

The tick layer MUST NOT import command handlers. Where both need the same logic,
it lives in a domain service — `MaintenanceService` is the worked example.
