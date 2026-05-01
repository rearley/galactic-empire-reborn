# Tasks: Ship Commands & Terminal Frontend

**Input**: Design documents from `/specs/003-ship-commands/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Mandatory per Constitution Principle II. SC-007 requires ≥35 new backend tests and ≥6 new frontend tests. Tests are written alongside (or before) implementation, not after.

**Organization**: Grouped by user story so each P1 story can land independently. US1 (flight commands), US2 (inspection commands), US3 (forgiving input), US4 (terminal frontend).

## Implementation Constraints (read before writing any code)

These override anything in individual task descriptions. The C source wins over prose.

1. **Source-fidelity over task prose (T026 in particular).** The task description for `warp` says `value > maxWarp` emits `WARP04` and *continues to apply*. Do NOT trust this. Open `GECMDS.C:561` and surrounding lines and implement exactly what the original does — if `WARP04` is a rejection (not a warning), reject. SC-001 is a character-level diff; the source is canonical. Apply this rule to every handler: when task prose and `GECMDS.C` disagree, the source wins and the task is the bug.
2. **Scan grid dimensions are 30 × 15, not 10 × 10.** Verified against `GEMAIN.H:121` (`#define MAXX 30`) and `GEMAIN.H:122` (`#define MAXY 15`). The original `scan_lo` at `GECMDS.C:2640-2726` declares `map[MAXY][MAXX]` and centres the player at `map[MAXY/2][MAXX/2]`. There is no `SECTOR_GRID` constant. **The 10×10 figure in spec.md / data-model.md / earlier task drafts is wrong** — fixed in `contracts/shared-types.ts` (now exports `SCAN_GRID_WIDTH = 30`, `SCAN_GRID_HEIGHT = 15` with source anchors). Both backend (T032) and frontend (T046) MUST import these constants from `shared-types.ts` — no module hard-codes 30, 15, or 10. **Spec-level note (out of scope for this task list):** `scan_lo` is a *range-centred tactical scan*, not an "intra-sector" grid. `scan_sh`/`scan_pl` produce no grid at all. The data-model.md framing "intra-sector cell column 0..9" should be revisited via `/speckit-clarify` before implement.
3. **TODO(006) markers must carry a line number.** Every short-circuited gate in `rotate`, `impulse`, `warp`, `scan` is `// TODO(006): see GECMDS.C:<exact-line>` — bare `TODO(006)` is forbidden and will be rejected in review. Feature 006 finds these by grep and the line number is the contract.
4. **SC-007 test floor is real, not aspirational.** Each handler spec (T028–T030, T036–T037) must contain at least: success path, rejection path, `dirty`-flag assertion, alias dispatch. That is 4 tests × 5 handlers = 20 tests from handlers alone. Add T012 (validators), T016 (ship-state suite), T019 (router suite), T023 (handshake suite), T031 + T038 (round-trip), T039–T040 (router error coverage) to clear ≥35. Before T058 closes, run `npm test -- --listTests` (or equivalent count) and confirm the new-test delta against feature 002's baseline of 288.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Different file, no dependency on incomplete tasks → can run in parallel.
- **[Story]**: User-story tag (US1–US4). Setup, Foundational and Polish phases carry no story tag.

## Path Conventions

Web app: `backend/src/`, `backend/test/`, `frontend/src/`, `frontend/test/`. Plan.md §"Project Structure" is authoritative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap the new frontend Vite project and shared-type plumbing. The backend stack already exists from features 001/002 — no backend bootstrap.

- [X] T001 Create `frontend/` Vite + React 18 + TypeScript project at repo root: `frontend/package.json`, `frontend/index.html`, `frontend/vite.config.ts`, `frontend/tsconfig.json`. Configure Vite dev server to proxy `/socket.io` → `http://localhost:3000` per FR-028 (research.md Decision 5).
- [X] T002 [P] Add Tailwind CSS 3 to frontend: `frontend/tailwind.config.ts`, `frontend/postcss.config.cjs`, `frontend/src/styles.css` with `@tailwind base/components/utilities` and a `font-mono` body default (FR-022).
- [X] T003 [P] Configure Vitest + jsdom + `@testing-library/react` in `frontend/vite.config.ts` and create `frontend/test/setup.ts` (jsdom global, RTL cleanup).
- [X] T004 [P] Add `socket.io-client@4` dependency to `frontend/package.json`.
- [X] T005 Copy `specs/003-ship-commands/contracts/shared-types.ts` to `frontend/src/types/contracts.ts` verbatim. Add a comment header pointing back to the canonical contract.
- [X] T006 [P] Create `frontend/test/contracts-parity.spec.ts` — a structural test that imports both `frontend/src/types/contracts.ts` and the canonical `specs/003-ship-commands/contracts/shared-types.ts` (via relative path) and asserts every exported name and shape matches (research.md Decision 9; shared-types.ts header).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: ShipStateService, CommandRouter scaffolding, message ledger, validators, and the `command` socket event must exist before any user-story work compiles. **No user-story phase can begin until this phase is complete.**

