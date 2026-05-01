# Phase 0 Research — Tick Engine & Real-time Foundation

All Technical Context items resolved; no NEEDS CLARIFICATION outstanding.

---

## Decision 1 — Scheduling: raw `setInterval` managed by `TickService` lifecycle hooks

**Decision**: `TickService implements OnModuleInit, OnModuleDestroy`. In `onModuleInit`, call
`setInterval(fn, 1000)` for the SHIP_UPDATE tick and `setInterval(fn, 6000)` for the PHYSICS
tick, storing the returned `NodeJS.Timeout` handles on the service. In `onModuleDestroy`,
call `clearInterval` on each handle. Do NOT add `@nestjs/schedule` to dependencies.

**Rationale**:
- Per user direction, `@nestjs/schedule` is reserved for feature 009's midnight `@Cron`.
  Pulling it in now would establish a dependency before its single legitimate use exists.
- `setInterval` schedules each next firing relative to the start of the previous interval,
  not the end of the prior callback's work. This satisfies FR-012 ("Each heartbeat's next
  firing time MUST be based on its own schedule, not chained off completion of prior work").
  A chained `setTimeout` recursion would accumulate drift if a tick ran long.
- Storing the handles on the service and clearing them in `onModuleDestroy` (combined with
  `app.enableShutdownHooks()` in `main.ts`) satisfies FR-004 (no leaked timers on shutdown).
- The fake-timer test strategy works identically with raw `setInterval` —
  `jest.useFakeTimers()` patches `setInterval` itself, so cadence, subscriber invocation
  counts, and error isolation can all be validated without wall-clock waits.
- This is a deviation from the literal wording of constitution Principle III (which names
  `@Interval(6000)` / `@Interval(1000)`). The constraint that matters — exact cadence and
  no-drift behavior — is preserved. The deviation is documented in `plan.md` Constitution
  Check and in `docs/DECISIONS.md`. The constitution may be amended in a separate PR if the
  team wants the wording to match practice.

**Alternatives considered**:
- **`@nestjs/schedule` `@Interval`**: Rejected per user direction — see above.
- **Custom `setTimeout` recursion**: Rejected — drifts under load.
- **`node-cron`**: Rejected — coarse-grained, 6 s isn't a natural cron expression.
- **`bull` / job queue**: Rejected — requires Redis (forbidden by Principle III).

---

## Decision 2 — `setInterval` is single-process by design

**Decision**: Document that `setInterval`-based scheduling fires inside one Node process only,
and accept that constraint for this feature. No distributed-lock infrastructure now.

**Rationale**:
- Deployment is single-process (one container on Hetzner CPX32).
- Adding a Postgres advisory lock or Redis-based leader election today would be premature
  and contradicts Principle III's "no Redis" rule.
- The risk only materializes if the project ever runs >1 backend node. Before that happens,
  the tick engine MUST be put behind a leader-election mechanism (e.g., `pg_try_advisory_lock`
  on a well-known key; the loser node becomes a passive replica). This is recorded so the
  trade-off is visible the next time deployment topology is discussed.

**Alternatives considered**:
- **Postgres advisory lock now**: Rejected — solves a problem that doesn't exist yet, adds
  test complexity (need a real DB for unit-level tick tests), and would still need rework
  when the cluster topology is actually decided.
- **Redis leader election**: Rejected — violates Principle III.

---

## Decision 3 — Subscriber registry pattern: Nest `EventEmitter2`-style or hand-rolled?

**Decision**: Hand-rolled `Set<TickHandler>` per tick kind, exposed via
`tickService.subscribe(kind, handler): () => void` (returns an unsubscribe function).

**Rationale**:
- Two heartbeats × a small handler set means a `Set` is sufficient and trivially testable.
- Avoids pulling in `@nestjs/event-emitter` purely as an indirection layer; the constitution
  allows it but doesn't require it.
- A returned unsubscribe closure is idiomatic and avoids handler-identity issues that arise
  with string event names.
- Error isolation (FR-011) is implemented as a `try/catch` around each handler call inside
  the tick — one bad subscriber cannot prevent siblings from running, nor stop the next
  firing.

