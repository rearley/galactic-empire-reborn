# Deploy Warning Broadcast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell connected players that a redeploy is coming — a vague warning when CI publishes an image, a real countdown when watchtower is actually about to stop the container, and a sign-off on shutdown.

**Architecture:** One token-guarded admin endpoint (`POST /admin/deploy/notice`) takes a phase, checks `PresenceService.count()`, and emits an internal event; `GameGateway` listens and emits a global `event.log`. Two callers: a CI job after images publish, and a watchtower `pre-update` lifecycle hook running a script inside the container. A `beforeApplicationShutdown` hook emits the last line.

**Tech Stack:** NestJS 11, `@nestjs/event-emitter`, Socket.io, Vitest, GitHub Actions, watchtower lifecycle hooks.

**Spec:** None — ad-hoc work under CLAUDE.md workflow rule 3. The design conversation is summarised in `docs/DECISIONS.md` (entry written in Task 7).

---

## Global Constraints

- **This is PORT-ORIGINAL.** Canon has no player-facing shutdown or sysop-broadcast message. `GEMAIN.C:1441-1475` `clswara()` only calls `logthis("***GALACTIC EMPIRE SHUTDOWN***")`, to the BBS log. `cmd_sysop` (`GECMDS.C:4742-4990`) has no broadcast subcommand. Every string added here is invented and must be commented as such.
- **`backend/src/game/commands/handlers/sys.handler.ts:50-56` already says** an unfilterable announcement "is port-original and needs a DECISIONS.md entry first". That entry is Task 7 and is not optional.
- **DECIDED: the notice IGNORES `set filter on`.** Canon's only galaxy-wide primitive, `outwar` (`GEMAIN.C:1517`), is filterable, so this is a deliberate deviation. Rationale: everything canon sends that way is in-fiction chatter; this is out-of-fiction operational news about the player's session ending, and filtering it surprises exactly the players who filtered. Use `this.server.emit(...)`, **not** `this.server.except(this.filteredRooms())`.
- **Suppress when nobody is in-game.** `PresenceService.count() === 0` ⇒ broadcast nothing and report `notified: 0`.
- **Fail open, always.** A failed or slow notice must never block or fail a deploy. The CI job is `continue-on-error: true`; the hook script exits 0 unconditionally.
- **No new secret if avoidable.** Reuse the existing `AdminTokenGuard` and `MIDNIGHT_ADMIN_TOKEN`. The name is a pre-existing wart; note it in DECISIONS, do not rename in this change.
- **Versioning:** `VERSION` bump + a `port-original` entry in `backend/src/public/changelog.ts` in the SAME commit as the deployable change.
- **Canon citation ratchet:** any new `@see GEMAIN.C:...` / `GECMDS.C:...` citation must carry a backticked quote ON THE SAME LINE. `backend/test/balance/canon-citations.balance.spec.ts` BASELINE is 3537 unquoted; do not raise it.
- **Backend tests need** `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1` in the environment.
- Approved message copy is fixed — see Task 1. Do not reword it.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/gateway/deploy-notice.messages.ts` (new) | The three port-original strings and their phase enum. Deliberately NOT in `game/commands/messages.ts`, which is the canon message table. |
| `backend/src/gateway/deploy-notice.events.ts` (new) | Event name constant + payload type for the internal emit. |
| `backend/src/gateway/deploy-notice.service.ts` (new) | Presence check + event emit. The unit under test; no HTTP, no socket. |
| `backend/src/gateway/deploy-notice.controller.ts` (new) | `POST /admin/deploy/notice`, `AdminTokenGuard`. |
| `backend/src/gateway/game.gateway.ts` (modify) | `@OnEvent` handler → global `event.log`; `beforeApplicationShutdown` → sign-off line. |
| `backend/src/gateway/gateway.module.ts` (modify) | Register the service, controller, and `AdminTokenGuard`. |
| `backend/scripts/deploy-warn.mjs` (new) | Runs INSIDE the container as watchtower's pre-update hook: POST, then sleep the countdown. |
| `backend/Dockerfile` (modify) | Copy `scripts/` into the runtime image. |
| `frontend/src/components/EventLog.tsx` (modify) | Add the missing `alert` colour. |
| `.github/workflows/ci.yml` (modify) | A `notify` job after `build`. |
| `docker-compose.yml` (modify) | Watchtower labels on `ge-backend`, for parity with the host stack. |

---

### Task 1: The messages and the event contract

Pure data. No behaviour, so the test is a copy lock — these strings were approved
verbatim by the owner and must not drift.

**Files:**
- Create: `backend/src/gateway/deploy-notice.messages.ts`
- Create: `backend/src/gateway/deploy-notice.events.ts`
- Test: `backend/test/gateway/deploy-notice-messages.spec.ts`

**Interfaces:**
- Produces: `enum DeployPhase { INBOUND = 'inbound', IMMINENT = 'imminent', DOWN = 'down' }`; `DEPLOY_NOTICE_TEXT: Record<DeployPhase, string>`; `DEPLOY_NOTICE_CATEGORY: Record<DeployPhase, EventLogCategory>`; `const DEPLOY_NOTICE = 'deploy.notice'`; `interface DeployNoticePayload { phase: DeployPhase; text: string; category: EventLogCategory }`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/gateway/deploy-notice-messages.spec.ts
import { describe, it, expect } from 'vitest';
import { DeployPhase, DEPLOY_NOTICE_TEXT, DEPLOY_NOTICE_CATEGORY } from '../../src/gateway/deploy-notice.messages';

/**
 * PORT-ORIGINAL copy, approved verbatim by the owner 2026-09-20.
 *
 * Canon has no player-facing shutdown message at all — `clswara()` only writes
 * `***GALACTIC EMPIRE SHUTDOWN***` to the BBS log (GEMAIN.C:1474). These imitate
 * the register of canon's in-fiction shutdown reports ("Shields shut down, Sir.")
 * without copying any of them. Byte-locked because the wording was negotiated,
 * not derived: "Nothing aboard will be lost" is a factual claim about restart
 * safety, and "stand by to resume" is the bit that stops a player closing the tab.
 */
describe('deploy notice copy', () => {
  it('says what a player needs at five to ten minutes out', () => {
    expect(DEPLOY_NOTICE_TEXT[DeployPhase.INBOUND]).toBe(
      'Sensors read a Fleet Command carrier wave, Sir. Systems refit in 5 to 10 minutes. Nothing aboard will be lost.',
    );
  });

  it('gives a real countdown and an instruction when the restart is imminent', () => {
    expect(DEPLOY_NOTICE_TEXT[DeployPhase.IMMINENT]).toBe(
      'Fleet-wide systems shutdown in 45 seconds, Sir. Your ship holds station. Re-establish contact when comms return.',
    );
  });

  it('signs off as a RESTART, not an ending', () => {
    // "Shutdown" was rejected here on purpose: a player reading it wonders
    // whether the game is over.
    expect(DEPLOY_NOTICE_TEXT[DeployPhase.DOWN]).toBe(
      'Comms lost. Refit in progress — stand by to resume.',
    );
  });

  it('renders the imminent line as an alert and the rest as system', () => {
    expect(DEPLOY_NOTICE_CATEGORY[DeployPhase.INBOUND]).toBe('system');
    expect(DEPLOY_NOTICE_CATEGORY[DeployPhase.IMMINENT]).toBe('alert');
    expect(DEPLOY_NOTICE_CATEGORY[DeployPhase.DOWN]).toBe('system');
  });

  it('covers every phase, so a new one cannot ship without copy', () => {
    for (const phase of Object.values(DeployPhase)) {
      expect(DEPLOY_NOTICE_TEXT[phase]).toBeTruthy();
      expect(DEPLOY_NOTICE_CATEGORY[phase]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run test/gateway/deploy-notice-messages.spec.ts
```
Expected: FAIL — cannot resolve `../../src/gateway/deploy-notice.messages`.

