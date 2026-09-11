import type { GameGateway } from '../../src/gateway/game.gateway';
import type { CommandBroadcast } from '../../src/game/commands/command.types';

/**
 * Type-level proof that `GameGateway.server` (and `.emit()` calls against
 * sockets of the same type) reject a wrong payload at compile time, and that
 * `CommandBroadcast`'s discriminated union stays in lockstep with the set of
 * events `dispatchBroadcast`'s switch actually handles.
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

// A wrong field TYPE on an otherwise-correct field name must be rejected.
// @ts-expect-error — 'text' must be a string, not a number.
server.emit('event.log', { text: 42, category: 'system' });

// An excess property on an otherwise-complete payload must be rejected.
// Excess-property checking only fires on an object literal passed directly
// as the argument, which is exactly how every real emit call site does it.
// @ts-expect-error — 'extra' is not a field of AuthLogoutPayload.
server.emit('auth:logout', { reason: 'bumped', extra: true });

// ─── The mistake a discriminated union exists to catch ────────────────────
//
// One event's payload sent under a DIFFERENT event's name. This is the
// failure mode `CommandBroadcast` (backend/src/game/commands/command.types.ts)
// was built to prevent for the dynamic broadcast path: `event` and `payload`
// are correlated by a discriminated union, not independently typed as
// `event: string; payload: unknown`, so pairing the wrong two must fail.
// @ts-expect-error — a ShipRenamedPayload does not belong under 'command.notice'.
const wrongPairing: CommandBroadcast = { room: 'ship:usr_x:1', event: 'command.notice', payload: { shipId: 'usr_x:1', oldName: 'Old', newName: 'New' } };
void wrongPairing;

// ─── The dispatchBroadcast exhaustiveness assertion ────────────────────────
//
// `GameGateway.dispatchBroadcast` closes its switch on `CommandBroadcast.event`
// with `const _exhaustive: never = broadcast;` in `default`, so a SIXTH
// variant that isn't matched by an explicit `case` fails to compile THERE —
// but `dispatchBroadcast` is private, so nothing outside game.gateway.ts can
// call it or observe that failure directly.
//
// A hand-copied replica switch was tried here first and rejected on review:
// it proved `never`-narrowing works in general, which was never in doubt, but
// it does not touch `dispatchBroadcast` or its real switch at all — deleting
// a `case` from the real one would leave a hand-copied replica green, which
// is worse than no test because it implies coverage that does not exist.
//
// This instead pins the REAL `CommandBroadcast['event']` union — imported
// from command.types.ts, not redeclared — against the exact set of names
// `dispatchBroadcast`'s switch handles. `HandledByDispatch` must be kept in
// sync with that switch's `case` labels by hand; the payoff is that the two
// live inches apart, in the same file, so drift is visible where it happens
// rather than hidden behind a replica.
//
// Must mirror the `case` labels in `GameGateway.dispatchBroadcast`
// (game.gateway.ts) exactly. Add a variant to CommandBroadcast without a
// case there AND without adding it here, and this file goes red — that is
// the failure mode this assertion exists to catch.
type HandledByDispatch =
  | 'command.notice'
  | 'event.log'
  | 'message.send'
  | 'player.snapshot'
  | 'ship.renamed';

// Ordinary `A extends B` DISTRIBUTES over a union: checked member-by-member,
// each failing member becomes `never`, and `never` vanishes out of a union
// (`true | never` collapses to plain `true`). That would make this assertion
// pass silently even when `CommandBroadcast['event']` gains a member missing
// from `HandledByDispatch` — exactly the drift this file exists to catch.
// Wrapping both sides in a one-element tuple suppresses distribution, so the
// whole union is compared as a single type in each direction: this only
// resolves to `true` when the two sets are exactly equal.
type SetEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type _CommandBroadcastEventsMatchDispatch = SetEqual<CommandBroadcast['event'], HandledByDispatch>;
const _assertAllHandled: _CommandBroadcastEventsMatchDispatch = true;
void _assertAllHandled;

export {};