**Alternatives considered**:
- **`@nestjs/event-emitter`**: Rejected — extra dependency, weaker types, no clear win at
  two events.
- **RxJS `Subject`**: Rejected — would require subscribers to learn RxJS for no benefit;
  error semantics ("one bad subscriber doesn't kill the stream") are easier with a Set.

---

## Decision 4 — Bounds validation lives in the gateway, not the client

**Decision**: `GameGateway` validates X ∈ [1,30] and Y ∈ [1,15] on every `sector:join`
request. On failure, emit an `error` event back to the requesting socket and do NOT join the
room.

**Rationale**:
- Bounds are server-authoritative — the client cannot be trusted (Principle: defense in depth).
- Spec FR-009 mandates rejection. The planner note clarifies the client-facing contract:
  the gateway emits `error` with `{ event: "sector:join", code: "OUT_OF_BOUNDS", message: ... }`.
  This shape is fixed in `contracts/websocket-events.md` so feature 003+ can rely on it.

**Alternatives considered**:
- **Silent drop**: Rejected — clients need to know why a join failed (debuggability).
- **Throw / disconnect**: Rejected — disproportionate to a recoverable client error.

---

## Decision 5 — Sector room key format

**Decision**: Room name is the string `sector:{X}:{Y}` with 1-indexed integer coordinates.

**Rationale**:
- Stable, debuggable string format that survives logs and the Socket.io admin UI.
- `sector:` prefix namespaces these rooms away from any future global rooms (e.g., `team:N`).
- 1-indexed matches the original game's coordinate system (`GEMAIN.H` `MAXX/MAXY` are
  inclusive upper bounds, lower bound 1).

**Alternatives considered**:
- **Numeric room IDs (`y * MAXX + x`)**: Rejected — opaque in logs; saves nothing meaningful.
- **0-indexed**: Rejected — diverges from the original game and from how the wiki + reference
  source talk about coordinates.

---

## Decision 6 — `PrismaService` lifecycle and fail-fast bootstrap

**Decision**: `PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy`
with `await this.$connect()` in `onModuleInit` and `await this.$disconnect()` in
`onModuleDestroy`. `main.ts` calls `app.enableShutdownHooks()`.

**Rationale**:
- Standard NestJS Prisma pattern documented in Nest's own recipes.
- If `$connect()` throws (DB unreachable), `app.listen()` never resolves and the process
  exits with a non-zero status — satisfies FR-013 ("fail fast with a clear error rather than
  silently degrade").
- `enableShutdownHooks()` ensures `onModuleDestroy` runs on `SIGTERM`/`SIGINT`, which closes
  Prisma cleanly and runs `TickService.onModuleDestroy` (which `clearInterval`s the
  heartbeat handles) — satisfies FR-004 and SC-003.

**Alternatives considered**:
- **Lazy connect on first query**: Rejected — pushes failure to first request instead of
  startup, hides config errors, and breaks SC-001 ("ready in 5s") observability.

---

## Decision 7 — Test strategy: fake timers for cadence, real socket.io-client for gateway

**Decision**:
- `TickService` unit tests use `jest.useFakeTimers()` and `jest.advanceTimersByTime()` to
  validate cadence, subscriber invocation counts, and error isolation — no wall-clock waits.
- `GameGateway` integration tests boot a real Nest app on an ephemeral port and connect with
  `socket.io-client` to validate join/leave/disconnect lifecycle.
- `PrismaService` lifecycle tests use the real test DB already provisioned by feature 001's
  `globalSetup`.
- The 10-minute soak (SC-002) is a manual operator check documented in `quickstart.md`, not
  a CI gate.

**Rationale**:
- Fake timers keep the suite under a few seconds — Principle II's "tests are first class"
  requires they actually be runnable on every commit.
- Real `socket.io-client` is the only way to validate room membership semantics end-to-end;
  mocking the adapter would re-test our mocks instead of the actual contract.

**Alternatives considered**:
- **Real-time soak in CI**: Rejected — flaky, slow, and tells us nothing fake timers don't.

---

## Resolved Unknowns

None remaining — all NEEDS CLARIFICATION items from the Technical Context are resolved above.
