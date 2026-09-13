# Restructure Phase 2 — Split the Gateway — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `backend/src/gateway/game.gateway.ts` from 2,743 lines to a transport shell under ~600 lines by moving narration, death handling, sector transition and emission plumbing into focused collaborators — with zero change to what any client receives on the wire.

**Architecture:** Extraction proceeds pure-first. The established pattern in `backend/src/gateway/` is small modules of exported, documented, individually-testable pure functions (`player-visibility.ts`, `socket-cap.ts`, `transition-visibility.ts`), NOT injected classes — so most of this phase adds files of that shape and leaves the `GameGateway` constructor alone. Only the two stateful extractions (death handling, connection lifecycle) become injectable services, and both land only after a test-factory seam makes the 11-argument constructor editable from one place.

**Tech Stack:** NestJS 10, TypeScript 6.0.3, Jest 30, Socket.io, `@ge/wire` typed event contract (Phase 1).

**Spec:** `docs/superpowers/specs/2026-09-10-restructure-design.md` — the "Phase 2 — split the gateway" section.

## Global Constraints

Copied from the spec. Every task's requirements implicitly include these.

- **Zero gameplay change.** Every task is structural. If a task would change what a
  player sees, it is out of scope — stop and report it.
- **`VERSION` is NOT bumped during the restructure phases.** Rick's explicit
  instruction. The version bump happens once, when the branch merges.
- **Branch is `restructure`. Nothing goes to master.** The CI push trigger is
  master-only and the image job is gated on `github.event_name == 'push'`, so no
  commit on this branch can deploy. Do not touch `.github/workflows/ci.yml`'s
  `on:` block or that gate.
- **One commit per coherent step, suite green at each.** A task that leaves the
  suite red is not complete.
- **Run only ONE jest process at a time.** Concurrent runs race the shared
  `ge_test` database and produce phantom failures. This applies across tasks too:
  never background a suite run and start another.