### Backend types & constants

- [X] T007 [P] Create `backend/src/game/ship/ship-state.types.ts` defining `ShipState` (mirror of Prisma `Ship` field-for-field per FR-007 + `dirty: boolean` flag) and the composite key helper `shipKey(userid: string, shipno: number): string`. Reference: data-model.md §"ShipState".
- [X] T008 [P] Create `backend/src/game/ship/ship-state.mappers.ts` exporting `prismaShipToState(row): ShipState` and `stateToPrismaUpdate(state): Prisma.ShipUpdateInput`. Drop the `dirty` flag on the Prisma side. Reference: research.md Decision 2.
- [X] T009 [P] Create `backend/src/game/commands/command.types.ts` defining `Command`, `CommandHandler`, `CommandContext`, `CommandResult` per data-model.md §"Command" and §"CommandResult" — including the optional `scanGrid` and `broadcasts` fields.
- [X] T010 [P] Create `backend/src/game/commands/messages.ts`: `MessageId` enum (`IMPFMT`, `IMPULSE1`, `ENGFIRE`, `HLBROKE`, `NUMOOR`, `WARP01`, `WARPSPD2`, `WARPFMT`, `WARP02`, `WARP03`, `WARP04`, `ROTFMT`, `NOWTURN`, `NOROTPW`, `CANTROT`, `REPFMT`, `REP01`, `DASHES`, `REP35`, `REP02`–`REP08`, `REP32`, `REP09`, `REP10`, `REP11`, `REP11B`, `REP14`, `REP24A`, `REP23`, `REP24`, `REP12`, `REP13`, `SCANFMT`, `TABROKE`, `JAMMER4`, `UNKNOWN_CMD`) plus `formatMessage(id, ...args): string` driven by an internal `Record<MessageId, string>` whose values are the verbatim strings in `contracts/messages.md`.
- [X] T011 [P] Create `backend/src/game/commands/validators.ts` exporting `valdegree(input: string)` (`-180..180` integer per `GEFUNCS.C:1933`) and `valpcnt(input: string, min?: number, max?: number)` (default `0..99` per `GEFUNCS.C:1906`). Each returns `{ ok: true, value } | { ok: false, code: 'NUMOOR'|'INVALID' }`.
- [X] T012 [P] Create `backend/test/unit/validators.spec.ts` — balance regression. Tests pin `valdegree` boundaries (`-180`, `0`, `180`, `-181`, `181`, `abc`, ``) and `valpcnt` boundaries (`0`, `99`, `-1`, `100`, `abc`). Failing means a constant changed (Constitution II).

### ShipStateService (FR-001..FR-007)

- [X] T013 Create `backend/src/game/ship/ship-state.service.ts`: `@Injectable()` singleton with `private map = new Map<string, ShipState>()`. Implement `onModuleInit()` → `prisma.ship.findMany()` → mappers → Map (hydration, FR-001). Public surface: `get(userid, shipno)`, `mutate(userid, shipno, fn)` (which sets `dirty=true` after `fn` runs, FR-003), `findByUserid(userid): ShipState[]` (sorted ascending by `shipno`, used by handshake), and `size()`.
- [X] T014 In the same file, register the SHIP_UPDATE flush subscriber via `tickService.subscribe(TickKind.SHIP_UPDATE, () => this.flush())`. `flush()` iterates the Map; for each `dirty` entry, wrap `prisma.ship.update({ where: { userid_shipno: …}, data: stateToPrismaUpdate(state) })` in `try/catch`; on success set `dirty=false`; on catch log the error and continue with the next entry (FR-004, FR-005, FR-006).
- [X] T015 Create `backend/src/game/ship/ship.module.ts` exporting `ShipModule` that provides `ShipStateService`, imports `PrismaModule` and `TickModule`, and exports `ShipStateService`.
- [X] T016 [P] Create `backend/test/unit/ship-state.service.spec.ts`: hydration loads N rows into Map (asserts `size() === N` before any tick — SC-006); `mutate` sets `dirty`; `flush` writes only dirty entries (zero writes when nothing dirty — SC-003); `flush` clears `dirty` after success; one entry's `prisma.ship.update` rejection does NOT prevent the sibling entry from being written (FR-006); two rapid mutations within one tick are coalesced into a single write that reflects the latest state.

### CommandRouter (FR-008..FR-014)

