# Contract — Admin Midnight Endpoint

## `POST /admin/midnight/run`

Operator-only manual trigger for the midnight maintenance pass. Identical
side effects to the cron path; intended for testing, recovery after a
missed window past startup self-heal, or initial rollout.

### Authentication

Bearer-token in the `Authorization` header. Token compared in constant
time against `MIDNIGHT_ADMIN_TOKEN` from `process.env`.

```
Authorization: Bearer <MIDNIGHT_ADMIN_TOKEN>
```

If `MIDNIGHT_ADMIN_TOKEN` is unset or empty in the running process, the
endpoint responds `503 Service Unavailable` regardless of the supplied
header — fail-closed for misconfiguration.

### Request

No body. No query parameters.

### Responses

#### `202 Accepted` — pass completed

```json
{
  "status": "completed",
  "date": "2026-05-05",
  "durationMs": 1234,
  "counters": {
    "usersUpdated": 100,
    "planetsProcessed": 200,
    "mailReportsCreated": 200,
    "mailDeleted": 17,
    "teamsReconciled": 5,
    "teamsRemoved": 1
  }
}
```

`date` is the server-local calendar date used as the `MidnightRun` PK.
`counters` mirrors the structured log-line emitted on every successful
pass (cron or manual).

#### `401 Unauthorized` — missing/invalid token

```json
{ "statusCode": 401, "message": "Unauthorized" }
```

Returned when the `Authorization` header is missing, malformed, or
contains a token that does not match `MIDNIGHT_ADMIN_TOKEN`.

#### `409 Conflict` — concurrent run in flight

```json
{
  "statusCode": 409,
  "message": "Midnight pass already in progress",
  "code": "MIDNIGHT_LOCK_HELD"
}
```

Returned when `pg_try_advisory_lock(<key>)` returns false — another
runner (cron, startup self-heal, or another manual trigger) holds the
lock.

#### `503 Service Unavailable` — endpoint not configured

```json
{
  "statusCode": 503,
  "message": "Midnight admin endpoint is not configured",
  "code": "MIDNIGHT_TOKEN_NOT_SET"
}
```

Returned when `MIDNIGHT_ADMIN_TOKEN` is unset or empty in the running
process.

### Side Effects

On `202`, the endpoint writes one `MidnightRun` row keyed by today's
server-local date (or overwrites if today's row already exists from a
prior cron/self-heal/manual run on the same day) and emits the
end-of-pass log line:

```
{"event":"midnight.complete","date":"2026-05-05","durationMs":1234,"usersUpdated":100,"planetsProcessed":200,"mailReportsCreated":200,"mailDeleted":17,"teamsReconciled":5,"teamsRemoved":1}
```

A successful re-run on the same day will produce **duplicate**
`MailStat` rows (one new production report per owned planet) — this is
explicitly accepted by FR-022 / SC-003. All other side effects converge
to the same end state.

### Idempotency

- First call on date `D` (cron or manual): creates the `MidnightRun`
  row for `D`.
- Cron path on date `D` after a row already exists: short-circuits in
  the application layer (no advisory lock needed) and logs a skip.
- Manual path on date `D` after a row already exists: still executes
  (operator may want to re-run for recovery); the `MidnightRun` row is
  upserted (`completedAt`, `durationMs`, counters refreshed).

### Out-of-Scope

- No GET endpoint for reading historical `MidnightRun` rows — operators
  query the DB directly if needed.
- No DELETE endpoint — `MidnightRun` rows are not user-facing.
- No WebSocket emission — players see no real-time signal from a
  midnight run; the visible effects are the next-login mail rows and
  refreshed leaderboard.