- [ ] **Step 3: Write the messages module**

```ts
// backend/src/gateway/deploy-notice.messages.ts
import type { EventLogCategory } from '@ge/wire';

/** Which moment of a redeploy a notice describes. */
export enum DeployPhase {
  /** CI published an image. Watchtower polls every 5 minutes, so this is a RANGE. */
  INBOUND = 'inbound',
  /** Watchtower's pre-update hook — the container really is about to stop. */
  IMMINENT = 'imminent',
  /** SIGTERM. Best-effort: it races the socket close. */
  DOWN = 'down',
}

/**
 * PORT-ORIGINAL. Canon has no player-facing shutdown or sysop-broadcast text:
 * the only shutdown path writes `***GALACTIC EMPIRE SHUTDOWN***` to the BBS log
 * and nothing to a player, and `cmd_sysop` has no broadcast subcommand.
 *
 * These imitate the REGISTER of canon's in-fiction shutdown reports — clipped,
 * addressed to "Sir", e.g. `Shields shut down, Sir.` (MBMGEMSG.MSG:2648) — while
 * saying something canon never had to say, because a modem game had no redeploy.
 *
 * Byte-locked by test/gateway/deploy-notice-messages.spec.ts.
 * @see docs/DECISIONS.md 2026-09-20 — deploy warning broadcast
 */
export const DEPLOY_NOTICE_TEXT: Record<DeployPhase, string> = {
  // Deliberately vague. CI knows an image shipped; it does NOT know when
  // watchtower will pull it. A precise countdown here would be a lie.
  [DeployPhase.INBOUND]:
    'Sensors read a Fleet Command carrier wave, Sir. Systems refit in 5 to 10 minutes. Nothing aboard will be lost.',
  // 45 seconds is real: watchtower blocks on the pre-update hook.
  [DeployPhase.IMMINENT]:
    'Fleet-wide systems shutdown in 45 seconds, Sir. Your ship holds station. Re-establish contact when comms return.',
  // A RESTART, not an ending. "Stand by to resume" is what stops a player
  // closing the tab.
  [DeployPhase.DOWN]: 'Comms lost. Refit in progress — stand by to resume.',
};

/** The imminent line is the only one asking for action, so it is the only alert. */
export const DEPLOY_NOTICE_CATEGORY: Record<DeployPhase, EventLogCategory> = {
  [DeployPhase.INBOUND]: 'system',
  [DeployPhase.IMMINENT]: 'alert',
  [DeployPhase.DOWN]: 'system',
};

/** Seconds the pre-update hook holds the deploy open. @see scripts/deploy-warn.mjs */
export const IMMINENT_COUNTDOWN_SECONDS = 45;
```

```ts
// backend/src/gateway/deploy-notice.events.ts
import type { EventLogCategory } from '@ge/wire';
import type { DeployPhase } from './deploy-notice.messages';

/**
 * Internal event name. The controller must not hold the Socket.io server, and
 * the gateway must not own an HTTP route, so they meet on the event bus — the
 * same shape as COMBAT_SHIP_DESTROYED and CYBERTRON_EVENT.SPAWNED.
 */
export const DEPLOY_NOTICE = 'deploy.notice';

export interface DeployNoticePayload {
  phase: DeployPhase;
  text: string;
  category: EventLogCategory;
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd backend && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run test/gateway/deploy-notice-messages.spec.ts
```
Expected: PASS, 5 tests.