- [X] T017 Create `backend/src/game/commands/command-router.service.ts`: `@Injectable()` with `private registry = new Map<string, Command>()`. `register(cmd: Command)` populates the map under `cmd.keyword` and every entry of `cmd.aliases`. `dispatch(rawInput, ship, ctx): CommandResult` lower-cases, trims, splits on `/\s+/`; empty input → `{ lines: [] }` (silent drop per websocket-events.md); unknown keyword → `{ lines: [{ text: formatMessage(UNKNOWN_CMD), category: 'system' }] }`; insufficient args → per-command missing-arg line via the command's declared `argMissingMessage`; otherwise calls `cmd.handler(ship, args, ctx)`.
- [X] T018 Create `backend/src/game/commands/commands.module.ts` exporting `CommandsModule` that provides `CommandRouter` and the five handler providers (registered later in US1/US2 phases) and exports `CommandRouter`.
- [X] T019 [P] Create `backend/test/unit/command-router.spec.ts`: tokenisation (leading/trailing whitespace, internal collapse, mixed case); alias resolution (`imp` → `impulse`); empty input returns no lines; unknown keyword returns the exact `UNKNOWN_CMD` string; missing-arg dispatch returns the per-command missing-arg line; arg array passed to handler is post-trim, post-split.

### GameGateway: command channel + handshake resolution (FR-008, FR-011, FR-030)

- [X] T020 Edit `backend/src/gateway/game.gateway.ts`: in `handleConnection`, read `client.handshake.query.userid`; if missing/non-string → `client.emit('error', { code: 'NO_USER', message: 'No userid in handshake.' })` then `client.disconnect(true)`; else stash on `client.data.userid`. Then call `shipStateService.findByUserid(userid)` and apply the FR-030 rule: 0 rows → emit `{ code: 'NO_SHIP', message: 'No ship found for user.' }` then `disconnect(true)` (do NOT auto-create); 1 row → bind `client.data.activeShipNo = row.shipno`; ≥2 rows → bind the lowest `shipno` and log exactly `[ShipStateService] WARN multiple ships for userid=<id>, picked lowest shipno=<n>`. After binding, emit one `command:result` with a single `system` line `Welcome aboard, <shipname>.` (websocket-events.md §"Connection").
- [X] T021 In the same file, add `@SubscribeMessage('command') handleCommand(@ConnectedSocket client, @MessageBody() body: { input: string })`: look up `ShipState` via `(client.data.userid, client.data.activeShipNo)`; if absent emit `command:result` with `[{ text: 'No active ship.', category: 'system' }]`; else call `commandRouter.dispatch(body.input, ship, ctx)`. Wrap the whole handler in `try/catch` and on throw emit `command:result` with `[{ text: 'Internal error processing command.', category: 'system' }]` (websocket-events.md §"Error handling").
- [X] T022 Edit `backend/src/gateway/gateway.module.ts` to import `CommandsModule` and `ShipModule`. Edit `backend/src/app.module.ts` to register `ShipModule` and `CommandsModule`.
- [X] T023 [P] Create `backend/test/integration/handshake-resolution.spec.ts`: spin up Nest test app + in-memory Socket.io client. Cases — no `userid` query → emits `error:NO_USER` and disconnects; `userid` with 0 ships → emits `error:NO_SHIP` and disconnects, no `Ship` row created; `userid` with 1 ship → binds and emits welcome line; `userid` with 3 ships → binds the lowest `shipno`, logger captures the exact warn string verbatim.

**Checkpoint**: Foundation ready — US1, US2, US3, US4 can now proceed (US1/US2/US3 are all backend and could be parallel; US4 is frontend).

---

## Phase 3: User Story 1 — Player issues a flight command and sees their ship change (Priority: P1) 🎯 MVP

**Goal**: `rotate <deg>`, `impulse <pcnt>`, `warp <speed>` mutate the live `ShipState`, are persisted within one SHIP_UPDATE heartbeat, and confirm with the original-game response strings. Deferred energy / orbit / damage gates short-circuit per FR-019a with `TODO(006)` source-anchored comments.

**Independent Test**: connect a test socket, issue `rotate 90`, observe `Now turning to 90 degrees.` line and that within ≤1 s `Ship.degrees` in Postgres equals `90`. Repeat for `impulse 50` and `warp 5`.

### Implementation for User Story 1

