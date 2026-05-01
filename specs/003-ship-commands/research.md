# Phase 0 Research — Ship Commands & Terminal Frontend

All Technical Context items resolved; no NEEDS CLARIFICATION outstanding. The three Open
Questions on the spec (Q1 rotation engine, Q2 deferred gates, Q3 scan output shape) are
already resolved in the Clarifications section of `spec.md`.

---

## Decision 1 — `ShipStateService`: Map keyed by `userid:shipno`, dirty flag, flush on SHIP_UPDATE

**Decision**: A NestJS singleton (`@Injectable()`) holds `Map<string, ShipState>` where the
key is `${userid}:${shipno}` (matching the composite PK on the `Ship` Prisma model). On
`OnModuleInit` it loads every `Ship` row into the Map (hydration). On
`TickService.subscribe(TickKind.SHIP_UPDATE, …)` it iterates the Map, flushes only entries
whose `dirty === true`, and clears the flag after a successful Prisma `update`.

**Rationale**:
- Constitution III mandates the Map as authoritative state and Postgres as async-flushed.
- The composite key matches `Ship.@@id([userid, shipno])` from feature 001 — no schema
  change needed (FR-007).
- Reusing `TickService` from feature 002 satisfies "Existing 002 tick-engine subscriber
  registry is the integration point" (Assumption #9 of the spec). No new heartbeat.
- Per-entry try/catch around each `prisma.ship.update` satisfies FR-006 (one failure must
  not stop siblings or the next tick) and aligns with the `dispatch` isolation pattern
  feature 002 already uses for tick handlers.

**Alternatives considered**:
- **Single `updateMany` per tick**: rejected — Prisma cannot atomically update N rows
  with N different value sets in one call, and a transaction wrapping per-row updates
  would cause one failure to roll back siblings (violates FR-006).
- **Flush on mutation (synchronous)**: rejected — defeats the in-memory authority model
  and pessimises the round-trip latency target (SC-005 < 100 ms).
- **Separate "dirty set" alongside the Map**: rejected — adds a second data structure
  to keep coherent without measurable benefit at this scale.

---

## Decision 2 — `ShipState` shape: in-memory mirror of Prisma `Ship` + `dirty` flag

**Decision**: `ShipState` is a `type` whose fields are exactly the columns of the `Ship`
model (FR-007), with `BigInt[]` (cargo) preserved as `bigint[]` and floats preserved as
`number`. A single non-mirror field is added: `dirty: boolean`. A round-trip mapper
(`ship-state.mappers.ts`) converts between the Prisma row and `ShipState`.

**Rationale**:
- FR-007 forbids field divergence; this is the smallest implementation that enforces it.
- Mappers, not class instances, keep the type plain — easier to snapshot/clone in tests.

**Alternatives considered**:
- **Reuse Prisma's generated `Ship` type and add `dirty` via intersection**: rejected —
  the generated type's `BigInt` field semantics ripple into call sites that don't need
  to know about Prisma; the explicit local type isolates the domain.

---

## Decision 3 — `CommandRouter`: registry of `Command` records, alias-aware tokeniser

**Decision**: A `CommandRouter` service holds a `Map<string, Command>` keyed by every
recognised keyword *and every alias* (so `imp`, `impulse` are both keys pointing at the
same `Command` record). `dispatch(rawInput, ship)` lower-cases, trims, splits on
whitespace (`/\s+/`), looks up the keyword, and either invokes the handler or returns the
unknown-command response. Each `Command` declares `keyword`, `aliases`, `minArgs`,
`handler`. The router validates arg count and then calls `handler(ship, args, ctx)`.

**Rationale**:
- Mirrors the original game's command table in `GECMDS.C:111-225` (`{"imp", cmd_impulse, 1}`,
  `{"rot", cmd_rotate, 1}`, etc.). The original used a flat array of structs; a `Map` of
  alias→command is the idiomatic TypeScript shape.
- Constant-time dispatch; alias resolution is one lookup.
- Handlers are pure functions over `(ShipState, args, ctx)` — trivially unit-testable
  without spinning up a gateway.

**Alternatives considered**:
- **NestJS `@Subcommand` decorator pattern**: rejected — over-engineered; the registry
  is < 50 lines.
- **String prefix matching (original C `genearas` partial-match)**: deferred. The five
  P1 commands all have short aliases already in the table; full prefix matching can be
  added later if a wiki-listed alias is missing. Prefix match for `scan_sh` / `scan_pl`
  sub-keywords IS implemented per `cmd_scan` GECMDS.C:2155-2168.

---

## Decision 4 — Original-game response strings: reconstruct from wiki + `prfmsg` signatures

