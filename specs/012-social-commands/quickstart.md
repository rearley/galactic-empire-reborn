# Quickstart: Social and Information Commands

**Feature**: 012-social-commands
**Audience**: Developer wanting to verify the six new commands work end-to-end.

---

## Prerequisites

- Backend running locally (`npm run dev:backend` or `docker-compose up`).
- Frontend running locally (`npm run dev:frontend`) on the default port.
- At least two seeded human users with active ships (use the existing dev seeder
  or onboard via the new-player flow).
- Optionally: one team row created via direct DB insert (the `tea` command
  cannot create teams in this feature):

  ```sql
  INSERT INTO "Team" (teamcode, teamname, teamcount, teamscore)
  VALUES (10001, 'Pirates', 0, 0);
  ```

---

## 1. `who` — list active ships

Connect captain A and captain B. From A's terminal:

```
> who
  Shipname               Class                Sector  Kills
  Falcon-7               Fighter              ( 5, 7)      0
  Captain-A-Ship         Cruiser              ( 8, 4)      0
```

**Verify**:
- Both ships appear, sorted by `shipname` ascending case-insensitive.
- The caller's own ship is included.
- If captain B issues `cloak on` (when feature is available) and A re-runs `who`,
  B is gone from the list.

---

## 2. `dat` — inspect a ship

```
> dat fal
Ship: Falcon-7 (#1)
Class: Fighter    Team: —
Sector: (5,7)    Heading: 90    Speed: 0
Energy: 1000    Damage: 0    Kills: 0    Score: 0
Cargo:
  Men:    100    Missiles: 0    Torpedos: 0
  ...
```

**Verify**:
- Substring match works (`fal` finds `Falcon-7`).
- Case-insensitive (`FAL`, `falcon`, `Falcon` all match).
- All 14 cargo slots rendered.
- Cloaked target → `Ship not found.`
- Empty/no-arg → usage error.

---

## 3. `ros` — leaderboard

```
> ros
  Rank  UserID                Score      Kills  Planets  Population
     1  alice                 12345         12       3      450000
     2  bob                    9876          8       2      120000
  ...
```

**Verify**:
- Default cap is 20 rows (or `ROSTER_MAX` from env if set).
- `ros all` returns up to 200.
- AI userids (`Cybrg-*`, `@Droid-*`) absent regardless of their score.
- Order is `score DESC, kills DESC, userid ASC`.

---

## 4. `fre` then `sen` — chat

```
> fre a hail
Channel A set to hail.

> sen a Hello galaxy
Message sent on channel A.
```

Captain B's terminal should show the incoming message in their event log.

```
> fre b 5000
Channel B set to 5000 (sector-scoped).

> sen b Hi neighbor
Message sent on channel B.
```

**Verify**:
- Captain in same sector receives the message; captain in another sector does not.

```
> fre c 25000
Channel C set to 25000 (galaxy-wide).

> sen c Galaxy-wide hello
Message sent on channel C.
```

**Verify**:
- All connected ships receive the message regardless of sector.

**Negative paths**:
- `fre a 0` → usage error (only `hail` may set 0).
- `fre z 5000` → usage error.
- `sen a` (no message) → usage error.
- `sen a {201-character string}` → usage error, no broadcast.

---

## 5. `tea` — team affiliation

```
> tea
You are not on a team.

> tea Pirates
You have joined team Pirates.

> tea
You are on team Pirates.

> tea leave
You have left your team.

> tea NoSuchTeam
No such team: NoSuchTeam
```

**Verify**:
- After `tea Pirates`, the `User.teamcode` row in Postgres reflects the team's code.
- After `tea Pirates`, a `dat` on the caller's own ship shows `Team: Pirates`.
- After `tea leave`, both the User row and `dat` show no team.
- A `player.snapshot` event arrives at the caller's socket on each successful
  join or leave.

---

## 6. Persistence sanity check

After `fre a 12345`, wait > 1 second (longer than the SHIP_UPDATE flush heartbeat),
then query:

```sql
SELECT freq FROM "Ship" WHERE userid = 'alice' AND shipno = 1;
```

Result should include `12345` at index 0 (channel A).

After `tea Pirates`:

```sql
SELECT teamcode FROM "User" WHERE userid = 'alice';
```

Result should be `10001` (or whatever code Pirates was inserted with).

---

## What to look for if something is wrong

- `who` empty when ships are connected → `ConnectedShipsRegistry` may not be tracking them; check gateway `handleConnection` is calling `registry.upsert()`.
- `dat` always returns "ship not found" → confirm substring match logic and that the registry resolves to a `ShipState` (not a stale Prisma row).
- `sen` broadcast missing → check gateway is iterating `result.broadcasts` and calling `server.to(...).emit(...)`. Confirm sender's `freq[ch]` value.
- `ros` includes AI ships → confirm SQL filter strings match the actual seeded AI userid prefixes.
- `tea` join silently no-ops → confirm Prisma write is awaited and `ShipState.teamcode` is being mutated; check `dirty = true`.