- [X] T024 [P] [US1] Create `backend/src/game/commands/handlers/rotate.handler.ts`: keyword `rotate`, alias `rot`, `minArgs: 1`. Handler validates arg with `valdegree`; on rejection returns `NUMOOR(-180,180)`; on success calls `shipStateService.mutate(...) { ship.degrees = value }` and returns one `success` line `formatMessage(NOWTURN, value)`. The original `cmd_rotate` (`GECMDS.C:643`) has two branches (hyperspace vs normal) — preserve both gate sites with TODO markers: `// TODO(006): see GECMDS.C:679 — useenergy gate (NOROTPW, hyperspace branch)`, `// TODO(006): see GECMDS.C:711 — useenergy gate (NOROTPW, normal branch)`, `// TODO(006): see GECMDS.C:685 — speed<0 gate (CANTROT, hyperspace branch)`, `// TODO(006): see GECMDS.C:717 — speed<0 gate (CANTROT, normal branch)`, `// TODO(006): see GECMDS.C:691 — helm gate (HLBROKE, hyperspace branch)`, `// TODO(006): see GECMDS.C:723 — helm gate (HLBROKE, normal branch)`. Each gate short-circuits to "allow" per FR-019a. Reference: messages.md §`cmd_rotate`.
- [X] T025 [P] [US1] Create `backend/src/game/commands/handlers/impulse.handler.ts`: keyword `impulse`, alias `imp`, `minArgs: 1`. Handler validates arg with `valpcnt(0, 99)` (and tightens to `shipclass.maxImpulse` if present per FR-018); on success mutates `ship.percent = value` AND `ship.speed2b` per `cmd_impulse` semantics, returns `formatMessage(ENGFIRE, ship.heading)`. Add `// TODO(006): see GECMDS.C:497 — where==1 hyperspace gate (IMPULSE1)` and `// TODO(006): see GECMDS.C:550 — helm gate (HLBROKE)` at their short-circuit sites (FR-018, FR-019a). Reference: messages.md §`cmd_impulse`.
- [X] T026 [P] [US1] Create `backend/src/game/commands/handlers/warp.handler.ts`: keyword `warp`, alias `war`, `minArgs: 1`. **Source-fidelity warning per Constraint #1: read `GECMDS.C:561` and surrounding lines before writing the validator. The task's `WARP04 → warn-and-apply` framing is provisional; if the original rejects rather than warns, implement rejection.** Handler reads `ShipClass.maxWarp` for the ship's class via Prisma (cached at module init or fetched inline — pick the simpler at implement); `maxWarp == 0` → `WARP01`; numeric parse failure → `WARPFMT`; `value < 0` → `WARP02`; `value > maxWarp * 1.5` → `WARP03`; `value > maxWarp` → behaviour per source (`WARP04`); on apply, mutate `ship.speed2b = value` and return `formatMessage(ENGFIRE, ship.heading)`. Add `// TODO(006): see GECMDS.C:575 — topspeed offline gate (WARPSPD2)` and `// TODO(006): see GECMDS.C:633 — helm gate (HLBROKE)` at their short-circuit sites (FR-019, FR-019a). Reference: messages.md §`cmd_warp`.
- [X] T027 [US1] Edit `backend/src/game/commands/commands.module.ts` to register `rotate`, `impulse`, `warp` handlers with `CommandRouter` in an `OnModuleInit` hook on the module-scoped registrar.
- [X] T028 [P] [US1] Create `backend/test/unit/handlers/rotate.spec.ts`: success path mutates `degrees` and returns `NOWTURN`; out-of-range returns `NUMOOR`; non-numeric returns `NUMOOR`; missing arg returns `ROTFMT`; mutation sets `dirty`; alias `rot` dispatches identically.
- [X] T029 [P] [US1] Create `backend/test/unit/handlers/impulse.spec.ts`: success path within `[0,99]` mutates `percent`/`speed2b` and returns `ENGFIRE`; `200` returns `NUMOOR`; missing arg returns `IMPFMT`; alias `imp` works; `dirty` set.
- [X] T030 [P] [US1] Create `backend/test/unit/handlers/warp.spec.ts`: ship class with `maxWarp=0` returns `WARP01`; `maxWarp=6` and input `9` returns `WARP03`; input `7` returns `WARP04(6)` AND applies; input `5` returns `ENGFIRE`; input `-1` returns `WARP02`; missing arg returns `WARPFMT`; `dirty` set on success.
- [X] T031 [US1] Create `backend/test/integration/command-roundtrip.spec.ts` (US1 portion): socket emits `{event:'command', input:'rot 45'}` → receives `command:result` with one `success` line; advance the test clock 1 s; assert `prisma.ship.findUnique` reflects `degrees=45`. Repeat for `imp 50` and `warp 3`. Verify zero `prisma.ship.update` calls when no command was issued during the next tick (SC-003).

**Checkpoint**: US1 complete. Player can fly. Continue to US2 OR ship the MVP.

---

## Phase 4: User Story 2 — Player inspects the world (Priority: P1)

**Goal**: `report` returns a faithful multi-line status read-out; `scan` returns both the original per-object text lines AND a `scanGrid` payload for client-side rendering.

**Independent Test**: with a known seeded sector containing a ship, planet, and wormhole, issue `scan` and assert `lines` contains the per-object descriptive lines AND `scanGrid` contains exactly three cells with the right `(x, y, type, char)`. Issue `report nav` and assert the multi-line read-out.

