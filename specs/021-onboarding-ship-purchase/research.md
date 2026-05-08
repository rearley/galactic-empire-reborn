# Research: Faithful Onboarding & Ship Purchase

## R1 — Starting state: class, cash, cargo

**Decision**: Class 1 (Interceptor), 5,000 credits, 3 flux pods (items[I_FLUX=4] = 3n), all other items 0.

**Rationale**: Verified directly from C source:
- `GEFUNCS.C:initshp()` comment: "give the dude a light freighter" — always class 0 (1-indexed: class 1)
- `GEFUNCS.C:initshp` sets `items[0..13] = 0` then `items[I_FLUX] = 3` (flux pods = item index 4)
- `GEMAIN.C:521` `startcash = numopt(STRTCASH,1,32000) * 1000` — BBS config option, default value 5
  → 5 × 1000 = 5,000 credits. Stored in `User.cash (BigInt)`.

**Alternatives considered**:
- Using a config/env variable for START_CASH: rejected — original is a sysop option but we hardcode
  the default (5) as a constant, matching how `GEMAIN.H` constants are handled throughout this codebase.

---

## R2 — `new ship` location gate: Zygor-3 identification

**Decision**: Check `Math.floor(ship.xcoord) === 0 && Math.floor(ship.ycoord) === 0 && ship.where >= 10`.
This means the player must be orbiting any planet in the neutral zone sector (0,0).

**Rationale**: In the original, `cmd_new ship` checks that the player is at the neutral zone
(sector 0,0). The game refers to this location as "Zygor station" or "Zygor-3". The
maintenance service in this codebase already uses the same pattern: `xsect === 0 && ysect === 0`.
Checking `ship.where >= 10` confirms orbit (ship.where = 10 + plnum per the orbit handler).
We do not restrict to a specific plnum — both neutral zone planets serve the trading/commerce role.

**Alternatives considered**:
- Checking `ship.where === 10` (planet 0 only): too restrictive; neutral zone has two planets.
- Checking only `ship.where >= 10` without sector check: would let players buy at any orbited planet.

---

## R3 — `new ship` cash field access pattern

**Decision**: Read `User.cash` from DB at command time for balance check; update via
`prisma.user.update({ data: { cash: { decrement: maxPrice } } })` on success.

**Rationale**: `User.cash` is not mirrored in `ShipState` — it lives only in the DB. This
matches the pattern used by `BuyHandlerService` (line 109: `prisma.user.update` with decrement).
No in-memory caching of cash is needed; the buy command already does a DB round-trip.

---

## R4 — `new ship` ship naming

**Decision**: Auto-generate the new ship's name as `"{typeName} #{nextShipNo}"` where
nextShipNo is `max(shipno for this user) + 1`. The player can rename later via `ren`.

**Rationale**: The spec does not require a separate name-prompt for `new ship` — that complexity
belongs to onboarding. The `ren` command already allows renaming. Auto-generation avoids a
multi-step interactive flow for an in-game command.

---

## R5 — OnboardingService signature change

**Decision**: Change `finalize(userid, classNumber, shipname)` to `finalize(userid, shipname)`.
The class is now always 1 (Interceptor). Extract a private `createShipRow()` helper for the
shared ship-creation logic (used by both `finalize` and the `new ship` handler's Prisma call).

**Rationale**: The classNumber param is no longer meaningful for onboarding. Removing it makes
the contract explicit. The `new ship` handler is a separate `@Injectable()` service that
injects `PrismaService` and `ShipStateService` directly — it does not call `OnboardingService.finalize()`.
Each has slightly different semantics (onboarding: always class 1, sets user cash; purchase:
arbitrary class, decrements user cash).

---

## R6 — Preventing new ship during combat

**Decision**: No combat lock check for `new ship` in this feature.

**Rationale**: The spec does not mention a combat lock gate for ship purchase. The original
allows purchase at Zygor as long as the player is orbiting. Adding combat lock would be a
scope addition; defer to a future hardening feature.

---

## R7 — Existing test suite compatibility

**Decision**: All 6 gateway test files that construct `new GameGateway(...)` already accept
8 arguments (RANDOM injected). The `OnboardingService` is mocked in these tests. Changing
`finalize()`'s signature from 3 args to 2 args will require updating the mock calls in those
tests.

**Files to update**: `combat-broadcast.spec.ts`, `game.gateway.droid-bridge.spec.ts`,
`player-snapshot.spec.ts`, `scan-se-gateway.spec.ts`, `scan-ra-gateway.spec.ts`,
`scan-render-event.spec.ts` — search for `.finalize(` in test files.