**Decision**: `reference/ge-source/` does not include the `.MSG` file the Galacticom
runtime resolved `prfmsg(IMPFMT)`-style identifiers against. Each response string used by
this feature is reconstructed from two sources, in order: (1) `reference/wiki/commands.md`
where it documents the literal output, (2) the `prfmsg(IDENT, arg1, arg2)` call sites in
`GECMDS.C` whose argument list dictates the format placeholders. The reconstructed
strings are committed as `backend/src/game/commands/messages.ts` and reproduced verbatim
in `contracts/messages.md` so any future deviation is auditable.

**Rationale**:
- Tests pin the strings (SC-001 character-level diff). If a future contributor edits a
  string, the test fails and the reviewer must re-justify against the wiki.
- Centralising the strings in one TypeScript file matches how feature 001 / 002
  centralise constants.

**Alternatives considered**:
- **Inline strings at each call site**: rejected — fragments fidelity audit across many
  files and makes the tests brittle.
- **Block on locating the `.MSG` file**: rejected — no copy is known to exist in this
  repository or the source archive; reconstruction is the practical path. The ledger of
  reconstructed strings makes any future correction a one-file diff.

---

## Decision 5 — Frontend: Vite + React 18 + Tailwind + Vitest, no SSR

**Decision**: A new `frontend/` directory created at repo root with a stock Vite React-TS
template. Tailwind for styling, monospace by default. Socket.io client connects to the
backend on load using a hard-coded development `userid` (FR-029). Vite dev server proxies
`/socket.io` to the backend (FR-028). Vitest with jsdom for component tests, plus
`@testing-library/react`.

**Rationale**:
- CLAUDE.md fixes the stack as React + Vite + TypeScript + Tailwind; this is the minimal
  bootstrap.
- Tailwind's `font-mono` token provides the monospace requirement (FR-022) without
  hand-rolled CSS.
- Vitest mirrors the ergonomics of Jest used on the backend; constitution mandates Vitest
  for the frontend.

**Alternatives considered**:
- **Next.js**: rejected — SSR is unnecessary; the client is a long-lived single-page
  terminal.
- **Bare DOM, no React**: rejected — three components plus a connection state machine
  benefit from React's render model and the testing ergonomics.

---

## Decision 6 — Connection indicator state machine: 3 states, derived from `socket.io-client`

**Decision**: `ConnectionIndicator` reads three states — `connecting`, `connected`,
`reconnecting` — derived from `socket.connected` plus the `connect` / `disconnect` /
`reconnect_attempt` events. `socket.io-client` reconnection defaults are kept (infinite
retries, exponential backoff capped at 5 s).

**Rationale**:
- Matches FR-027 (visible connection indicator AND visible reconnect indicator).
- Avoids re-implementing reconnection — the library already handles it; we only render
  the surface state.

**Alternatives considered**:
- **Manual reconnection with bespoke backoff**: rejected — duplicates library behaviour.

---

## Decision 7 — Scan grid coordinate normalisation

> **Supersedes the original wording of this decision.** The earlier draft of Decision 7
> described a 10×10 "intra-sector" grid; that framing had no source basis and was
> corrected in `spec.md` Clarifications Session 2026-05-02 (Q1, Q2). The current
> decision below is the canonical one.

**Decision**: The `scanGrid` payload is the **range-centred tactical projection** rendered
by the original `scan_lo` (`GECMDS.C:2640-2726`), not an "intra-sector" grid. Dimensions
are `MAXX × MAXY = 30 × 15` (`GEMAIN.H:121-122`). Coordinates are integer cells:
`x ∈ [0, MAXX)`, `y ∈ [0, MAXY)`. The projection follows `scan_lo` exactly:

```
range   = shipclass.scanrange / 1000.0          // GECMDS.C:2675
xfactor = (range × 2) / (MAXX − 1)               // GECMDS.C:2681
yfactor = (range × 2) / (MAXY − 1)               // GECMDS.C:2682
xf      = (target.xcoord − ship.xcoord) / xfactor + (MAXX / 2)
yf      = (target.ycoord − ship.ycoord) / yfactor + (MAXY / 2)
emit    = (0 ≤ xf < MAXX) && (0 ≤ yf < MAXY)     // GECMDS.C:2704
```

The `scanGrid` is emitted ONLY by `scan lo` (and bare `scan` as alias). `scan sh` and
`scan pl` are named-target text readouts (`scan_sh` `GECMDS.C:2190`, `scan_pl`
`GECMDS.C:2295`) and produce no grid. The backend always emits a self-cell at
`(floor(MAXX/2), floor(MAXY/2))` per `GECMDS.C:2721` (the original writes
`map[MAXY/2][MAXX/2] = '*'` server-side).

`SCAN_GRID_WIDTH = 30` and `SCAN_GRID_HEIGHT = 15` are exported from
`contracts/shared-types.ts`; both backend and frontend import these constants — neither
side hard-codes the dimensions.

