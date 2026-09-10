import type { GameGateway } from '../../src/gateway/game.gateway';

/**
 * Type-level proof that `GameGateway.server` (and `.emit()` calls against
 * sockets of the same type) reject a wrong payload at compile time.
 *
 * This file is never executed — `jest`'s `testMatch` is `**\/*.spec.ts` and
 * this is a `.type-check.ts` file, so it is invisible to the test runner. It
 * IS covered by `tsconfig.json`'s `include` (`test/**\/*`), so
 * `npx tsc --noEmit` type-checks it on every run, including CI.
 *
 * The mechanism is `@ts-expect-error`: TypeScript raises its OWN error —
 * "Unused '@ts-expect-error' directive" — on any line below one where the
 * flagged mistake type-checks cleanly. So this file compiles ONLY when every
 * flagged payload is actually rejected.
 *
 * Read against `GameGateway` itself (not a private, locally-declared
 * `Server<...>`) so this is red for the real reason: before
 * `game.gateway.ts`'s `@WebSocketServer() server!: Server` gained the wire
 * generics, `emit` took `(event: string, ...args: any[])`, every flagged
 * mistake below type-checked without complaint, and every `@ts-expect-error`
 * was therefore "unused" — this file failed to compile. Adding
 * `Server<ClientToServerEvents, ServerToClientEvents>` to that field is what
 * turns it green.
 *
 * @see docs/superpowers/plans/2026-09-10-restructure-phase-1-wire-contract.md
 */

declare const server: GameGateway['server'];

// A correct payload compiles with no error.
server.emit('event.log', { text: 'hello', category: 'system' });

// A wrong field name on a known event must be rejected.
// @ts-expect-error — 'category' is misspelled as 'categry'.
server.emit('event.log', { text: 'hello', categry: 'system' });

// A value outside the declared category union must be rejected.
// @ts-expect-error — 'not-a-real-category' is not a member of EventLogCategory.
server.emit('event.log', { text: 'hello', category: 'not-a-real-category' });

// An event name that does not exist on the wire must be rejected.
// @ts-expect-error — 'event.lgo' is not a declared server-to-client event.
server.emit('event.lgo', { text: 'hello', category: 'system' });

// A payload missing a required field must be rejected.
// @ts-expect-error — 'reason' is required on auth:logout.
server.emit('auth:logout', {});

export {};
