# Quickstart — 009 Midnight Maintenance Job

Manual verification recipe for an operator/developer.

## Prerequisites

- Backend running locally against the dev Postgres container
  (`docker compose up -d` from repo root, then `cd backend && npm
  run start:dev`).
- Migration `add_midnight_run` applied (`prisma migrate dev` runs
  this automatically on dev start).

## Environment Variables

Add to `backend/.env` (or your shell environment):

```bash
# Required for the manual admin endpoint. Choose any non-empty string.
MIDNIGHT_ADMIN_TOKEN=devtoken

# Optional overrides — defaults match the C source.
MIDNIGHT_MAILDAYS=7         # range 1-30
MIDNIGHT_CHGLOSER=100       # range 0-100 (PvP cash penalty percent)
```

If `MIDNIGHT_ADMIN_TOKEN` is unset, the admin endpoint responds 503 and
fail-closes — the cron and startup self-heal paths still work without it.

## Seed a Tiny Fixture

```bash
psql $DATABASE_URL <<'SQL'
-- Two players, two planets each, two mail rows, one team
INSERT INTO "User" (userid, klscore) VALUES
  ('alice', 12000),
  ('bob',   3000);

INSERT INTO "Planet" (xsect, ysect, plnum, type, userid, name, cash, tax, debt, items)
VALUES
  (5, 7, 1, 1, 'alice', 'Alpha-1', 100000, 5000, 0, '{...}'),
  (6, 8, 1, 1, 'alice', 'Alpha-2', 200000, 7000, 1000, '{...}'),
  (3, 4, 1, 1, 'bob',   'Beta-1',  50000,  1000, 0, '{...}'),
  (4, 4, 1, 1, 'bob',   'Beta-2',  80000,  2000, 0, '{...}');

INSERT INTO "Team" (teamcode, teamname, teamcount, teamscore)
VALUES (5, 'Federation', 0, 0);

UPDATE "User" SET teamcode = 5 WHERE userid IN ('alice', 'bob');

-- Two mail rows: one fresh, one stale
INSERT INTO "Mail" (userid, class, msgno, stamp, topic) VALUES
  ('alice', 1, 1001, EXTRACT(EPOCH FROM NOW())::int,                     'Recent'),
  ('alice', 1, 1002, EXTRACT(EPOCH FROM NOW() - INTERVAL '10 days')::int, 'Stale');
SQL
```

## Trigger the Pass Manually

```bash
curl -i -X POST http://localhost:3000/admin/midnight/run \
  -H 'Authorization: Bearer devtoken'
```

Expected `202 Accepted` response with body:

```json
{
  "status": "completed",
  "date": "2026-05-05",
  "durationMs": 42,
  "counters": {
    "usersUpdated": 2,
    "planetsProcessed": 4,
    "mailReportsCreated": 4,
    "mailDeleted": 1,
    "teamsReconciled": 1,
    "teamsRemoved": 0
  }
}
```

## Verify Side Effects

```bash
psql $DATABASE_URL <<'SQL'
-- (a) Per-user score recalc
SELECT userid, score, plscore, klscore, planets, rospos FROM "User"
 WHERE userid IN ('alice', 'bob');
-- alice: plscore = sum of net-worth(Alpha-1, Alpha-2); score = plscore + 12000; planets = 2; rospos = 1
-- bob:   plscore = sum of net-worth(Beta-1, Beta-2);   score = plscore + 3000;  planets = 2; rospos = 2

-- (b) Production-report mail
SELECT userid, class, name1, int1, int2, cash FROM "MailStat"
 WHERE class = 3 ORDER BY userid, name1;
-- 4 rows: one per owned planet, addressed to the owner

-- (c) Mail purge
SELECT topic FROM "Mail" WHERE userid = 'alice';
-- only 'Recent' remains; 'Stale' deleted

-- (d) Team reconciliation
SELECT teamcode, teamcount, teamscore FROM "Team" WHERE teamcode = 5;
-- teamcount = 2; teamscore = (3_200_000 + alice.score/2) + (3_200_000 + bob.score/2)
--                          = 2 * TEAMBONU + (alice.score + bob.score) / 2
-- TEAMBONU is added once per member (GEMAIN.C:1275 is inside the per-user loop)

-- (e) Ledger
SELECT * FROM "MidnightRun" WHERE "runDate" = CURRENT_DATE;
-- one row, counters match the response body
SQL
```

## Verify Idempotency

Re-run the curl command. Expected: another `202`, identical
`counters.mailReportsCreated` (per-run), but the User/Team end state
unchanged. `MailStat` row count for the day will have doubled.

## Verify Lock Contention

In two terminals, fire `curl ... /admin/midnight/run` simultaneously
against a slow fixture (1k+ users). Expected: one returns 202, the
other returns 409 with `code: MIDNIGHT_LOCK_HELD`.

## Verify Auth

```bash
curl -i -X POST http://localhost:3000/admin/midnight/run                    # → 401
curl -i -X POST http://localhost:3000/admin/midnight/run -H 'Authorization: Bearer wrong' # → 401
unset MIDNIGHT_ADMIN_TOKEN  # then restart backend
curl -i -X POST http://localhost:3000/admin/midnight/run -H 'Authorization: Bearer devtoken' # → 503
```

## Verify Self-Heal

Stop the backend, delete today's `MidnightRun` row
(`DELETE FROM "MidnightRun" WHERE "runDate" = CURRENT_DATE;`), restart
the backend. Watch the logs — the `OnApplicationBootstrap` hook should
run the pass once and emit the structured log line.

## Verify CHGLOSER PvP Penalty

This requires a live combat scenario; see
`test/game/combat/chgloser-pvp.spec.ts` for the automated test. Manual
recipe:

1. Two human-player ships in the same sector, one well-armed.
2. Set the loser's `cash` to a known non-zero value via the
   debug controller.
3. Resolve a phaser kill.
4. Verify the loser's `cash` is reduced by `CHGLOSER%` of its prior
   value, and the killer's `cash` increased by the same amount.
5. Repeat with a Cybertron or Droid attacker — verify no transfer.

## Verify Droid Kill Scoring

1. Force-spawn a Droid via the existing
   `POST /debug/droid/spawn` endpoint (feature 008).
2. Kill it with a player ship.
3. Verify the player's `score` and `klscore` each increased by the
   Droid's class `points` value.
4. Verify no exception is raised (the Droid has no `User` row).