### Implementation for User Story 2

- [X] T032 [US2] Re-export the canonical `SCAN_GRID_WIDTH` (30, `GEMAIN.H:121`) and `SCAN_GRID_HEIGHT` (15, `GEMAIN.H:122`) from `backend/src/game/constants.ts` — `import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT } from '<path-to-shared-types>'` then re-export. Do NOT redeclare the numeric values. Also implement the range-centred projection used by `scan_lo` per data-model.md §"ScanCell" (`GECMDS.C:2675-2718`): `range = shipclass.scanrange / 1000.0`, `xfactor = (range × 2) / (MAXX − 1)`, `yfactor = (range × 2) / (MAXY − 1)`, then `xf = (target.x − ship.x) / xfactor + MAXX/2`, `yf = (target.y − ship.y) / yfactor + MAXY/2`. Export `projectRangeCell(ship, target): {x, y} | null` returning `null` when off-range (`0 ≤ xf < MAXX` AND `0 ≤ yf < MAXY` per `GECMDS.C:2704`). JSDoc must anchor every constant and formula line to the source.
- [X] T033 [P] [US2] Create `backend/src/game/commands/handlers/scan.handler.ts`: keyword `scan`, alias `sc`, `minArgs: 0`. Sub-keyword dispatch per `cmd_scan` (`GECMDS.C:2138`) and clarified spec (Session 2026-05-02 Q1):
  - **bare `scan`** → treated as `scan lo` (alias).
  - **`scan lo`** → text header (`SCAN24` per `GECMDS.C:2673`) + `scanGrid` payload. Project every `Ship` / `Planet` / `Wormhole` within `range` via `projectRangeCell` (T032); chars per data-model.md table (`'='` manual ship per `GECMDS.C:2715`, `'+'` AI ship per `:2710`, `'@'` planet, `'*'` wormhole). Always append the self-cell `{ x: Math.floor(SCAN_GRID_WIDTH/2), y: Math.floor(SCAN_GRID_HEIGHT/2), type: 'self', char: '*' }` per `GECMDS.C:2721`. Empty range → `scanGrid` containing only the self-cell.
  - **`scan sh <name>`** → text-only readout per `scan_sh` (`GECMDS.C:2190`). NO `scanGrid` field on the response.
  - **`scan pl <name>`** → text-only readout per `scan_pl` (`GECMDS.C:2295`). NO `scanGrid` field.
  - **`scan ra` / `scan se`** → out of scope; return `SCANFMT` usage line.
  - **unknown sub-keyword** → `SCANFMT`.
  - Inject `PrismaService` (and `ShipClassService` or equivalent for `scanrange`). Add `// TODO(006): see GECMDS.C:2143 — tactical-computer gate (TABROKE)` and `// TODO(006): see GECMDS.C:2150 — jammer gate (JAMMER4)` at their short-circuit sites (FR-019a).
- [X] T034 [P] [US2] Create `backend/src/game/commands/handlers/report.handler.ts`: keyword `report`, alias `rep`, `minArgs: 1` (sub-keyword `nav|sys|cargo|wpns`). Build the multi-line read-out per messages.md §`cmd_report`: `REP01` header + `DASHES`; for `nav` emit `REP35`/`REP02|REP05|REP08`/`REP03|REP06`/`REP04|REP07`/`REP32`; for `sys` emit `REP09`, shield variants, `REP14`, `REP24A`, phasor/cloak; for `cargo`/`wpns` emit a single line `No items / no weapons configured.` with a `// TODO(005): expand cargo body`/`// TODO(006): expand wpns body` comment (messages.md note). Header lines (`REP01` ship name, `DASHES`, `REP35` section name) categorized `system`; body lines (everything else) categorized `info` per FR-025. FR-015.
- [X] T035 [US2] Edit `backend/src/game/commands/commands.module.ts` `OnModuleInit` to register `scan` and `report` handlers.
- [X] T036 [P] [US2] Create `backend/test/unit/handlers/scan.spec.ts`. Cases:
  - `scan lo` with empty range → `scanGrid` length === 1, the single cell is the self-cell at `(floor(MAXX/2), floor(MAXY/2))` with `type:'self', char:'*'`.
  - `scan lo` with one AI ship at projected cell (12, 7) → `scanGrid` contains `{x:12,y:7,type:'ship',char:'+'}` AND the self-cell. Manual ship → `char:'='`.
  - Off-range target → projection returns `null` and the cell is dropped.
  - `scan sh <name>` returns text-only `command:result` (assert `scanGrid` field is `undefined`); valid target name returns the per-ship lines per `scan_sh` template.
  - `scan pl <name>` returns text-only response; `scanGrid === undefined`.
  - Unknown sub-keyword → single line `SCANFMT`.
  - Bare `scan` (no sub-keyword) dispatches identically to `scan lo` — assert produced `scanGrid` matches.
  - Alias `sc lo` dispatches identically to `scan lo`.