- **Never pipe a test run through `tail`/`head`.** It discards the failing test's
  name and masks the exit code. Redirect to a file and grep it instead. (This is
  GitHub issue #5's root cause.)
- **The C source is authoritative.** Every `@see GEFUNCS.C:...` comment in moved
  code moves WITH it, unchanged. Do not re-derive, re-word, or "tidy" a canon
  citation while relocating it — if a comment looks wrong, leave it and report it.
- **TDD.** Failing test first, watch the red, then implement.
- **No `any`, no `as never`, no non-null assertions in new code.** Phase 1
  established the typed wire contract; new files consume it.

## Baseline — measure before you start

Recorded 2026-09-11 on `restructure` at `5403b7f`:

| | value |
|---|---|
| `backend/src/gateway/game.gateway.ts` | 2,743 lines |
| `@OnEvent` handlers in it | 37, totalling 798 lines (a 38th `@OnEvent` grep hit is prose inside a comment at line 1291, not a decorator — CORRECTED 2026-09-11 during Task 3 review) |
| `@SubscribeMessage` handlers | 2 |
| `this.prisma` call sites in it | 10 |
| constructor parameters | 11 |
| test files constructing `GameGateway` directly | 43 files, 51 sites |
| backend suite | 609 suites / 6,161 tests |

**Region map of the current file** — use these line numbers to locate code, but
re-grep before editing; they shift as tasks land.

| lines | region |
|---|---|
| 1–235 | imports and local types |
| 236–289 | class declaration, fields, constructor |
| 290–948 | connection lifecycle — connect, ship entry, boarding, rooms, disconnect |
| 949–1358 | command intake — `@SubscribeMessage`, prompt replies, ship select |
| 1359–2582 | 38 `@OnEvent` domain-event handlers |
| 2583–2743 | emission plumbing — `emitCommandResult`, `processBroadcasts`, `dispatchBroadcast`, `emitToSockets`, `roomMembers` |

**The handler-size distribution is why this plan is ordered as it is.** Four
handlers hold 63% of all handler code:

| lines | handler |
|---|---|
| 256 | `handleCombatShipDestroyed` |
| 119 | `handleSectorTransition` |
| 81 | `handleCombatHit` |
| 45 | `handlePhysicsHyperspace` |
| 297 | the other 33 handlers combined |

Twenty-six handlers are 12 lines or fewer and nearly all share one shape:
`event → (room, category, text)` followed by a single `.emit()`. That shape is a
table, not code, and Task 3 turns it into one.

---

### Task 1: The test-factory seam

**Why first:** 43 test files call `new GameGateway(a, b, c, d, e, f, g, h, i, j, k)`
with 11 positional arguments at 51 sites. Every later task that touches the
constructor would otherwise edit 43 files and be unreviewable. This task changes
zero production code and makes the constructor editable from one place.

**Files:**
- Create: `backend/test/helpers/make-gateway.ts`
- Modify: all 43 test files containing `new GameGateway(`
- Test: `backend/test/helpers/make-gateway.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `makeGateway(overrides?: Partial<GatewayDeps>): GameGateway` and the
  exported `interface GatewayDeps` naming all 11 dependencies by name. Every later
  task that adds or removes a constructor parameter edits `make-gateway.ts` and
  nothing else in `backend/test/`.

- [ ] **Step 1: Inventory the call sites**

Run this and keep the output — it is the checklist for Step 4:

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
grep -rn "new GameGateway(" test/ > /tmp/gateway-sites.txt
wc -l /tmp/gateway-sites.txt   # expect 51
cut -d: -f1 /tmp/gateway-sites.txt | sort -u | wc -l   # expect 43
```

- [ ] **Step 2: Write the failing test**

Create `backend/test/helpers/make-gateway.spec.ts`:

```typescript
import { makeGateway } from './make-gateway';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ShipStateService } from '../../src/game/ship/ship-state.service';

describe('makeGateway', () => {
  it('builds a GameGateway with every dependency defaulted', () => {
    const gateway = makeGateway();
    expect(gateway).toBeInstanceOf(GameGateway);
  });

  it('lets one dependency be overridden by name, leaving the rest defaulted', () => {
    const shipStateService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ShipStateService;
    const gateway = makeGateway({ shipStateService });
    // Reach the injected dep through a method that uses it rather than a cast:
    // emitToSockets asks shipStateService.get for every candidate socket.
    expect((gateway as unknown as { shipStateService: ShipStateService }).shipStateService)
      .toBe(shipStateService);
  });

  it('gives each call its own dependency instances, so tests cannot leak state', () => {
    const a = makeGateway();
    const b = makeGateway();
    expect((a as unknown as { registry: unknown }).registry)
      .not.toBe((b as unknown as { registry: unknown }).registry);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/helpers/make-gateway.spec.ts 2>&1 | tee /tmp/red.txt
grep -E "Cannot find module|FAIL" /tmp/red.txt
```

Expected: FAIL — `Cannot find module './make-gateway'`.

- [ ] **Step 4: Write the factory**

Create `backend/test/helpers/make-gateway.ts`. Read the real constructor first
(`sed -n '265,277p' src/gateway/game.gateway.ts`) and mirror its parameter order
exactly. The defaults must be inert — a default must never make a test pass by
accident, so every default method is a `jest.fn()` returning a neutral value.

```typescript
/**
 * Builds a GameGateway for unit tests with every dependency defaulted to an
 * inert double, overridable by NAME rather than position.
 *
 * This exists because the gateway's constructor takes 11 positional arguments
 * and 43 test files were calling it directly. Every restructure task that adds
 * or removes a dependency would otherwise be a 43-file diff no reviewer could
 * read. Change the constructor, change this file; the specs do not move.
 *
 * Defaults are deliberately inert: a default returns undefined / empty rather
 * than something plausible, so a test that depends on a collaborator must say
 * so by overriding it. A helpful default is how a factory starts making tests
 * pass for reasons their authors did not choose.
 */
import { GameGateway } from '../../src/gateway/game.gateway';
// ... import each dependency's type

export interface GatewayDeps {
  shipStateService: ShipStateService;
  commandRouter: CommandRouterService;
  registry: ConnectedShipsRegistry;
  wsAuthGuard: WsAuthGuard;
  prisma: PrismaService;
  onboardingService: OnboardingService;
  scanHandler: ScanHandlerService;
  shipClassCache: ShipClassCacheService;
  random: Random;
  events: EventEmitter2;
  presence: PresenceService;
}

export function makeGateway(overrides: Partial<GatewayDeps> = {}): GameGateway {
  const deps: GatewayDeps = {
    shipStateService: { get: jest.fn(), list: jest.fn(() => []) } as unknown as ShipStateService,
    commandRouter: { dispatch: jest.fn() } as unknown as CommandRouterService,
    registry: new ConnectedShipsRegistry(),
    wsAuthGuard: { verify: jest.fn() } as unknown as WsAuthGuard,
    prisma: {} as unknown as PrismaService,
    onboardingService: {} as unknown as OnboardingService,
    scanHandler: { clearScantab: jest.fn(), lettersFor: jest.fn(() => []) } as unknown as ScanHandlerService,
    shipClassCache: { getTypeName: jest.fn() } as unknown as ShipClassCacheService,
    random: (() => 0) as unknown as Random,
    events: { emit: jest.fn(), on: jest.fn() } as unknown as EventEmitter2,
    presence: new PresenceService(),
    ...overrides,
  };

  return new GameGateway(
    deps.shipStateService,
    deps.commandRouter,
    deps.registry,
    deps.wsAuthGuard,
    deps.prisma,
    deps.onboardingService,
    deps.scanHandler,
    deps.shipClassCache,
    deps.random,
    deps.events,
    deps.presence,
  );
}
```

Verify the real constructor's parameter names and types before committing to the
above — if they differ, the real signature wins and this block is corrected to match.

- [ ] **Step 5: Run it and watch it pass**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/helpers/make-gateway.spec.ts 2>&1 | tee /tmp/green.txt
grep -E "Tests:|FAIL" /tmp/green.txt
```

Expected: 3 passed.

- [ ] **Step 6: Commit the factory alone**

```bash
git add test/helpers/make-gateway.ts test/helpers/make-gateway.spec.ts
git commit -m "test(gateway): a named-argument factory for GameGateway"
```

Committing before the migration means a reviewer can read the factory on its own,
and a botched migration reverts without losing it.

- [ ] **Step 7: Migrate the 51 call sites, one file at a time**

For each file in the Step 1 inventory, replace the positional construction with a
`makeGateway({ ... })` call naming only the dependencies that file actually
stubs. **Do not batch this into a regex sweep** — the argument lists vary, and a
mechanical rewrite will silently pair the wrong stub with the wrong slot, which
is exactly the failure mode positional arguments cause and this task exists to end.

After each file:

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest <that-file> 2>&1 | tee /tmp/one.txt
grep -E "Tests:|FAIL" /tmp/one.txt
```

- [ ] **Step 8: Verify nothing constructs the gateway positionally any more**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
grep -rn "new GameGateway(" test/ | grep -v "helpers/make-gateway.ts"
```

Expected: no output.

- [ ] **Step 9: Full suite, then commit**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx tsc --noEmit 2>&1 | tee /tmp/tsc.txt; echo "tsc exit: ${PIPESTATUS[0]}"
npx jest 2>&1 | tee /tmp/full.txt; echo "jest exit: ${PIPESTATUS[0]}"
grep -E "Tests:|Suites:|FAIL" /tmp/full.txt
```

Expected: 609 suites / 6,161 tests passing, tsc clean, both exit 0. The test count
rises by 3 from this task's own spec — 6,164 total is correct.

```bash
git add -A test/
git commit -m "test(gateway): construct GameGateway by name, not by position

43 files called an 11-argument constructor positionally. Every restructure
task that touches that signature would have been a 43-file diff. They now go
through test/helpers/make-gateway.ts and the signature has one consumer."
```

---

### Task 2: Extract the emission plumbing

**Why second:** lines 2583–2743 are the most self-contained region in the file and
already transport-only. They depend on exactly two things beyond their arguments
(`this.server` and `this.shipStateService.get`), both of which can be passed in.
Extracting them proves the pattern before anything riskier.

**Files:**
- Create: `backend/src/gateway/broadcast-dispatch.ts`
- Modify: `backend/src/gateway/game.gateway.ts:2583-2743`
- Test: `backend/test/gateway/broadcast-dispatch.spec.ts`

**Interfaces:**
- Consumes: `makeGateway` from Task 1 (for the gateway-side regression check).
- Produces:
  - `dispatchBroadcast(target: BroadcastTarget, broadcast: CommandBroadcast): void`
  - `emitToSockets(server: GameServer, broadcast: CommandBroadcast, members: Set<string> | undefined, excludeId: string | undefined, accept: (ship: ShipState) => boolean, lookup: (userid: string, shipno: number) => ShipState | undefined): void`
  - `roomMembers(server: GameServer, room: string): Set<string>`
  Task 3 and Task 5 both emit through `dispatchBroadcast`.

- [ ] **Step 1: Read the region you are moving**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
sed -n '2583,2743p' src/gateway/game.gateway.ts
```

Note the exhaustiveness assertion in `dispatchBroadcast`'s `default:` branch. It
is load-bearing — it is what makes a sixth `CommandBroadcast` variant a compile
error instead of a silently vanishing broadcast. **It moves verbatim.**

- [ ] **Step 2: Write the failing test**

Create `backend/test/gateway/broadcast-dispatch.spec.ts`:

```typescript
import { dispatchBroadcast, roomMembers } from '../../src/gateway/broadcast-dispatch';
import type { CommandBroadcast } from '../../src/game/commands/command.types';

describe('dispatchBroadcast', () => {
  it('emits command.notice with its own payload', () => {
    const emit = jest.fn();
    const broadcast: CommandBroadcast = {
      room: 'sector:0:0',
      event: 'command.notice',
      payload: { text: 'hello' },
    };
    dispatchBroadcast({ emit } as never, broadcast);
    expect(emit).toHaveBeenCalledWith('command.notice', { text: 'hello' });
  });

  it('resolves player.snapshot to nothing — the caller handles it before dispatch', () => {
    const emit = jest.fn();
    const broadcast: CommandBroadcast = {
      room: 'galaxy',
      event: 'player.snapshot',
      payload: undefined,
    } as unknown as CommandBroadcast;
    dispatchBroadcast({ emit } as never, broadcast);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('roomMembers', () => {
  it('returns the room members when the room exists', () => {
    const server = { sockets: { adapter: { rooms: new Map([['sector:1:1', new Set(['a', 'b'])]]) } } };
    expect(roomMembers(server as never, 'sector:1:1')).toEqual(new Set(['a', 'b']));
  });

  it('returns an empty set when the room is gone', () => {
    const server = { sockets: { adapter: { rooms: new Map() } } };
    expect(roomMembers(server as never, 'sector:9:9')).toEqual(new Set());
  });
});
```

Correct the `CommandBroadcast` literals above against the real union in
`src/game/commands/command.types.ts:34-44` before running — Phase 1 made it a
discriminated union, and a literal that does not match a real variant will fail to
compile rather than fail the assertion.

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/gateway/broadcast-dispatch.spec.ts 2>&1 | tee /tmp/red.txt
grep -E "Cannot find module|FAIL" /tmp/red.txt
```

Expected: FAIL — `Cannot find module '../../src/gateway/broadcast-dispatch'`.

- [ ] **Step 4: Move the three functions**

Create `backend/src/gateway/broadcast-dispatch.ts`. Move `dispatchBroadcast`,
`emitToSockets` and `roomMembers` out of the class as exported functions, taking
`server` and a `lookup` callback where they used `this`. **Every JSDoc block and
every `@see` citation moves with its function, unchanged.**

- [ ] **Step 5: Repoint the gateway**

In `game.gateway.ts`, delete the three methods and import the functions. The three
private call sites in `processBroadcasts` become:

```typescript
const members = broadcast.room === 'galaxy' ? undefined : roomMembers(this.server, broadcast.room);
emitToSockets(this.server, broadcast, members, excludeId, (ship) => ship.freq.includes(broadcast.freq as number), (uid, shipno) => this.shipStateService.get(uid, shipno));
```

`processBroadcasts` and `emitCommandResult` stay on the class for now — they are
the gateway's own transport surface and Task 6 revisits them.

- [ ] **Step 6: Run the new test and the existing gateway suite**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/gateway/ 2>&1 | tee /tmp/green.txt
grep -E "Tests:|Suites:|FAIL" /tmp/green.txt
```

Expected: all green. `gateway-broadcast-branches.spec.ts` and
`command-serialization.spec.ts` are the two that exercise this region hardest —
if either fails, the move changed behaviour and must be corrected, not the test.

- [ ] **Step 7: Full suite and commit**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx tsc --noEmit; echo "tsc exit: $?"
npx jest 2>&1 | tee /tmp/full.txt; echo "jest exit: ${PIPESTATUS[0]}"
grep -E "Tests:|Suites:|FAIL" /tmp/full.txt
```

```bash
git add -A src/gateway/ test/gateway/
git commit -m "refactor(gateway): move broadcast dispatch to its own module

dispatchBroadcast, emitToSockets and roomMembers took nothing from the class
but the server and a ship lookup. They are now pure functions with their own
spec, and the exhaustiveness assertion that makes a new CommandBroadcast
variant a compile error moved with them unchanged."
```

---

### Task 3: Turn the one-shape handlers into a narration table

**Why:** 26 of the 38 `@OnEvent` handlers are 12 lines or fewer, and nearly all are
the same shape — derive a room, pick a category, format a message, emit one
`event.log`. That is data. Expressing it as data makes each line individually
testable and makes the next canon correction a one-line edit rather than a hunt
through a 2,700-line file.

**Files:**
- Create: `backend/src/gateway/narration.ts`
- Modify: `backend/src/gateway/game.gateway.ts` — the 26 short handlers
- Test: `backend/test/gateway/narration.spec.ts`

**Interfaces:**
- Consumes: `dispatchBroadcast` is NOT used here — narration emits `event.log`
  directly through the gateway's `server`.
- Produces: `interface Narration { room: string; category: EventLogCategory; text: string }`
  and one exported pure function per handled event, e.g.
  `narrateShieldCharge(event: ShipShieldChargeEvent): Narration`.

- [ ] **Step 1: Identify exactly which handlers qualify**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
grep -n "@OnEvent" src/gateway/game.gateway.ts
```

A handler qualifies when its whole body is: compute a room string, compute a
category and text, and make exactly ONE `.emit('event.log', ...)` call. A handler
that emits twice, touches `this.registry`, reads `this.prisma`, or mutates any
field does NOT qualify and stays where it is. Expect around 20 to qualify of the
26 short ones — **report the exact list you found and the ones you rejected, with
the reason for each rejection.** Do not force a handler to qualify by moving its
side effect.

- [ ] **Step 2: Write the failing test**

Create `backend/test/gateway/narration.spec.ts`. One case per narration function.
The three below are the pattern; write the full set for every function you extract.

```typescript
import { narrateUniverseEdge, narrateShieldCharge, narrateSpeedReport } from '../../src/gateway/narration';
import { MessageId, formatMessage } from '../../src/game/commands/messages';

describe('narrateUniverseEdge', () => {
  it('addresses the pilot by user room and reports the hull damage', () => {
    expect(narrateUniverseEdge({ shipId: 'rick:1', damage: 42 } as never)).toEqual({
      room: 'user:rick',
      category: 'combat',
      text: '** You strike the galactic perimeter. All way comes off and the hull takes 42 damage. **',
    });
  });
});

describe('narrateShieldCharge', () => {
  it('reports SHLDUP at full charge', () => {
    expect(narrateShieldCharge({ shipId: 'rick:1', kind: 'full', percent: 100 } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: formatMessage(MessageId.SHLDUP),
    });
  });

  it('reports SHLDAT with the percentage while charging', () => {
    expect(narrateShieldCharge({ shipId: 'rick:1', kind: 'charging', percent: 60 } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: formatMessage(MessageId.SHLDAT, 60),
    });
  });
});

describe('narrateSpeedReport', () => {
  it('reports SPEED0 on a dead stop', () => {
    expect(narrateSpeedReport({ userid: 'rick', speed: 0 } as never).text)
      .toBe(formatMessage(MessageId.SPEED0));
  });

  it('renders a live speed through showarp, not as a split number', () => {
    // SPEEDIS takes ONE arg — canon's showarp figure. The port once split the
    // number and printed "warp 10 point 00". @see GEFUNCS.C:2674
    expect(narrateSpeedReport({ userid: 'rick', speed: 3 } as never).text)
      .toBe(formatMessage(MessageId.SPEEDIS, showarp(3)));
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/gateway/narration.spec.ts 2>&1 | tee /tmp/red.txt
grep -E "Cannot find module|FAIL" /tmp/red.txt
```

Expected: FAIL — `Cannot find module '../../src/gateway/narration'`.

- [ ] **Step 4: Write the narration module**

Create `backend/src/gateway/narration.ts`. One exported function per event.
**Every JSDoc block and `@see` citation moves from the handler to its narration
function, unchanged** — those comments are the canon derivation and they are the
most valuable thing in the region.

```typescript
import { EventLogCategory } from '@ge/wire';

/** A single line of narration and the room it belongs to. */
export interface Narration {
  room: string;
  category: EventLogCategory;
  text: string;
}

/**
 * Shield charge narration — SHLDAT each tick while charging, SHLDUP at full
 * (GEFUNCS.C:2515-2523). Captain's own socket only; C uses
 * `outprfge(FILTER,usrn)`, not a sector broadcast.
 */
export function narrateShieldCharge(event: ShipShieldChargeEvent): Narration {
  return {
    room: `user:${useridOf(event.shipId)}`,
    category: 'system',
    text: event.kind === 'full'
      ? formatMessage(MessageId.SHLDUP)
      : formatMessage(MessageId.SHLDAT, event.percent),
  };
}
```

- [ ] **Step 5: Reduce each handler to one line**

In `game.gateway.ts`, each qualifying handler becomes:

```typescript
  @OnEvent(SHIP_SHIELD_CHARGE)
  handleShipShieldCharge(event: ShipShieldChargeEvent): void {
    this.emitNarration(narrateShieldCharge(event));
  }
```

with one new private helper on the class:

```typescript
  /** Emit one narration line to the room it names. */
  private emitNarration({ room, category, text }: Narration): void {
    this.server.to(room).emit('event.log', { category, text });
  }
```

- [ ] **Step 6: Run the gateway suite**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/gateway/ 2>&1 | tee /tmp/green.txt
grep -E "Tests:|Suites:|FAIL" /tmp/green.txt
```

Expected: all green. `gateway-event-coverage.spec.ts` is the one that asserts
every `@OnEvent` is wired — it must still pass, because the decorators do not move.

- [ ] **Step 7: Full suite and commit**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx tsc --noEmit; echo "tsc exit: $?"
npx jest 2>&1 | tee /tmp/full.txt; echo "jest exit: ${PIPESTATUS[0]}"
grep -E "Tests:|Suites:|FAIL" /tmp/full.txt
```

```bash
git add -A src/gateway/ test/gateway/
git commit -m "refactor(gateway): express one-shape event narration as data

~20 of the 38 OnEvent handlers were the same four lines with different
message ids: derive a room, pick a category, format a message, emit one
event.log. They are now pure functions with their own spec, and each canon
citation sits next to the line it justifies rather than in a 2,700-line file."
```

---

### Task 4: Extract the death handler

**Why:** `handleCombatShipDestroyed` is 256 lines — 9% of the file on its own — and
holds a `prisma.$transaction`, which is the single clearest violation of the
spec's "transport only: no game logic, no Prisma" requirement.

**This is the highest-risk task in the phase.** A ship dying is the most
consequential event in the game and it touches hull rows, spoils, the kill report,
the captured-document reveal and the victim's recovery. Five existing spec files
cover it and all five must stay green untouched.

**Files:**
- Create: `backend/src/gateway/ship-destroyed.service.ts`
- Modify: `backend/src/gateway/game.gateway.ts` — `handleCombatShipDestroyed` (1613–1869), `recoverAfterDeath`, `revealCapturedDocument`, `shipLossManifest`, `shipNameOf`
- Modify: `backend/src/gateway/gateway.module.ts` — register the new provider
- Modify: `backend/test/helpers/make-gateway.ts` — one new dependency
- Test: `backend/test/gateway/ship-destroyed.service.spec.ts`

**Interfaces:**
- Consumes: `makeGateway` and `GatewayDeps` from Task 1 — this task adds
  `shipDestroyed: ShipDestroyedService` to that interface and to the constructor.
  It is the FIRST task to change the constructor, which is why Task 1 comes first.
- Produces: `class ShipDestroyedService` with
  `handle(event: CombatShipDestroyedEvent, emit: DestroyedEmitter): Promise<void>`,
  where `DestroyedEmitter` is the narrow interface below. Task 5 does not depend on it.

- [ ] **Step 1: Read all 256 lines before changing anything**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
sed -n '1613,1875p' src/gateway/game.gateway.ts
sed -n '1276,1358p' src/gateway/game.gateway.ts   # shipLossManifest, shipNameOf
sed -n '1577,1612p' src/gateway/game.gateway.ts   # revealCapturedDocument
sed -n '1876,1895p' src/gateway/game.gateway.ts   # recoverAfterDeath
```

List every distinct side effect before you move any of them. There are at least
six: the hull write transaction, the spoils transfer, the kill report, the
captured-document reveal, the victim's socket recovery, and the sector
announcement. **Report that list before proceeding** — if you cannot enumerate
them, you cannot verify the move preserved them.

- [ ] **Step 2: Read the five specs that guard it**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
ls test/gateway/combat-death-delete.spec.ts test/gateway/ship-loss-forensics.spec.ts \
   test/gateway/kill-salvage-report.spec.ts test/gateway/captured-document.spec.ts \
   test/gateway/destroyed-payload-scoping.spec.ts
```

These are the oracle. They do not change in this task. If one needs changing to
pass, the move was wrong.

- [ ] **Step 3: Define the emitter seam and write the failing test**

The service must not hold a `Server`. It receives a narrow emitter so it can be
tested without Socket.io at all:

```typescript
/** What the death path needs to say, and nothing else. */
export interface DestroyedEmitter {
  toRoom(room: string, category: EventLogCategory, text: string): void;
  toAll(category: EventLogCategory, text: string): void;
  recoverVictim(userid: string): Promise<void>;
}
```

Create `backend/test/gateway/ship-destroyed.service.spec.ts`:

```typescript
describe('ShipDestroyedService', () => {
  it('writes the victim hull away inside one transaction', async () => {
    const tx = jest.fn(async (fn) => fn({ ship: { update: jest.fn(), findFirst: jest.fn() } }));
    const service = new ShipDestroyedService({ $transaction: tx } as never, /* ...deps */);
    await service.handle(destroyedEvent({ victim: 'rick:1' }), emitterSpy());
    expect(tx).toHaveBeenCalledTimes(1);
  });

  it('tells the victim to recover after the hull is written, not before', async () => {
    const order: string[] = [];
    // assert ordering — a recovery that runs before the write re-boards a dead hull
  });
});
```

Write the full set from the six side effects enumerated in Step 1 — one case each.

- [ ] **Step 4: Run it and watch it fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/gateway/ship-destroyed.service.spec.ts 2>&1 | tee /tmp/red.txt
grep -E "Cannot find module|FAIL" /tmp/red.txt
```

- [ ] **Step 5: Move the body**

Create `backend/src/gateway/ship-destroyed.service.ts` as an `@Injectable()`.
Move `handleCombatShipDestroyed`'s body, plus `shipLossManifest`, `shipNameOf`,
`revealCapturedDocument` and `recoverAfterDeath`. Every comment and `@see` moves
unchanged.

The gateway keeps only the decorator and the emitter:

```typescript
  @OnEvent(COMBAT_SHIP_DESTROYED)
  handleCombatShipDestroyed(event: CombatShipDestroyedEvent): Promise<void> {
    return this.shipDestroyed.handle(event, {
      toRoom: (room, category, text) => this.server.to(room).emit('event.log', { category, text }),
      toAll: (category, text) => this.server.emit('event.log', { category, text }),
      recoverVictim: (userid) => this.recoverAfterDeath(userid),
    });
  }
```

**`handleKillReport` at line 2108 also listens to `COMBAT_SHIP_DESTROYED`.** Two
handlers on one event is deliberate. Leave the second one exactly where it is —
merging them changes emission order, which is a wire-visible change and out of scope.

- [ ] **Step 6: Register the provider and extend the test factory**

In `gateway.module.ts` add `ShipDestroyedService` to `providers`. In
`make-gateway.ts` add `shipDestroyed` to `GatewayDeps` with an inert default and
pass it in the right constructor position. **This is the payoff from Task 1 — the
43 spec files do not change.** Confirm that:

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
git diff --stat test/ | tail -3
```

Expected: only `make-gateway.ts` and the new spec.

- [ ] **Step 7: Run the five guard specs, then the full suite**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/gateway/combat-death-delete.spec.ts test/gateway/ship-loss-forensics.spec.ts \
  test/gateway/kill-salvage-report.spec.ts test/gateway/captured-document.spec.ts \
  test/gateway/destroyed-payload-scoping.spec.ts 2>&1 | tee /tmp/guards.txt
grep -E "Tests:|FAIL" /tmp/guards.txt

npx tsc --noEmit; echo "tsc exit: $?"
npx jest 2>&1 | tee /tmp/full.txt; echo "jest exit: ${PIPESTATUS[0]}"
grep -E "Tests:|Suites:|FAIL" /tmp/full.txt
```

- [ ] **Step 8: Commit**

```bash
git add -A src/gateway/ test/
git commit -m "refactor(gateway): move the death path out of the transport layer

handleCombatShipDestroyed was 256 lines holding a prisma transaction — the
clearest breach of the rule that the gateway parses in, dispatches and
serialises out. It is now a service behind a three-method emitter interface,
testable without Socket.io. The five specs that guard a ship dying are
unchanged, which is the point."
```

---

### Task 5: Extract the sector-transition handler

**Files:**
- Create: `backend/src/gateway/sector-transition.ts`
- Modify: `backend/src/gateway/game.gateway.ts` — `handleSectorTransition` (2386–2508)
- Test: `backend/test/gateway/sector-transition.spec.ts`

**Interfaces:**
- Consumes: `scopePlayers` from `player-visibility.ts` and the helpers in
  `transition-visibility.ts`, both of which already exist and do not change.
- Produces: `planTransition(event, roster, lookup): TransitionPlan` where
  `TransitionPlan` lists the room joins, room leaves and emits to perform. Pure.

- [ ] **Step 1: Read the handler and its existing guard spec**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
sed -n '2386,2509p' src/gateway/game.gateway.ts
cat test/gateway/sector-transition-notices.spec.ts
cat src/gateway/transition-visibility.ts
```

This handler is 119 lines and already has a pure-function neighbour
(`transition-visibility.ts`) written for exactly this purpose. Follow that file's
style — it is the template.

- [ ] **Step 2: Write the failing test**

Create `backend/test/gateway/sector-transition.spec.ts`:

```typescript
import { planTransition } from '../../src/gateway/sector-transition';

describe('planTransition', () => {
  it('leaves the old sector room and joins the new one', () => {
    const plan = planTransition(
      { shipId: 'rick:1', userid: 'rick', from: { x: 0, y: 0 }, to: { x: 1, y: 0 } } as never,
      [],
      () => undefined,
    );
    expect(plan.leave).toEqual(['sector:0:0']);
    expect(plan.join).toEqual(['sector:1:0']);
  });

  it('gives the mover a roster scoped to the sector they arrived in, not the one they left', () => {
    // The mover must never hold a position they may not show — filtering in the
    // UI leaks straight back out through devtools. @see gateway/player-visibility.ts
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/gateway/sector-transition.spec.ts 2>&1 | tee /tmp/red.txt
grep -E "Cannot find module|FAIL" /tmp/red.txt
```

- [ ] **Step 4: Write the planner and reduce the handler**

Create `backend/src/gateway/sector-transition.ts` returning a plan; the gateway
handler executes it. Comments and `@see` citations move unchanged.

- [ ] **Step 5: Run the suite and commit**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/gateway/ 2>&1 | tee /tmp/green.txt
grep -E "Tests:|Suites:|FAIL" /tmp/green.txt
npx tsc --noEmit; echo "tsc exit: $?"
npx jest 2>&1 | tee /tmp/full.txt; echo "jest exit: ${PIPESTATUS[0]}"
grep -E "Tests:|Suites:|FAIL" /tmp/full.txt
```

```bash
git add -A src/gateway/ test/gateway/
git commit -m "refactor(gateway): plan a sector transition as data, execute it thinly"
```

---

### Task 6: Extract the connection lifecycle

**Why last of the gateway tasks:** lines 290–948 are 658 lines and the most stateful
region — JWT validation, ship resolution, boarding, room joins, the socket cap, and
the disconnect combat-kill. It also holds the bug class that produced the
`x`-with-one-ship disconnect, so it deserves the most settled ground beneath it.

**Files:**
- Create: `backend/src/gateway/connection-lifecycle.service.ts`
- Modify: `backend/src/gateway/game.gateway.ts:290-948`
- Modify: `backend/src/gateway/gateway.module.ts`
- Modify: `backend/test/helpers/make-gateway.ts`
- Test: `backend/test/gateway/connection-lifecycle.service.spec.ts`

**Interfaces:**
- Consumes: `GatewayDeps` from Task 1, extended once more.
- Produces: `class ConnectionLifecycleService` with `onConnect(client: GameSocket): Promise<void>`
  and `onDisconnect(client: GameSocket): Promise<void>`.

**Debt this task inherits and must collapse (added 2026-09-11 from Task 4's review):**

Task 4 left `DestroyedEmitter` with 7 members where the plan specified 3. Five are
correct and stay. The other items below exist only because the connection-lifecycle
region was still on the gateway when Task 4 ran — this task is what makes them
removable, and removing them is in scope here:

- **`recoverVictim` and `takeIonAttacker`** reach gateway-resident state
  (`presentShipEntry`, `lastIonAttacker`). Once that state lives in this service,
  both seams collapse.
- **`warn` and `error`** exist solely because `combat-death-delete.spec.ts:174` spies
  and `ship-loss-forensics.spec.ts:52,:126` assign on the GATEWAY's logger. Replace
  them with a service-owned `private readonly logger = new Logger(ShipDestroyedService.name)`
  and update those two specs **in the same commit** — editing them is in scope here,
  where it was forbidden in Task 4.
- **The `revealCapturedDocument` delegate** at `game.gateway.ts` has zero production
  callers and is kept alive only by `captured-document.spec.ts` calling the 2-arg entry
  point. Delete it when that spec is migrated to drive the service directly.
- **Stale line-number citations** in `gateway-command-branches.spec.ts:36-37,:698` point
  at `shipLossManifest`, `shipNameOf` and `handleOf`, all of which now live in other
  files. Sweep them.
- **`backend/src/gateway/broadcast-dispatch.ts`** imports `BroadcastTarget` and
  `GameServer` back from `game.gateway.ts`. Type-only, so it erases and there is no
  runtime cycle — but this task is the second consumer of those types, which is the
  point at which a shared `backend/src/gateway/types.ts` pays for itself. Move them.

- [ ] **Step 1: Read the region and name every side effect**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
sed -n '290,948p' src/gateway/game.gateway.ts
```

**Report the enumerated side-effect list before writing code.** The disconnect path
in particular decides whether a drop counts as a rage-quit kill, and
`CLIENT_SIDE_REASONS` at line 258 is the set that governs it. That constant moves
with the service and its comment moves unchanged — it cites `GEMAIN.C:warhupa`.

- [ ] **Step 2: Read the specs that guard this region**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
cat test/gateway/exit-with-one-ship.spec.ts
cat test/gateway/single-socket-per-ship.spec.ts
cat test/gateway/socket-cap-per-account.spec.ts
cat test/gateway/combat-disconnect.spec.ts
cat test/gateway/abandon-reentry.spec.ts
```

`exit-with-one-ship.spec.ts` guards a fixed bug: `x` with a single ship used to
self-displace the socket and fire `SESSION_REPLACED`. It must stay green untouched.

- [ ] **Step 3: Write the failing test**

Create `backend/test/gateway/connection-lifecycle.service.spec.ts` with one case
per enumerated side effect from Step 1, including:

```typescript
it('does not treat a server-side disconnect as a rage-quit kill', async () => {
  // 'server namespace disconnect' is NOT in CLIENT_SIDE_REASONS: a hot reload
  // must never cost a player their ship. @see GEMAIN.C:1397 warhupa
});

it('re-boards a single-ship captain without displacing their own socket', async () => {
  // The x-with-one-ship regression: upsert returned the same socket id, which
  // read as a replacement and disconnected the player.
});
```

- [ ] **Step 4: Run it and watch it fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/gateway/connection-lifecycle.service.spec.ts 2>&1 | tee /tmp/red.txt
grep -E "Cannot find module|FAIL" /tmp/red.txt
```

- [ ] **Step 5: Move the region**

Create the `@Injectable()` service. `handleConnection` and `handleDisconnect` keep
their `OnGatewayConnection` / `OnGatewayDisconnect` decorators on the gateway and
delegate. All comments and citations move unchanged.

- [ ] **Step 6: Register, extend the factory, verify test churn**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
git diff --stat test/ | tail -3
```

Expected: only `make-gateway.ts` and the new spec.

- [ ] **Step 7: Full suite and commit**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx tsc --noEmit; echo "tsc exit: $?"
npx jest 2>&1 | tee /tmp/full.txt; echo "jest exit: ${PIPESTATUS[0]}"
grep -E "Tests:|Suites:|FAIL" /tmp/full.txt
```

```bash
git add -A src/gateway/ test/
git commit -m "refactor(gateway): move the connection lifecycle to its own service"
```

---

### Task 7: Split the scan handler

**Why separate:** `scan.handler.ts` is 1,258 lines and is the spec's second Phase 2
bullet. It is independent of every gateway task and could run in parallel, but it
is ordered last so the gateway work has undivided attention.

**Files:**
- Create: `backend/src/game/commands/handlers/scan/scan-strings.ts`
- Create: `backend/src/game/commands/handlers/scan/scan-render.ts`
- Create: `backend/src/game/commands/handlers/scan/scan-planet.ts`
- Modify: `backend/src/game/commands/handlers/scan.handler.ts`
- Test: `backend/test/game/commands/scan-strings.spec.ts`, `.../scan-render.spec.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–6.
- Produces: `populationBand(total: bigint): string`, `stockpileBand(qty: bigint): string`,
  `showarpDisplay(speed: number): string`, `relativeBearing(...)`, and the
  `ENV_STRINGS` / `RES_STRINGS` / `SCAN*` constant tables.

- [ ] **Step 1: Read the file's shape**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
grep -n "^function \|^const \|^export \|  private \|  async " src/game/commands/handlers/scan.handler.ts
```

Lines 38–157 are already free functions and constant tables — pure, no `this`, and
the obvious first extraction. `scanPl` (955–1170) is 215 lines and is the second.

- [ ] **Step 2: Write the failing test for the string tables**

Create `backend/test/game/commands/scan-strings.spec.ts`:

```typescript
import { populationBand, stockpileBand } from '../../../src/game/commands/handlers/scan/scan-strings';

describe('populationBand', () => {
  it('bands a population against the canon thresholds', () => {
    // Read the real thresholds out of the current implementation before
    // writing these — the bands are canon and must not shift by one.
    expect(populationBand(0n)).toBe(/* the current value */);
  });
});
```

**Derive every expected value from the current implementation, not from memory.**
These are canon-derived bands; a wrong constant here is a silent gameplay change,
which the Global Constraints forbid.

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/game/commands/scan-strings.spec.ts 2>&1 | tee /tmp/red.txt
grep -E "Cannot find module|FAIL" /tmp/red.txt
```

- [ ] **Step 4: Move lines 38–157 into `scan/scan-strings.ts`**

Constants and pure functions only. Comments and `@see` citations move unchanged.

- [ ] **Step 5: Move the map rendering into `scan/scan-render.ts`**

`scanLo`, `buildSidePanel`, `scanLoFull` and `handleSectorScan` build the ASCII
map. Extract the grid-building as pure functions taking a ship and a projection,
returning the render payload. The `ScanHandlerService` methods become thin callers.

- [ ] **Step 6: Move `scanPl` into `scan/scan-planet.ts`**

- [ ] **Step 7: Run the scan suites, then the full suite**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/integration/scan-ra-gateway.spec.ts test/integration/scan-se-gateway.spec.ts \
  test/integration/scan-render-event.spec.ts 2>&1 | tee /tmp/scan.txt
grep -E "Tests:|FAIL" /tmp/scan.txt

npx tsc --noEmit; echo "tsc exit: $?"
npx jest 2>&1 | tee /tmp/full.txt; echo "jest exit: ${PIPESTATUS[0]}"
grep -E "Tests:|Suites:|FAIL" /tmp/full.txt
```

- [ ] **Step 8: Commit**

```bash
git add -A src/game/commands/handlers/ test/game/commands/
git commit -m "refactor(scan): split the 1,258-line scan handler by concern"
```

---

### Task 8: Close out the phase

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-restructure-design.md` — tick the Phase 2 boxes
- Modify: `docs/PROGRESS.md` — append
- Modify: `docs/DECISIONS.md` — append, only if a ruling was made
- Modify: `backend/src/game/CLAUDE.md` — only if the module map moved

- [ ] **Step 1: Measure the result against the baseline**

```bash
cd /home/rick/dev/galactic-empire-reborn
wc -l backend/src/gateway/*.ts backend/src/game/commands/handlers/scan.handler.ts \
      backend/src/game/commands/handlers/scan/*.ts
grep -c "this.prisma" backend/src/gateway/game.gateway.ts
```

Record the before/after table. The target is `game.gateway.ts` under ~600 lines
with zero `this.prisma` call sites.

- [ ] **Step 2: Verify the deploy gate is untouched**

```bash
cd /home/rick/dev/galactic-empire-reborn
git diff master -- .github/workflows/ci.yml | head -40
grep -n "branches:\|github.event_name" .github/workflows/ci.yml
```

Expected: `on.push.branches: [master]` and the `if: github.event_name == 'push'`
image gate both unchanged. **If this task's diff touches either, stop and report.**

- [ ] **Step 3: Verify both Docker images still build**

Phase 1 shipped without this check and the images were broken for a day. Do not
repeat it.

```bash
cd /home/rick/dev/galactic-empire-reborn
docker build -f backend/Dockerfile -t ge-backend-p2 . 2>&1 | tail -5
docker build -f frontend/Dockerfile -t ge-frontend-p2 . 2>&1 | tail -5
docker run --rm ge-backend-p2 node -e "require.resolve('@ge/wire'); console.log('wire ok')"
```

- [ ] **Step 4: Append the close-out to the docs**

`docs/DECISIONS.md` and `docs/PROGRESS.md` are **append-only** — annotate in place
with CORRECTION/AMENDED, never rewrite. Record the before/after line counts, every
ruling made during execution, and anything deferred.

- [ ] **Step 5: Confirm `VERSION` was not bumped**

```bash
cd /home/rick/dev/galactic-empire-reborn
git diff master -- VERSION
```

Expected: no output.

- [ ] **Step 6: Commit and push**

```bash
git add -A docs/
git commit -m "docs(restructure): close out phase 2 — the gateway split"
git push origin restructure
```

---

## Self-review

**Spec coverage.** The spec's Phase 2 has exactly two bullets. "Break
`game.gateway.ts` into per-concern collaborators, transport only, no game logic,
no Prisma" is Tasks 2–6, and Task 8 Step 1 verifies the Prisma count reaches zero.
"Split `scan.handler.ts` (1,258 lines)" is Task 7. No spec bullet is unclaimed.

**Ordering rationale.** Task 1 exists because of a constraint the spec does not
mention: 43 test files construct the gateway positionally. Tasks 2, 3, 5 and 7 do
not touch the constructor at all — they follow the existing `gateway/*.ts` pure
module pattern. Only Tasks 4 and 6 add a constructor parameter, and both land
after the seam.

**Known risk.** Task 4 is the one to watch. 256 lines, a Prisma transaction, and
six side effects whose ordering is wire-visible. Its guard specs must pass
unmodified; if the implementer changes one to get green, that is the signal the
move was wrong.

**Deliberately not in this plan.** `processBroadcasts` and `emitCommandResult`
stay on the gateway — they are its transport surface and moving them would be
churn without a boundary. `handleKillReport` stays a second listener on
`COMBAT_SHIP_DESTROYED`; merging it into Task 4's service would change emission
order, which is a wire-visible change.