If `EventLogCategory` does not export `'alert'`, stop and check
`packages/wire/src/payloads.ts:26-41` before inventing a category.

- [ ] **Step 5: Commit**

```bash
git add backend/src/gateway/deploy-notice.messages.ts backend/src/gateway/deploy-notice.events.ts backend/test/gateway/deploy-notice-messages.spec.ts
git commit -m "feat(deploy): port-original copy for the redeploy notice"
```

---

### Task 2: The notice service — presence gate and emit

**Files:**
- Create: `backend/src/gateway/deploy-notice.service.ts`
- Test: `backend/test/gateway/deploy-notice.service.spec.ts`

**Interfaces:**
- Consumes: `DeployPhase`, `DEPLOY_NOTICE_TEXT`, `DEPLOY_NOTICE_CATEGORY`, `DEPLOY_NOTICE`, `DeployNoticePayload` from Task 1; `PresenceService.count()` from `src/public/presence.service.ts`.
- Produces: `class DeployNoticeService { announce(phase: DeployPhase): { notified: number; text: string | null } }`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/gateway/deploy-notice.service.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { DeployNoticeService } from '../../src/gateway/deploy-notice.service';
import { DeployPhase, DEPLOY_NOTICE_TEXT } from '../../src/gateway/deploy-notice.messages';
import { DEPLOY_NOTICE } from '../../src/gateway/deploy-notice.events';

const build = (online: number) => {
  const emitter = { emit: vi.fn() };
  const presence = { count: () => online };
  const service = new DeployNoticeService(
    presence as unknown as never,
    emitter as unknown as never,
  );
  return { service, emitter };
};