- [X] T037 [P] [US2] Create `backend/test/unit/handlers/report.spec.ts`: `nav` returns the expected sequence of message ids in order; `sys` includes `REP09` energy line and shield variant matching the ship's `shieldtype`; `cargo` returns the placeholder line with the TODO marker still present in handler source; missing arg returns `REPFMT`; alias `rep` works.
- [X] T038 [US2] Extend `backend/test/integration/command-roundtrip.spec.ts` (US2 portion): `scan` round-trip emits `command:result` carrying `scanGrid`; `report nav` round-trip emits the multi-line read-out; both produce zero `Ship` row writes (read-only commands, FR-020 does not apply, SC-003 still holds).

**Checkpoint**: US1 + US2 both work. Player can fly and see.

---

## Phase 5: User Story 3 — Forgiving input and safe error handling (Priority: P2)

**Goal**: case-insensitive matching, whitespace tolerance, alias coverage, single-line errors for unknown commands and bad arguments — all exactly matching the original game.

**Independent Test**: dispatch `   ROT 45  `, `Imp 50`, `WARP   5`, `flarp`, `rotate`, `rotate abc`. First three succeed; last three return the appropriate error string.

### Implementation for User Story 3

- [X] T039 [P] [US3] Extend `backend/test/unit/command-router.spec.ts` with cases covering: leading/trailing whitespace stripped (`'   rot 45   '`); collapsed internal whitespace (`'rot     45'`); mixed case keyword (`'ROT'`, `'RoT'`); recognised aliases dispatch to canonical handler; unknown command produces exactly one `system`-category line equal to `formatMessage(UNKNOWN_CMD)` and zero state mutations (assert `dirty` not set on any ship); missing arg returns the per-command missing-arg ID; arg-validator failure (`'rotate abc'`) returns `NUMOOR(-180,180)`.
- [X] T040 [US3] Verify the gateway `try/catch` (T021) is exercised: add a case to `backend/test/integration/command-roundtrip.spec.ts` that registers a throw-on-purpose handler in a temporary router fork, dispatches it, and asserts the client receives `[{text:'Internal error processing command.', category:'system'}]` and the connection stays open.

**Checkpoint**: All three backend stories independently testable.

---

## Phase 6: User Story 4 — Player has a usable terminal interface (Priority: P1)

**Goal**: a Vite + React + Tailwind frontend with three regions (event log, scan map, command input), a connection indicator, and round-trip command flow against the real backend.

**Independent Test**: `npm run dev` in `frontend/` against a running backend; type each of the five commands and observe the event log, scan map, and command-input behaviour described in spec.md US4 acceptance scenarios.

### Implementation for User Story 4

