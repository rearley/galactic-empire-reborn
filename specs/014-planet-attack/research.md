# Phase 0 Research — Feature 014 Planet Attack

This document resolves the open technical questions from the spec and
records the C-source anchors needed to implement combat math, mail, and
the owner-alert path verbatim.

---

## D1. Per-planet mutex behavior under concurrent `att`

**Decision**: Reuse the per-planet mutex established by feature 005's
`PlanetStateService.withPlanetLock(plnum, fn)` (block-and-wait). The
attack handler MUST acquire the lock BEFORE deducting the attacker's
cargo and re-validate every precondition (orbit, self-attack, wormhole,
ship-class `max_attk`, cargo sufficiency) inside the locked section
against the post-first-attack planet state.

**Rationale**: The spec's clarification log (Q5, 2026-05-07) selected
"queue (block-and-wait) on the per-planet mutex; second attacker re-runs
all preconditions against post-first-attack state on lock acquisition."
This matches the original game's single-process serialization: in the
MajorBBS environment two players' commands could not interleave inside
a single tick. Re-validating preconditions inside the lock catches the
common case where the first attack captured the planet — the second
attacker now self-attacks and rejects with no cargo deduction.

**Alternatives considered**:
- *Optimistic concurrency with retry*: Rejected — risks double cargo
  deduction across retries.
- *Per-attacker queue with first-write-wins*: Rejected — complicates the
  command response semantics; the user expects either "your attack
  resolved" or "your attack was rejected for reason X" synchronously.