**Rationale**:
- The `scan_lo` source is unambiguous about both dimensions and projection. Constitution
  Principle I (Fidelity) requires source-truth over invented prose.
- Integer cell coords simplify the React render to a single pass of `<span>` placements.
- Self-cell-as-data keeps the wire payload self-describing: a client that ignores the
  `'self'` type still sees no missing pixel.

**Alternatives considered**:
- **Floating-point coords passed straight through**: rejected — frontend would need to
  round anyway; pushing the rounding to the server keeps the contract numeric-stable
  across clients.
- **Server emits the rendered grid as a single string**: rejected — Q3 specifically chose
  a structured payload so the client owns rendering.
- **Frontend overlays the self marker**: rejected (Session 2026-05-02 Q2) — splits the
  marker logic across two sides for no benefit.

---

## Decision 8 — Player identity AND active ship resolved at handshake; no in-game BOARD command

**Decision**: The frontend connects with `io({ query: { userid: 'DEV' } })`. On
`handleConnection`, the gateway:

1. Reads `client.handshake.query.userid` and stashes it on `client.data.userid`.
2. Queries `ShipStateService` for ships belonging to that `userid`.
3. Binds `client.data.activeShipNo` per the resolution rule in FR-030 — exactly one
   ship → bind it; zero ships → emit `error { code: 'NO_SHIP', message: 'No ship found
   for user.' }` and `client.disconnect(true)`; more than one ship → bind the lowest
   `shipno` and log a modernization-tie-break warning.
4. All command handlers read the active ship via the composite Map key
   `(client.data.userid, client.data.activeShipNo)`. No command mutates which ship is
   active.

**Rationale**:
- The original `GECMDS.C` command table (lines 124-167) has no BOARD / SELECT / TAKE
  entry. The active ship was chosen in the MajorBBS shell menu before the in-game
  prompt; `warsptr` was set once at session entry and never reassigned by an in-game
  command. Resolving on handshake is the faithful translation of that flow into a
  WebSocket session.
- Keeps the command surface in feature 003 limited to the five P1 commands the spec
  scopes — no invented sixth command, no modernization that would have to be removed
  later.
- The Map stays keyed by `(userid, shipno)` (matching the Prisma `@@id`), which
  generalises naturally when multi-ship selection ships in a future auth/ship-purchase
  feature: the same handshake hook just needs an additional rule for choosing among
  multiple ships (e.g. "most recently flown").

**Alternatives considered**:
- **Add a modernization `board <shipno>` command** to feature 003: rejected — has no
  `GECMDS.C` anchor (would violate Constitution Principle I in the absence of a
  documented modernization rationale) and is unnecessary while Assumption #1 holds
  (one ship per user).
- **Anonymous connection + a `login` command**: rejected — duplicates the auth
  feature's surface and creates churn when auth ships.
- **Resolve active ship lazily on each command**: rejected — adds a Map iteration per
  command and yields no benefit; resolution is a connection-scoped fact.

**Forward note**: When auth + multi-ship ships, the handshake hook is the place to
extend (read selected `shipno` from the auth-issued token / a query param chosen at
ship-list screen) — not the command surface.

---

## Decision 9 — `command` and `command:result` event payload contracts

**Decision**: Codified in `contracts/websocket-events.md` and `contracts/shared-types.ts`.
Inbound: `command` with `{ input: string }`. Outbound: `command:result` with
`{ lines: { text: string, category: 'system'|'info'|'success'|'combat' }[], scanGrid?: ScanCell[] }`.
`ScanCell` = `{ x: number, y: number, type: 'ship'|'planet'|'wormhole'|'self', char: string }`
(per Session 2026-05-02 Q2 — adds the `'self'` member so the player marker is wire-data,
not a frontend overlay; see `GECMDS.C:2721`). The `scanGrid` field is present ONLY on
`scan lo` / bare `scan` responses (Session 2026-05-02 Q1).

**Rationale**:
- Tagging each line with a `category` satisfies FR-025 (visual styling) without forcing
  the client to parse text.
- `scanGrid` only present on `scan` results, per FR-011 / FR-016.

**Alternatives considered**:
- **Plain `string[]` for `lines`**: rejected — FR-025 requires categorisation; doing it
  client-side by string-matching would be brittle.

---

## Open items rolled forward to feature 006 (do NOT solve in 003)

- Per-tick application of rotation (`ROTAMT`) and energy consumption (`ROTENGUSE`).
- Re-enabling orbit-lock and damage-state gates in `cmd_impulse` / `cmd_warp` /
  `cmd_rotate`. Each gate is short-circuited here with a `TODO(006): see GECMDS.C:NNN`
  comment so feature 006 finds them by grep.
- Movement physics — `head2b`/`speed2b` integrate to `heading`/`speed` and to
  `xcoord`/`ycoord` per tick (`GEFUNCS.C:newpos` and friends).