- [X] T041 [P] [US4] Create `frontend/src/socket/socketClient.ts`: a singleton `io({ query: { userid: 'DEV' }, autoConnect: true })` with default reconnection (infinite retries, exponential backoff cap 5 s — research.md Decision 6). Export the client and a typed event API (`emit('command', payload: CommandRequest)`, listener for `command:result: CommandResultPayload`, listener for `error`). FR-029, FR-028.
- [X] T042 [P] [US4] Create `frontend/src/socket/useSocket.ts`: React hook returning `{ status: 'connecting'|'connected'|'reconnecting'|'disconnected', lastResult: CommandResultPayload | null, send: (input: string) => void }`. Subscribes to `connect`, `disconnect`, `reconnect_attempt` socket.io events to derive `status`.
- [X] T043 [P] [US4] Create `frontend/src/components/ConnectionIndicator.tsx`: renders a coloured dot + label keyed off the four `status` values. FR-027.
- [X] T044 [P] [US4] Create `frontend/src/components/EventLog.tsx`: receives `EventLogLine[]`, renders one `<div>` per line with a Tailwind class per category (`system` → grey, `info` → off-white, `success` → green, `combat` → red), auto-scrolls to bottom on update via a ref + `useEffect`. FR-024, FR-025.
- [X] T045 [P] [US4] Create `frontend/src/components/CommandInput.tsx`: controlled `<input>`; on Enter call `onSubmit(input)` and clear the field. FR-023.
- [X] T046 [P] [US4] Create `frontend/src/components/ScanMap.tsx`: import `SCAN_GRID_WIDTH` and `SCAN_GRID_HEIGHT` from `frontend/src/types/contracts.ts` (mirrors `shared-types.ts` — 30 × 15 from `GEMAIN.H:121-122`). Receive `ScanCell[] | null` and render a `SCAN_GRID_HEIGHT × SCAN_GRID_WIDTH` monospace grid driven by those constants — no hard-coded 30/15/10 anywhere in JSX, CSS classes, or grid-iteration loops. Replace prior scan content on each new payload; empty cells render as a space, occupied cells render `cell.char`. The player marker is delivered by the backend as a `type: 'self'` cell with `char: '*'` (clarified Session 2026-05-02 Q2) — the component MUST NOT overlay it client-side; render `'self'` cells like any other cell. Apply a distinct CSS class to `'self'` cells so the player marker is visually distinguishable from `'wormhole'` cells (both share `'*'` as glyph; type discriminates). FR-026.
- [X] T047 [US4] Create `frontend/src/App.tsx` and `frontend/src/main.tsx`: 3-region layout per FR-022 — full-viewport dark monospace, EventLog left, ScanMap right, CommandInput pinned bottom, ConnectionIndicator in a corner. Wire `useSocket` so submitted commands flow to the server, `command:result.lines` append to the event log, and `command:result.scanGrid` (when present) updates the ScanMap.
- [X] T048 [P] [US4] Create `frontend/test/EventLog.spec.tsx`: lines append in arrival order; new lines auto-scroll the container (assert `scrollTop === scrollHeight - clientHeight` after update); per-category className applied.
- [X] T049 [P] [US4] Create `frontend/test/CommandInput.spec.tsx`: typing + Enter calls `onSubmit` with the trimmed text; input clears after submit; empty-input Enter does not call `onSubmit`.
- [X] T050 [P] [US4] Create `frontend/test/ScanMap.spec.tsx`: cells from a payload render at the correct grid position; an empty array clears prior content; a new payload fully replaces (no stale cells); the rendered grid is `SCAN_GRID_HEIGHT` rows × `SCAN_GRID_WIDTH` columns (assert against the imported constants, NOT against literal 30/15); a `type:'self'` cell receives the distinct CSS class so wormhole and self markers are not visually confused; component does NOT synthesise a self-cell — passing a payload without one renders no centre marker (proves overlay logic was not snuck in).
- [X] T051 [P] [US4] Create `frontend/test/ConnectionIndicator.spec.tsx`: renders the right label/dot for each of the four statuses.
- [X] T052 [P] [US4] Create `frontend/test/socketClient.spec.ts`: client constructed with `userid` query param; `command` emit forwards the typed payload; `command:result` listener fires the registered callback. Mock the socket.io-client transport.
- [X] T053 [P] [US4] Create `frontend/test/App.spec.tsx`: smoke test — three regions present, ConnectionIndicator mounted, no console errors on initial render.