describe('DeployNoticeService', () => {
  it('emits the phase payload when someone is in-game', () => {
    const { service, emitter } = build(2);
    const result = service.announce(DeployPhase.IMMINENT);
    expect(emitter.emit).toHaveBeenCalledWith(DEPLOY_NOTICE, {
      phase: DeployPhase.IMMINENT,
      text: DEPLOY_NOTICE_TEXT[DeployPhase.IMMINENT],
      category: 'alert',
    });
    expect(result).toEqual({ notified: 2, text: DEPLOY_NOTICE_TEXT[DeployPhase.IMMINENT] });
  });

  it('emits NOTHING when the galaxy is empty', () => {
    // Not merely cosmetic: this is what lets the pre-update hook skip its
    // 45-second sleep, so an unattended deploy is not slowed by a courtesy
    // nobody receives.
    const { service, emitter } = build(0);
    const result = service.announce(DeployPhase.INBOUND);
    expect(emitter.emit).not.toHaveBeenCalled();
    expect(result).toEqual({ notified: 0, text: null });
  });

  it('carries the right copy and category for every phase', () => {
    for (const phase of Object.values(DeployPhase)) {
      const { service, emitter } = build(1);
      service.announce(phase);
      expect(emitter.emit).toHaveBeenCalledWith(
        DEPLOY_NOTICE,
        expect.objectContaining({ phase, text: DEPLOY_NOTICE_TEXT[phase] }),
      );
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run test/gateway/deploy-notice.service.spec.ts
```
Expected: FAIL — cannot resolve `deploy-notice.service`.

- [ ] **Step 3: Write the service**

```ts
// backend/src/gateway/deploy-notice.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PresenceService } from '../public/presence.service';
import { DeployPhase, DEPLOY_NOTICE_TEXT, DEPLOY_NOTICE_CATEGORY } from './deploy-notice.messages';
import { DEPLOY_NOTICE, type DeployNoticePayload } from './deploy-notice.events';

/**
 * Announces an imminent redeploy to everyone in-game.
 *
 * PORT-ORIGINAL — @see deploy-notice.messages.ts and docs/DECISIONS.md 2026-09-20.
 *
 * Emits rather than broadcasting directly: the HTTP caller must not hold the
 * Socket.io server. `GameGateway` listens.
 */
@Injectable()
export class DeployNoticeService {
  private readonly logger = new Logger(DeployNoticeService.name);

  constructor(
    private readonly presence: PresenceService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Returns how many players the notice was sent to. ZERO IS A NORMAL ANSWER,
   * and it is load-bearing: the pre-update hook reads it to decide whether to
   * hold the deploy open for the countdown at all.
   */
  announce(phase: DeployPhase): { notified: number; text: string | null } {
    const notified = this.presence.count();
    if (notified === 0) {
      this.logger.log(`deploy notice ${phase}: nobody in-game, saying nothing`);
      return { notified: 0, text: null };
    }

    const text = DEPLOY_NOTICE_TEXT[phase];
    const payload: DeployNoticePayload = { phase, text, category: DEPLOY_NOTICE_CATEGORY[phase] };
    this.events.emit(DEPLOY_NOTICE, payload);
    this.logger.log(`deploy notice ${phase}: told ${notified} player(s)`);
    return { notified, text };
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd backend && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run test/gateway/deploy-notice.service.spec.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/gateway/deploy-notice.service.ts backend/test/gateway/deploy-notice.service.spec.ts
git commit -m "feat(deploy): notice service, silent on an empty galaxy"
```

---

### Task 3: The gateway broadcasts it, unfiltered

**Files:**
- Modify: `backend/src/gateway/game.gateway.ts`
- Modify: `backend/test/helpers/make-gateway.ts`
- Test: `backend/test/gateway/deploy-notice-broadcast.spec.ts`

**Interfaces:**
- Consumes: `DEPLOY_NOTICE`, `DeployNoticePayload` (Task 1); `DeployNoticeService` (Task 2).
- Produces: `GameGateway.handleDeployNotice(payload)`, `GameGateway.beforeApplicationShutdown()`.

Read `game.gateway.ts:1416` (`announceAiArrival`) for the emit shape first — it
is the closest existing analogue, and its spec
(`test/gateway/ai-arrival-broadcast.spec.ts`) is the model for the test below.
Check whether `GameGateway` already declares `beforeApplicationShutdown`; if it
does, EXTEND it rather than adding a second.

- [ ] **Step 1: Add the dependency to the gateway test helper**

`makeGateway` (`backend/test/helpers/make-gateway.ts`) exists precisely so that
adding a gateway dependency is a one-file change rather than a 43-file diff. Add
to `GatewayDeps` and to the `flat` defaults:

```ts
  deployNotice: DeployNoticeService;
```
```ts
    deployNotice: { announce: vi.fn() } as unknown as DeployNoticeService,
```

Keep the default inert, per that file's stated rule.

- [ ] **Step 2: Write the failing test**

```ts
// backend/test/gateway/deploy-notice-broadcast.spec.ts
/**
 * The redeploy notice goes to EVERY socket, `set filter on` included.
 *
 * Canon's only galaxy-wide primitive, `outwar` (GEMAIN.C:1517), is FILTER class,
 * so a player running `set filter on` silences it — that is what
 * ai-arrival-broadcast.spec.ts pins for CYBNEW. This deliberately does not
 * follow it: everything canon sent that way is in-fiction chatter, whereas this
 * is out-of-fiction news that the player's session is about to end, and
 * filtering it would surprise exactly the players who filtered.
 * @see docs/DECISIONS.md 2026-09-20
 */
import { makeGateway } from '../helpers/make-gateway';
import { DeployPhase, DEPLOY_NOTICE_TEXT } from '../../src/gateway/deploy-notice.messages';
import { DeployNoticeService } from '../../src/gateway/deploy-notice.service';

interface Emit { rooms: string[]; except: string[]; event: string; payload: unknown }

function build() {
  const emits: Emit[] = [];
  const announce = vi.fn();
  const chain = (rooms: string[], except: string[]) => ({
    to: (r: string) => chain([...rooms, r], except),
    except: (e: string[]) => chain(rooms, [...except, ...e]),
    emit: (event: string, payload: unknown) => { emits.push({ rooms, except, event, payload }); },
  });
  const gateway = makeGateway({
    deployNotice: { announce } as unknown as DeployNoticeService,
  });
  (gateway as unknown as { server: unknown }).server = {
    to: (r: string) => chain([r], []),
    except: (e: string[]) => chain([], e),
    emit: (event: string, payload: unknown) => { emits.push({ rooms: [], except: [], event, payload }); },
  };
  return { gateway, emits, announce };
}

const call = <T>(gateway: unknown, method: string): T =>
  (gateway as Record<string, T>)[method];

describe('deploy notice broadcast', () => {
  it('reaches every socket — no room, and no filter exclusion', () => {
    const { gateway, emits } = build();

    call<(p: unknown) => void>(gateway, 'handleDeployNotice')({
      phase: DeployPhase.IMMINENT,
      text: DEPLOY_NOTICE_TEXT[DeployPhase.IMMINENT],
      category: 'alert',
    });

    expect(emits).toHaveLength(1);
    const line = emits[0];
    expect(line.event).toBe('event.log');
    expect(line.rooms).toEqual([]);
    // THE assertion. CYBNEW excludes filteredRooms(); this must not.
    expect(line.except).toEqual([]);
    expect(line.payload).toEqual({
      category: 'alert',
      text: DEPLOY_NOTICE_TEXT[DeployPhase.IMMINENT],
    });
  });

  it('carries whatever category the payload names, not a hardcoded one', () => {
    const { gateway, emits } = build();
    call<(p: unknown) => void>(gateway, 'handleDeployNotice')({
      phase: DeployPhase.INBOUND,
      text: DEPLOY_NOTICE_TEXT[DeployPhase.INBOUND],
      category: 'system',
    });
    expect(emits[0].payload).toMatchObject({ category: 'system' });
  });

  it('says the sign-off line on shutdown', () => {
    const { gateway, announce } = build();
    call<() => void>(gateway, 'beforeApplicationShutdown')();
    expect(announce).toHaveBeenCalledWith(DeployPhase.DOWN);
  });

  it('never lets a broken notice block a shutdown', () => {
    const { gateway, announce } = build();
    announce.mockImplementation(() => { throw new Error('boom'); });
    expect(() => call<() => void>(gateway, 'beforeApplicationShutdown')()).not.toThrow();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd backend && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run test/gateway/deploy-notice-broadcast.spec.ts
```
Expected: FAIL — `handleDeployNotice is not a function`.

- [ ] **Step 4: Add the handler and the shutdown hook**

Inject `DeployNoticeService` into the `GameGateway` constructor, then add:

```ts
  /**
   * Redeploy notice → every socket.
   *
   * `this.server.emit`, NOT `this.server.except(this.filteredRooms())`. That is
   * the deviation: canon's galaxy-wide `outwar` honours `set filter on`, and
   * this deliberately does not, because it is operational news rather than
   * in-fiction chatter. @see docs/DECISIONS.md 2026-09-20
   */
  @OnEvent(DEPLOY_NOTICE)
  handleDeployNotice(payload: DeployNoticePayload): void {
    this.server.emit('event.log', { category: payload.category, text: payload.text });
  }

  /**
   * The last line out. BEST EFFORT — it races the socket close, so some players
   * will never see it; the warning that matters is the pre-update one, 45
   * seconds earlier. Never throws: nothing here may delay or fail a shutdown.
   */
  beforeApplicationShutdown(): void {
    try {
      this.deployNotice.announce(DeployPhase.DOWN);
    } catch {
      // Deliberately swallowed. @see CombatTickService.beforeApplicationShutdown
    }
  }
```

Inject `DeployNoticeService` as a new constructor parameter, and add
`BeforeApplicationShutdown` to the class `implements` clause as the codebase's
existing style requires.

- [ ] **Step 5: Run the new test AND the whole gateway suite**

```bash
cd backend && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run test/gateway/
```
Expected: PASS, including 4 new tests. The whole directory, not just the new
file: a new constructor parameter can break any of the 43 specs that build a
gateway, and `make-gateway.ts` is what should have absorbed that.

- [ ] **Step 6: Commit**

```bash
git add backend/src/gateway/game.gateway.ts backend/test/helpers/make-gateway.ts backend/test/gateway/deploy-notice-broadcast.spec.ts
git commit -m "feat(deploy): the gateway broadcasts the notice, filters ignored"
```

---

### Task 4: The admin endpoint

**Files:**
- Create: `backend/src/gateway/deploy-notice.controller.ts`
- Modify: `backend/src/gateway/gateway.module.ts`
- Test: `backend/test/gateway/deploy-notice.controller.spec.ts`

**Interfaces:**
- Consumes: `DeployNoticeService.announce` (Task 2); `AdminTokenGuard` from `src/game/midnight/admin-token.guard.ts`.
- Produces: `POST /admin/deploy/notice`, body `{ phase: 'inbound' | 'imminent' }`, 200 `{ notified: number; countdownSeconds: number }`.

`phase: 'down'` is NOT accepted over HTTP — it is emitted by the shutdown hook
only, and accepting it would let a caller tell players comms were lost while the
server kept running.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/gateway/deploy-notice.controller.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DeployNoticeController } from '../../src/gateway/deploy-notice.controller';
import { DeployPhase, IMMINENT_COUNTDOWN_SECONDS } from '../../src/gateway/deploy-notice.messages';

const build = (notified = 1) => {
  const service = { announce: vi.fn(() => ({ notified, text: 'x' })) };
  return { controller: new DeployNoticeController(service as unknown as never), service };
};

describe('POST /admin/deploy/notice', () => {
  it('announces the inbound phase and reports no countdown', () => {
    const { controller, service } = build(3);
    expect(controller.notice({ phase: 'inbound' })).toEqual({ notified: 3, countdownSeconds: 0 });
    expect(service.announce).toHaveBeenCalledWith(DeployPhase.INBOUND);
  });

  it('tells the caller how long to hold the deploy open when players are on', () => {
    const { controller } = build(2);
    expect(controller.notice({ phase: 'imminent' })).toEqual({
      notified: 2,
      countdownSeconds: IMMINENT_COUNTDOWN_SECONDS,
    });
  });

  it('asks for NO countdown when the galaxy is empty', () => {
    // The hook sleeps for `countdownSeconds`. Nobody on ⇒ do not slow the deploy.
    const { controller } = build(0);
    expect(controller.notice({ phase: 'imminent' })).toEqual({ notified: 0, countdownSeconds: 0 });
  });

  it('refuses a phase that is not a warning', () => {
    // 'down' is the shutdown hook's to send. Over HTTP it would let a caller
    // tell players comms were lost while the server was still up.
    const { controller } = build();
    expect(() => controller.notice({ phase: 'down' })).toThrow(BadRequestException);
    expect(() => controller.notice({ phase: 'nonsense' })).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run test/gateway/deploy-notice.controller.spec.ts
```
Expected: FAIL — cannot resolve `deploy-notice.controller`.

- [ ] **Step 3: Write the controller**

```ts
// backend/src/gateway/deploy-notice.controller.ts
import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../game/midnight/admin-token.guard';
import { DeployNoticeService } from './deploy-notice.service';
import { DeployPhase, IMMINENT_COUNTDOWN_SECONDS } from './deploy-notice.messages';

interface NoticeBody { phase?: string }
interface NoticeResponse { notified: number; countdownSeconds: number }

/** Only the two WARNING phases are reachable over HTTP. @see the 'down' note below. */
const OVER_HTTP: Record<string, DeployPhase> = {
  inbound: DeployPhase.INBOUND,
  imminent: DeployPhase.IMMINENT,
};

/**
 * Lets a deploy tell the running game it is about to be replaced.
 *
 * Guarded by the same bearer token as POST /admin/midnight/run. Reusing it is
 * deliberate: it is already "the ops token", and a second secret to rotate buys
 * nothing when both endpoints sit at the same trust level. The MIDNIGHT_ name is
 * a pre-existing wart. @see docs/DECISIONS.md 2026-09-20
 */
@Controller('admin/deploy')
@UseGuards(AdminTokenGuard)
export class DeployNoticeController {
  constructor(private readonly notices: DeployNoticeService) {}

  @Post('notice')
  @HttpCode(HttpStatus.OK)
  notice(@Body() body: NoticeBody): NoticeResponse {
    const phase = OVER_HTTP[body.phase ?? ''];
    if (!phase) {
      throw new BadRequestException({
        code: 'BAD_PHASE',
        message: `phase must be one of: ${Object.keys(OVER_HTTP).join(', ')}`,
      });
    }

    const { notified } = this.notices.announce(phase);
    // The caller SLEEPS for this. Zero when nobody heard it, so an unattended
    // deploy is never slowed by a courtesy with no audience.
    const countdownSeconds =
      phase === DeployPhase.IMMINENT && notified > 0 ? IMMINENT_COUNTDOWN_SECONDS : 0;
    return { notified, countdownSeconds };
  }
}
```

Then register in `gateway.module.ts`. It already imports `PublicModule`, so
`PresenceService` is in scope and must NOT be re-provided — a second instance
would count a second, empty galaxy and the notice would always be suppressed.
Add `DeployNoticeService` and `AdminTokenGuard` to `providers`, and
`DeployNoticeController` to `controllers` (the module currently declares no
`controllers` key — add one).

- [ ] **Step 4: Run the test and the whole gateway suite**

```bash
cd backend && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run test/gateway/
```
Expected: PASS, including the four new controller tests.

- [ ] **Step 5: Verify it boots — a DI mistake here is invisible to unit tests**

```bash
cd backend && npm run build && npx tsc --noEmit
```
Expected: clean. Then boot the dev stack and confirm:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/admin/deploy/notice
# Expected: 401 (or 503 if MIDNIGHT_ADMIN_TOKEN is unset locally)
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/gateway/deploy-notice.controller.ts backend/src/gateway/gateway.module.ts backend/test/gateway/deploy-notice.controller.spec.ts
git commit -m "feat(deploy): token-guarded POST /admin/deploy/notice"
```

---

### Task 5: The pre-update hook script

Runs INSIDE the container. Watchtower blocks on it, which is the only reason a
45-second countdown can be honest.

**Files:**
- Create: `backend/scripts/deploy-warn.mjs`
- Modify: `backend/Dockerfile`
- Test: `backend/test/gateway/deploy-warn-script.spec.ts`

**Interfaces:**
- Consumes: `POST /admin/deploy/notice` (Task 4).
- Produces: `export async function warn({ fetchImpl, sleep, env })` — injectable so the test needs no network and no real 45-second wait.

Verified contract (containrrr.dev/watchtower/lifecycle-hooks):
- label `com.centurylinklabs.watchtower.lifecycle.pre-update`
- watchtower **waits** for it before stopping the container
- default timeout **60 seconds**; override label
  `com.centurylinklabs.watchtower.lifecycle.pre-update-timeout`, value **in minutes**
- a non-zero exit does **not** stop the update — it is only logged

45s countdown + startup + HTTP is uncomfortably close to the 60s default, so
Task 6 sets the timeout label to `2` minutes.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/gateway/deploy-warn-script.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { warn } from '../../scripts/deploy-warn.mjs';

const okResponse = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) });

describe('deploy-warn pre-update hook', () => {
  it('posts the imminent phase with the ops token', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse({ notified: 1, countdownSeconds: 45 })));
    const sleep = vi.fn(() => Promise.resolve());
    await warn({ fetchImpl, sleep, env: { MIDNIGHT_ADMIN_TOKEN: 'tok', PORT: '3000' } });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3000/admin/deploy/notice');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ phase: 'imminent' });
  });

  it('holds the deploy open for exactly the countdown the server asked for', () => {
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse({ notified: 2, countdownSeconds: 45 })));
    const sleep = vi.fn(() => Promise.resolve());
    return warn({ fetchImpl, sleep, env: { MIDNIGHT_ADMIN_TOKEN: 'tok' } }).then(() => {
      expect(sleep).toHaveBeenCalledWith(45_000);
    });
  });

  it('does not sleep at all when nobody is in-game', () => {
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse({ notified: 0, countdownSeconds: 0 })));
    const sleep = vi.fn(() => Promise.resolve());
    return warn({ fetchImpl, sleep, env: { MIDNIGHT_ADMIN_TOKEN: 'tok' } }).then(() => {
      expect(sleep).not.toHaveBeenCalled();
    });
  });

  it('FAILS OPEN — a dead server must never hold up a deploy', () => {
    // Watchtower ignores our exit code anyway; the point is to not hang or throw.
    const fetchImpl = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    const sleep = vi.fn(() => Promise.resolve());
    return expect(
      warn({ fetchImpl, sleep, env: { MIDNIGHT_ADMIN_TOKEN: 'tok' } }),
    ).resolves.toBeUndefined();
  });

  it('fails open when the token is not configured', () => {
    const fetchImpl = vi.fn();
    return warn({ fetchImpl, sleep: vi.fn(), env: {} }).then(() => {
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run test/gateway/deploy-warn-script.spec.ts
```
Expected: FAIL — cannot resolve `../../scripts/deploy-warn.mjs`.

- [ ] **Step 3: Write the script**

```js
// backend/scripts/deploy-warn.mjs
/**
 * Watchtower pre-update hook. Runs INSIDE ge-backend, immediately before the
 * container is stopped.
 *
 * Watchtower BLOCKS on this command, which is the entire point: it is the only
 * place in the pipeline that knows the restart is really happening now, so it is
 * the only place a countdown can be honest. CI knows an image exists; it does
 * not know when watchtower will pull it.
 *
 * Contract (containrrr.dev/watchtower/lifecycle-hooks): default timeout is 60
 * seconds — the compose label raises it to 2 minutes — and a non-zero exit is
 * logged but does NOT stop the update. So this fails open by construction; the
 * try/catch is belt and braces.
 *
 * @see docs/DECISIONS.md 2026-09-20 — deploy warning broadcast
 */

const DEFAULT_PORT = '3000';

export async function warn({ fetchImpl = fetch, sleep = defaultSleep, env = process.env } = {}) {
  const token = env.MIDNIGHT_ADMIN_TOKEN;
  if (!token) {
    console.error('deploy-warn: MIDNIGHT_ADMIN_TOKEN unset, saying nothing');
    return;
  }

  try {
    const res = await fetchImpl(`http://127.0.0.1:${env.PORT ?? DEFAULT_PORT}/admin/deploy/notice`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'imminent' }),
    });
    if (!res.ok) {
      console.error(`deploy-warn: server said ${res.status}, not holding the deploy`);
      return;
    }

    const { notified, countdownSeconds } = await res.json();
    if (!countdownSeconds) {
      console.error(`deploy-warn: ${notified} player(s) online, no countdown needed`);
      return;
    }

    console.error(`deploy-warn: told ${notified} player(s), holding ${countdownSeconds}s`);
    await sleep(countdownSeconds * 1000);
  } catch (err) {
    // A redeploy must never be blocked by the courtesy that announces it.
    console.error(`deploy-warn: ${err instanceof Error ? err.message : String(err)} — continuing`);
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Only when executed directly, so importing this in a test does not fire it.
if (import.meta.url === `file://${process.argv[1]}`) {
  await warn();
  process.exit(0);
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd backend && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run test/gateway/deploy-warn-script.spec.ts
```
Expected: PASS, 5 tests.

If Vitest will not import a `.mjs` from `test/`, add the file to the suite's
`include` rather than renaming the script — watchtower needs it to stay ESM and
executable by `node` directly.

- [ ] **Step 5: Ship it in the runtime image**

In `backend/Dockerfile`, in the **runtime** stage, beside the `config` copy:

```dockerfile
# Watchtower's pre-update hook runs this INSIDE the container, so it has to be
# in the image rather than on the host. Plain .mjs run by node — no build step,
# so it cannot be broken by a bundling change. @see scripts/deploy-warn.mjs
COPY --chown=node:node backend/scripts ./scripts
```

- [ ] **Step 6: Prove it is actually in the image**

```bash
docker build -f backend/Dockerfile -t ge-backend-test .
docker run --rm ge-backend-test node /app/backend/scripts/deploy-warn.mjs
```
Expected: exits 0 and prints `deploy-warn: MIDNIGHT_ADMIN_TOKEN unset, saying nothing`.
That single command proves the file is present, is valid ESM, and fails open.

- [ ] **Step 7: Commit**

```bash
git add backend/scripts/deploy-warn.mjs backend/Dockerfile backend/test/gateway/deploy-warn-script.spec.ts
git commit -m "feat(deploy): pre-update hook script, shipped in the image"
```

---

### Task 6: Wire the two callers

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docker-compose.yml`
- Modify: `frontend/src/components/EventLog.tsx`
- Test: `frontend/test/EventLog.spec.tsx` (or the nearest existing event-log spec)

- [ ] **Step 1: Failing frontend test for the missing `alert` colour**

`alert` is a valid `EventLogCategory` in `packages/wire/src/payloads.ts` but has
no entry in `CATEGORY_CLASS`, so the imminent notice would render unstyled —
the one line that most needs to stand out.

```tsx
it('styles an alert line distinctly, since the deploy countdown uses it', () => {
  render(<EventLog lines={[{ id: '1', text: 'Fleet-wide systems shutdown in 45 seconds, Sir.', category: 'alert' }]} />);
  const line = screen.getByText(/Fleet-wide systems shutdown/);
  expect(line.className).toMatch(/text-orange-300/);
});
```

Match the surrounding spec's `LogEntry` shape rather than the one above if it differs.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend && npx vitest run test/EventLog.spec.tsx
```
Expected: FAIL — no `text-orange-300`.

- [ ] **Step 3: Add the colour**

```ts
  chat:    'text-yellow-300',
  // Operational, not in-fiction: today only the redeploy countdown. Orange sits
  // between `nav` and `combat` so it reads as urgent without looking like damage.
  alert:   'text-orange-300',
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd frontend && npx vitest run test/EventLog.spec.tsx
```
Expected: PASS.

- [ ] **Step 5: Add the CI job**

After the `build` job in `.github/workflows/ci.yml`:

```yaml
  # Tell whoever is playing that a restart is coming.
  #
  # DELIBERATELY VAGUE about timing, because this job cannot know it: CI's work
  # ends at ghcr, and watchtower polls every 5 minutes, so the restart is
  # somewhere in the next 0-5 minutes. The precise countdown is the pre-update
  # hook's job (backend/scripts/deploy-warn.mjs), 45 seconds before the stop.
  #
  # FAILS OPEN on purpose. A courtesy notice must never mark a good deploy red,
  # and the server ignores it entirely when nobody is in-game.
  notify:
    name: Warn players
    runs-on: ubuntu-latest
    timeout-minutes: 2
    needs: [build]
    if: needs.build.result == 'success'
    continue-on-error: true
    steps:
      - name: Announce the inbound refit
        env:
          NOTICE_URL: ${{ secrets.DEPLOY_NOTICE_URL }}
          ADMIN_TOKEN: ${{ secrets.MIDNIGHT_ADMIN_TOKEN }}
        run: |
          set -u
          if [ -z "${NOTICE_URL:-}" ] || [ -z "${ADMIN_TOKEN:-}" ]; then
            echo "Notice endpoint or token not configured — skipping."
            exit 0
          fi
          curl -fsS --max-time 10 -X POST "$NOTICE_URL" \
            -H "Authorization: Bearer $ADMIN_TOKEN" \
            -H 'Content-Type: application/json' \
            -d '{"phase":"inbound"}' || echo "Notice failed — the deploy stands."
```

Two repository secrets are required, and Rick must add them:
`DEPLOY_NOTICE_URL` (e.g. `https://ge-reborn.com/admin/deploy/notice`) and
`MIDNIGHT_ADMIN_TOKEN` (the value already in the production environment).
Without them the job no-ops, which is why it is safe to merge first.

- [ ] **Step 6: Add the watchtower labels**

In `docker-compose.yml`, on the `ge-backend` service:

```yaml
    labels:
      # Watchtower runs this in the container and WAITS for it before stopping,
      # which is what buys the 45-second countdown. Timeout is in MINUTES; the
      # default is 60 seconds, too close to a 45-second sleep plus startup.
      com.centurylinklabs.watchtower.lifecycle.pre-update: "node /app/backend/scripts/deploy-warn.mjs"
      com.centurylinklabs.watchtower.lifecycle.pre-update-timeout: "2"
```

- [ ] **Step 7: Full suites**

```bash
cd backend && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npm test && npx tsc --noEmit && npm run lint
cd ../frontend && npm test && npm run lint
```
Expected: green, except the known-environmental `node-runtime-version.spec.ts`
failure (Node 22 on this machine vs the declared 24). Report that honestly; do
not "fix" it.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/ci.yml docker-compose.yml frontend/src/components/EventLog.tsx frontend/test/EventLog.spec.tsx
git commit -m "feat(deploy): CI announces the refit, watchtower runs the countdown"
```

---

### Task 7: Bookkeeping — the part that is not optional

**Files:**
- Modify: `VERSION`, `backend/src/public/changelog.ts`
- Modify: `docs/DECISIONS.md`, `docs/PROGRESS.md`
- Modify: `backend/src/game/commands/handlers/sys.handler.ts` (the stale note at :50-56)

- [ ] **Step 1: Bump VERSION**

`0.26.2` → `0.27.0`. Minor: this is new player-visible behaviour, not a fix.

- [ ] **Step 2: Changelog entry, category `port-original`**

Written for a player, not a reviewer. Something in the shape of:

> The game now warns you before it restarts for an update — a heads-up when a
> new build is on its way, and a 45-second countdown just before the server
> goes down. Your ship, cargo and position are saved either way; you will be
> back where you left off.

- [ ] **Step 3: `docs/DECISIONS.md` — 2026-09-20, deploy warning broadcast**

Required by `sys.handler.ts:50-56`. It must record:
- that this is PORT-ORIGINAL, with the canon evidence: `clswara()` logs
  `***GALACTIC EMPIRE SHUTDOWN***` to the BBS log only (`GEMAIN.C:1474`), and
  `cmd_sysop` has no broadcast subcommand (`GECMDS.C:4742-4990`);
- the DELIBERATE DEVIATION that the notice ignores `set filter on`, where canon's
  `outwar` (`GEMAIN.C:1517`) is filterable, and why;
- why there are two hook points rather than one — CI cannot know when watchtower
  will pull, so only the pre-update hook can state a real countdown;
- why the copy says "refit"/"stand by to resume" rather than "shutdown" in the
  sign-off: a shutdown message reads like the game ending;
- that `MIDNIGHT_ADMIN_TOKEN` is reused for a non-midnight endpoint, and that the
  name is a known wart kept rather than churn a production secret.

- [ ] **Step 4: Correct the stale note in `sys.handler.ts`**

Lines 50-56 currently say adding an unfilterable announcement "needs a
DECISIONS.md entry first". Still true of a sysop broadcast COMMAND, which this
does not add — so keep the note and point it at the new entry, rather than
deleting it. Per `docs/CLAUDE.md`, closing a stale item in place is part of the job.

- [ ] **Step 5: `docs/PROGRESS.md`** — a dated entry, count 117 → 118.

- [ ] **Step 6: Commit**

```bash
git add VERSION backend/src/public/changelog.ts docs/DECISIONS.md docs/PROGRESS.md backend/src/game/commands/handlers/sys.handler.ts
git commit -m "docs(deploy): record the port-original deploy notice — v0.27.0"
```

---

## Out of scope — Rick's calls, not the implementer's

Do NOT do these. They are host changes to shared infrastructure and belong to
the owner. The code above is inert until the first one is done, and that is
deliberate: it can be merged and deployed safely before any of them happen.

1. **`WATCHTOWER_LIFECYCLE_HOOKS=true`** on the single shared watchtower
   container. That watchtower updates all 8 containers on the box
   (daycompass-*, ge-*, makr-*, n8n). Hooks only fire for containers carrying
   the labels, so the blast radius is GE alone — but it is still a change to
   shared infra.
2. **The labels on the production `ge-backend`**, in the Plesk-managed compose
   stack on the host (confirm the path there before editing). The repo compose
   file is dev.
3. **Two GitHub repository secrets:** `DEPLOY_NOTICE_URL` and
   `MIDNIGHT_ADMIN_TOKEN`.
4. **Confirm nginx proxies `/admin/*`** to the backend on the public vhost. If
   it does not, the CI half cannot work and only the watchtower half will.

## Verification before completion

Beyond green suites — run `superpowers:verification-before-completion`:

1. On the dev stack, with a browser signed in as the probe account, POST the
   inbound phase with a real token and SEE the line arrive in the event log.
2. Repeat with nobody signed in and confirm `{"notified":0}` and no broadcast.
3. Run `node backend/scripts/deploy-warn.mjs` against the dev server with a
   player connected: the line appears and the script holds ~45 seconds.
4. Stop the dev backend with SIGTERM and confirm the sign-off line is emitted
   (accepting that a client may not render it before the socket closes).

## Memory to update afterwards

`project_deploy_scheduling.md` currently records **"DECISION 2026-09-14: stay
push-and-forget. Do not build any of this."** That is now superseded — option 2
("Warn before restarting") was built on 2026-09-20. Rewrite the decision rather
than deleting it, per the doc-hygiene rule, and note that options 1
(`WATCHTOWER_SCHEDULE`) and 3 (gate on empty) remain unbuilt.