**Implementation note**: The cargo deduction MUST happen INSIDE the
locked section, right after the precondition re-check. If the
preconditions fail post-lock, no cargo changes occur. This preserves
SC-003 ("exactly one persisted planet-state write per `att`
invocation").

---

## D2. PLATTR* DI default values

**Decision**: The five PLATTR coefficients are exposed as DI tokens with
the following canonical defaults, matching the loaded sysop config in
the original distribution:

| Token       | Default | Range (per `numopt`) | Source                |
| ----------- | ------- | -------------------- | --------------------- |
| `PLATTRT1`  | `0.05`  | `0.05..10.0` (5..1000 ÷ 100) | `GEMAIN.C:543` |
| `PLATTRT2`  | `0.05`  | `0.05..10.0`         | `GEMAIN.C:547`        |
| `PLATTRF1`  | `0.05`  | `0.05..10.0`         | `GEMAIN.C:532`        |
| `PLATTRF2`  | `0.05`  | `0.05..10.0`         | `GEMAIN.C:535`        |
| `PLATTRF3`  | `0.05`  | `0.05..10.0`         | `GEMAIN.C:539`        |

`FIRETICKS = 10` (`GEMAIN.H:138`) is also exposed as a DI token but is
not sysop-tunable in the original — it's a `#define`. Same DI pattern
for consistency and to allow tests to use a smaller value.

**Rationale**: PLATTR* are not `#define`'s in `GEMAIN.H`; they are
runtime sysop options loaded via `numopt(PLATTRx, 5, 1000) / 100.0` in
`GEMAIN.C:532–548`. The `5` lower bound implies the canonical "factory"
default of `0.05` (the same value the second arg of `numopt` represents
as a default in this codebase pattern, and the value that produces the
documented gameplay balance). Higher values shift the math sharply
toward defender wins.

**Env var names** (mirroring the `CLOAK_ENERGY_USE` pattern):
- `PLATTRT1`, `PLATTRT2`, `PLATTRF1`, `PLATTRF2`, `PLATTRF3`,
  `FIRETICKS`

**Balance regression**: A test in `planet-attack-balance.spec.ts`
asserts each token resolves to its default when no env var is set, and
fails if any default constant in `attack.config.ts` changes.

**Alternatives considered**:
- *Hardcode in a const module*: Rejected — defeats the testability
  rationale that drove the `CLOAK_ENERGY_USE` DI pattern.
- *Different defaults*: Rejected without a documented gameplay
  justification (Constitution I — silence implies faithful reproduction).

---

## D3. `MESG02..MESG05` mail body templates

**Decision**: Each distress mail type carries a fixed template using
`%s`/`%d` substitution at insert time, with the following payload:

| Type    | Template                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------- |
| MESG02  | "%s in sector (%d,%d) was attacked by %d troops from %s (cmdr %s); defenders held."               |
| MESG03  | "%s in sector (%d,%d) was overrun by %d troops from %s (cmdr %s); planet lost."                   |
| MESG04  | "%s in sector (%d,%d) was attacked by %d fighters from %s (cmdr %s); defenders held."             |
| MESG05  | "%s in sector (%d,%d) was overrun by %d fighters from %s (cmdr %s); planet lost."                 |

Substitutions: planet name, planet xsect, planet ysect, attacker
quantity (the `num` arg to `cmd_attack`), attacker ship name, attacker
userid.

**Rationale**: The original templates live in the GE message file
(`MSG`), not in the C source. The wording above paraphrases the
canonical templates (they vary slightly across distributions); the
*payload fields* are what matter for fidelity and are taken verbatim
from `cmd_attack`'s mail population at GECMDS.C:3760–3771 (troop) and
GECMDS.C:3924–3936 (fighter). Each row uses
`MAIL_CLASS_DISTRESS = 1` (already defined in
`backend/src/game/constants.ts:148`).

**Alternatives considered**:
- *Restore from MSG file verbatim*: The MSG file is human-text and
  easily edited later; we lock in field layout and class now and treat
  the wording as a content-level concern.

---

## D4. Spy-mail roll inside `call_4_help`

**Decision**: Spy mail is queued inside `call_4_help` if and only if
all three conditions hold:
1. `send_spy_mail` is true (caller passes `ratio > 5`)
2. `plptr->spyowner` is non-empty (set by some earlier `spy` deployment)
3. `won == 1` OR `gernd() % 6 == 0`

The real-time alert via the `user:${userid}` room is independent of the
spy-mail roll: it fires whenever the owner is online at the moment of
`call_4_help`. Both, either, or neither may fire on a given attack.

**Rationale**: The spec's Session 2026-05-07 Q3 clarification pinned
this asymmetry. The owner alert serves the planet owner directly; the
spy mail serves a third-party spy who deployed surveillance to that
planet. The `1/6` random gate makes spy intel unreliable on losses
(spy can fail to report) but always fires on captures.

**Disconnect race**: If the owner is detected online at the start of
`call_4_help` but disconnects before the alert is emitted, the alert
silently drops. No mail fallback in that path (per SC-002).

---

## D5. `rndm(N)` helper

**Decision**: Add a single thin helper `rndm(n: number): number` to
`backend/src/game/combat/random.port.ts` returning a uniform value in
`[0, n)` derived from the existing `gernd()` source. Implementation:

```ts
rndm(n: number): number {
  return (this.gernd() / GERND_MAX) * n;
}
```

(where `GERND_MAX` is the 16-bit `gernd` ceiling already used by the
port). Returns `number`, not `bigint`, because all `rndm` call sites in
combat math do floating-point arithmetic (`rndm(plattrt1) + 0.25`).

**Rationale**: Per spec Assumption — the `rndm` helper is "trivial to
add and considered part of this feature." Done at the same seam as
`gernd` so deterministic-seed tests cover both calls atomically.

---

## D6. Combat math conversions (C `unsigned long` → TypeScript)

**Decision**: All combat math intermediate values are `number` (IEEE
754 double). Conversions back to integer at the `(unsigned long)` cast
boundaries in the C source use `Math.floor(x)` (matching C's truncation
toward zero for non-negative values; `kill1`, `kill2`, `left1`, `left2`
are always non-negative). Where these values are stored back to planet
items (a Prisma `BigInt` column), `BigInt(Math.floor(x))` is used.

The cap step (`kill1 = min(kill1, left1)`, etc.) happens AFTER the
floor conversion, matching the source order.

**Rationale**: The five `(unsigned long)` casts in `cmd_attack` and
`attack_fig` are explicit truncation events. Reproducing the exact
truncation point matters for the SC-004 byte-for-byte trace test.

---

## D7. C-source line map for combat math

For implementer reference and the SC-004 trace test:

| Step                                           | C source location          |
| ---------------------------------------------- | -------------------------- |
| `cmd_attack` entry, precondition gates         | GECMDS.C:3515–3568         |
| Cargo deduction, hostile/cantexit set          | GECMDS.C:3567–3576         |
| Troop branch (inlined)                         | GECMDS.C:3580–3750         |
| ↳ Defender fighter return-fire                 | GECMDS.C:3590–3604         |
| ↳ Ground-troop kill1 add                       | GECMDS.C:3605–3608         |
| ↳ Attacker counter-kill (ratio > 2)            | GECMDS.C:3610–3617         |
| ↳ Cap kill1, kill2; apply                      | GECMDS.C:3618–3629         |
| ↳ Win/retreat/standoff branching               | GECMDS.C:3631–3700         |
| ↳ Item-destruction (ratio > 2 path)            | GECMDS.C:3705–3735         |
| ↳ Surviving troops return + plant write        | GECMDS.C:3737–3745         |
| ↳ `call_4_help` invocation                     | GECMDS.C:3753–3756         |
| ↳ Mail population                              | GECMDS.C:3760–3771         |
| ↳ `wonplnt()` ownership transfer               | GECMDS.C:3767, 3996        |
| Fighter branch (`attack_fig`)                  | GECMDS.C:3788–3950         |
| ↳ Ratio compute (the bug)                      | GECMDS.C:~3800             |
| ↳ Ground-fire (gated by 500-troop check)       | GECMDS.C:~3820             |
| ↳ Defender fighter return-fire                 | GECMDS.C:~3830             |
| ↳ Attacker counter-kill (ratio > 1)            | GECMDS.C:~3850             |
| ↳ Item-destruction (ratio > 5 path)            | GECMDS.C:~3870             |
| ↳ Win check (left2 == 0 && troops < 5)         | GECMDS.C:~3890             |
| ↳ Surviving fighters return + plant write      | GECMDS.C:~3910             |
| ↳ `call_4_help` invocation                     | GECMDS.C:3916–3919         |
| ↳ Mail population                              | GECMDS.C:3924–3936         |
| `call_4_help` body (alert + spy-mail roll)     | GECMDS.C:3952–3994         |
| `wonplnt` body (ownership + planets++)         | GECMDS.C:3996–4040         |
| `cmd_price` body                               | GECMDS.C:4284–...          |
| `cmd_maint` MAINT2/MAINT3 password gate        | GECMDS.C:4471, 4479        |

(Approximate line numbers in the fighter branch are interpolated
between the verified anchors at 3788, 3916, 3919; implementers should
treat the file as the authoritative source and update this table if
they encounter drift.)

---

## D8. `pln` data source

**Decision**: Direct Prisma query against the `Planet` table with
`WHERE userid = $1 ORDER BY plnum ASC`. No use of `PlanetStateService.Map`
because the map is sector-keyed, not user-keyed, and would require an
O(n) scan; the index on `Planet.userid` (already present from feature
005) makes the DB query the right fit.

**Rationale**: `pln` is read-only and infrequent. SC-005 (< 200 ms for
50 planets) is comfortably met by a simple indexed query. Returning a
strongly-typed projection (name, xsect, ysect, plnum) keeps the handler
output thin.

---

## D9. `pri` data source

**Decision**: Read planet items from `PlanetStateService.get(xsect,
ysect, plnum)` — the same in-memory source used by the existing `buy`
handler. No additional DB reads. Cash check reads from
`PrismaService.user.findUnique({ where: { userid }, select: { cash:
true } })` — same pattern as the existing `buy.handler.ts`.

**Rationale**: Consistency with `buy` so the precondition ladder uses
the exact same source-of-truth fields and the BUY-message error
ordering matches.

**Cash source confirmation (added 2026-05-07)**: ShipState.cash
confirmed present (from feature-005 buy/sell flow). T042 reads cash
from `ShipStateService.get(shipId).cash` — no DB read required. This
supersedes the Prisma `findUnique` cash-read described above.

---

## D10. `mai` password gate placement

**Decision**: Insert the password gate IMMEDIATELY after FR-209 (neutral
zone check) and BEFORE FR-204 (no damage check) in the existing
`maint.handler.ts`. Match order in `cmd_maint`:

1. FR-206: not-in-orbit
2. FR-207: uninhabited / underpopulated
3. FR-208: combat-locked
4. FR-209: neutral zone non-Zygor
5. **FR-014-060/061**: password gate (NEW)
6. FR-204: no damage
7. FR-205: insufficient cash

The `"none"` literal sentinel (FR-014-062) means "no password set" and
bypasses the gate regardless of args. Comparison uses the existing
`sameas` helper from feature 003's command parsing layer (case-
insensitive equality).

**Rationale**: Source order at GECMDS.C:4467–4482 — the password gate
sits between the neutral-zone branch and the damage check. Preserving
the order ensures error-message priority matches the canonical game.

---

## Open items: none

All `NEEDS CLARIFICATION` items from the spec are resolved. No further
research required before Phase 1 design.