**Checkpoint**: Frontend round-trip works against backend. End-to-end MVP achieved.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T054 [P] Update `docs/ARCHITECTURE.md` with `ShipStateService` (in-memory Map + dirty flush via SHIP_UPDATE subscriber) and `CommandRouter` (alias-keyed registry, dispatch path) boxes; add the gateway `command` / `command:result` arrows.
- [X] T055 [P] Update `docs/PROGRESS.md` with feature 003 entry: completed items, test counts (target ≥35 backend, ≥6 frontend per SC-007), explicit deferrals to features 005/006 (rotation engine, gates, full report cargo/wpns, movement physics).
- [X] T056 [P] Update `docs/GAME_MECHANICS.md` with one section per command: `cmd_scan`, `cmd_report`, `cmd_rotate`, `cmd_impulse`, `cmd_warp` — each with its `GECMDS.C` line anchor and one-paragraph behaviour summary.
- [X] T057 [P] Update `docs/DECISIONS.md` with the 2026-05-01 entry for "Active ship resolved on socket handshake — no in-game BOARD command" (research.md Decision 8) and "Original-game response strings reconstructed from wiki + prfmsg signatures" (research.md Decision 4).
- [X] T058 Run the full quickstart.md flow end-to-end (sections 1–7): backend boot → frontend boot → five command smoke test → persistence cadence verification → error-path verification → backend test count ≥ 323 → frontend test count ≥ 6. **SC-005 manual check (no automated harness):** with backend on localhost and frontend at `http://localhost:5173`, type `report nav` in the browser command input and observe that the response lines appear in the event log subjectively instantaneously (no perceptible delay). If there is a visible lag on a localhost dev network, treat as a defect — measure with browser DevTools network tab and record the median round-trip in `docs/PROGRESS.md` for triage. Record any deviations in `docs/PROGRESS.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — frontend bootstrap can start immediately.
- **Phase 2 (Foundational)**: T007–T011 are parallelisable; T013 depends on T007/T008; T014 depends on T013 + existing `TickService`; T017 depends on T009/T010; T020/T021 depend on T013/T017; T023 depends on T020. **Phase 2 must complete before Phases 3–5 can begin.**
- **Phase 3 (US1)**: Depends on Phase 2. Internally: T024/T025/T026 are parallel; T027 depends on all three; T028/T029/T030 are parallel and can write tests in parallel with handlers; T031 depends on T020/T021/T027.
- **Phase 4 (US2)**: Depends on Phase 2. Independent of Phase 3 (different handlers, different tests). T032 first; T033/T034 parallel after T032; T035 depends on both; T036/T037 parallel; T038 depends on T035.
- **Phase 5 (US3)**: Depends on Phase 2 (router exists) and benefits from Phases 3/4 being merged so error coverage spans real handlers. T039 and T040 are parallel.
- **Phase 6 (US4)**: Depends on Phase 1 (frontend bootstrap) and at least the `command`/`command:result` contract from Phase 2 (T020/T021). Internally: T041 first; T042 depends on T041; T043–T046 parallel after T042; T047 depends on T043–T046; T048–T053 are all parallel and depend on the component each tests.
- **Phase 7 (Polish)**: Depends on Phases 3–6 being complete and green. T054–T057 are parallel; T058 last.

### User Story Dependencies

- **US1 (P1, MVP)**: Phase 2 only — no inter-story dependencies. Standalone shippable as MVP backend.
- **US2 (P1)**: Phase 2 only — independent of US1. Can be developed in parallel with US1.
- **US3 (P2)**: Phase 2 + benefits from US1/US2 handlers existing for full error coverage; the router-only tests (T039) are independent.
- **US4 (P1, terminal frontend)**: Phase 1 + the gateway `command` channel from Phase 2 (T020/T021). Can be developed in parallel with US1/US2/US3 once the contract is stable.

### Parallel Opportunities

- T002, T003, T004, T006 in parallel after T001.
- T007, T008, T009, T010, T011, T012 in parallel (six independent files).
- T024, T025, T026 in parallel; T028, T029, T030 in parallel.
- T033, T034 in parallel; T036, T037 in parallel.
- T041 then T042; T043–T046 in parallel; T048–T053 in parallel.
- T054–T057 in parallel.

---

## Parallel Example: Phase 2 Foundational

```bash
# Six independent backend foundation files — launch in parallel:
Task: "Create backend/src/game/ship/ship-state.types.ts (T007)"
Task: "Create backend/src/game/ship/ship-state.mappers.ts (T008)"
Task: "Create backend/src/game/commands/command.types.ts (T009)"
Task: "Create backend/src/game/commands/messages.ts (T010)"
Task: "Create backend/src/game/commands/validators.ts (T011)"
Task: "Create backend/test/unit/validators.spec.ts (T012)"
```

## Parallel Example: User Story 1 handlers + tests

```bash
Task: "Create rotate.handler.ts (T024)"
Task: "Create impulse.handler.ts (T025)"
Task: "Create warp.handler.ts (T026)"
Task: "Create rotate.spec.ts (T028)"
Task: "Create impulse.spec.ts (T029)"
Task: "Create warp.spec.ts (T030)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup (T001–T006) — frontend scaffolds, but backend US1 can ship without the frontend if needed.
2. Phase 2: Foundational (T007–T023) — non-negotiable.
3. Phase 3: US1 (T024–T031) — flight commands persist correctly.
4. **STOP and VALIDATE**: backend integration test green; manual `rot 45` round-trip via a `wscat` client confirms persistence within 1 s. SC-002, SC-003, SC-006 verified.
5. Optionally ship the backend MVP behind a flag while US2/US3/US4 land.

### Incremental Delivery

1. Foundation → US1 (MVP backend) → US2 (inspection commands) → US3 (forgiving input polish) → US4 (frontend) → Polish.
2. Each story end-checkpoint demonstrates new capability without breaking prior.
3. Frontend (US4) can land in parallel with US2/US3 once Phase 2's gateway contract is stable.

### Parallel Team Strategy

- Dev A: Phase 2 foundation, then US1.
- Dev B: Phase 2 foundation, then US2 (after T032 unblocks).
- Dev C: Phase 1 setup, then US4 once T020/T021 contract lands.
- Dev D: US3 router tests (T039) once router exists; cross-cuts US1/US2 work.

---

## Notes

- [P] tasks = different files, no dependency on incomplete tasks.
- [Story] label maps task to spec user story for traceability.
- Tests for backend handlers (T028–T030, T036–T037) are mandatory per Constitution II and target SC-007's ≥35 new backend tests; together with T012, T016, T019, T023, T031, T038, T039, T040 the count is well above 35.
- Frontend tests (T006, T048–T053) total seven, exceeding SC-007's ≥6 minimum.
- Verify each test fails before its implementation lands where TDD applies.
- Commit after each task or each parallel batch — see `.specify/extensions.yml` `after_implement` hook.
- Avoid: mixing files that are owned by different tasks in the same batch; cross-story dependencies that defeat US independence.
