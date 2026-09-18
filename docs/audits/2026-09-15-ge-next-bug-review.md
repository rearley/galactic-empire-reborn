# ge-next legacy bug review — 2026-09-15

<!-- STATUS: B-01 FIXED 2026-09-15. Eleven items verified as already-handled or
     structurally impossible. Ten not yet verified. -->

> **B-01 is fixed** (`countCybertronClaims`, same session). The `GELIB.C`
> finding was narrower than first written — see the correction in its section.

Anthony Schmidt (manicpop), maintainer of `ge-next`, supplied `GEFIXES.TXT` —
notes on bugs inherited from classic GE that a faithful port should consider
fixing. The document is AI-assisted, so every claim here was re-read against the
vendored original rather than taken on trust.

**Nothing in this audit changed code.** It is a triage, in the four buckets
`CLAUDE.md` now defines: *cannot happen here*, *already handled*, *determinable
intent → fixable*, *balance → refuse*.

## The headline

**Most of these are bugs in C's data REPRESENTATION, not in the game's design,
and this port replaced the representation.** Array indexing, 16-bit wrapping,
adjacent per-user structs, fixed terminal buffers — a large fraction of the
document evaporates against `bigint`, keyed rows and per-ship objects. That is
not luck and not cleverness; it is what porting to a different substrate does.

The corollary is the finding that matters: **where we DID keep canon's
representation, we kept canon's bug.** B-01 below is exactly that.

## Confirmed live defect — FIXED 2026-09-15 in v0.20.1

> **CLOSED.** `719a37c` — `countClaims` now takes a class predicate
> (`cybertron-tick.service.ts:1155`, `countCybertronClaims` in
> `cyb-decisions.ts:511`) so only `CPU_COMBATIVE` hulls are counted. Pinned by
> `test/game/cybertron/claims-are-cybertron-only.spec.ts`. The analysis below is
> kept because it is the reasoning for the deviation, not a to-do.

### B-01 — shooting a droid registers a fake Cybertron claim on you

`countClaims` (`cybertron-tick.service.ts:1131`) counts every ship with
`status === 2` whose `cybmine` matches the target's channel. Droids carry
`GESTAT_AUTO` too, and `phaser.handler.ts:256` writes
`v.cybmine = ship.channel` onto any `GESTAT_AUTO` victim — faithfully, per
`GECMDS.C:980-981`.

So: phaser a droid, and that droid now holds a `cybmine` claim on you. With
`noClaim: 1` for an Interceptor, **one shot at a droid can lock every Cybertron
out of pursuing that player.**

This is canon's own `notclaimed()` bug (`GECYBS.C:365-370` counts all
`GESTAT_AUTO`) reached by a different route: canon gets there through droids
inheriting `cybmine = 0` from the new-ship template, we get there through the
phaser path. Same counter, same wrong answer.

**We half-fixed this already and did not notice.** `selectAiShips` filters to
`CPU_COMBATIVE` so droids no longer RUN the Cybertron brain — the comment at
`cybertron-tick.service.ts:218-226` describes exactly this class of bug — but
filtering who runs the brain does not change who gets COUNTED.

Determinable intent: the counter asks "how many Cybertrons have claimed this
player", and a droid is not a Cybertron. `cybmine` does not appear anywhere in
`GEDROIDS.C`; a droid carrying one is meaningless data being counted. ge-next's
fix is the same — count only `CLASSTYPE_CYBORG`.

## Verified, and cannot happen here

| Their item | Canon claim | Why it cannot reach us |
|---|---|---|
| Ion-cannon range (`hostile - 10`) | **TRUE, and stronger than stated** | We look planets up by key, never index an array |
| `cbearing` `+.000001` mutating the caller | **TRUE** — `GELIB.C:149-150` | `physics-math.ts:249` is pure; nothing is mutated |
| `vector()` axis-aligned quadrant errors | plausible | `headingToward` is one `Math.atan2(dx, -dy)`; no quadrant selection, no `acos`, cardinals exact |
| `refresh()` PLANETAB overrun | TRUE | No per-user planet array to overrun |
| Cargo/currency 16-bit wrapping | TRUE | `bigint` for cash and cargo, `number` for coordinates |
| Ship-selection buffer overflow | TRUE | No fixed terminal buffer |

The ion-cannon item deserves its own note, because the evidence is better than
the document realises. `GECMDS.C:801` sets `warsptr->where = 10 + plnum` with a
**1-based** `plnum`; `GEFUNCS.C:918` decodes `i = ptr->hostile - 10` and indexes
a **0-based** array — so it checks the planet AFTER the one you attacked. And
`GEFUNCS.C:1793` uses the identical expression **correctly**, because there the
consumer is 1-based. The same arithmetic is right in one place and wrong in the
other. That is about as legible as intent gets — and it still cannot affect us,
because `fireIon` calls `this.planets.get(x, y, plnum)`.

## Verified, and already handled

| Their item | Where we handle it |
|---|---|
| Channel 0 breaks droid retaliation (`lastfired > 0`) | `ShipChannelRegistry` allocates **from 1**, citing `GEDROIDS.C:447` for this exact reason. Both variants sidestepped. |
| Reusable channel as permanent identity | `release` scrubs the channel from every ship still referring to it. We learned this the hard way — using `shipno` once credited kills to bystanders two sectors away. |
| Projectiles following a ship through a wormhole | `gravity.ts` carries `clearProjectiles` on wormhole transit. |
| Planet updater can skip records | `lastTickAt` is a **persisted column**; `isDue()` compares wall-clock elapsed against the period and survives restarts. `docs/DECISIONS.md` 2026-09-06. |
| Perimeter corner applies damage twice | `hitEdge = ex.hitEdge \|\| ey.hitEdge` — one damage event, both axes still clamped. |

One nuance on the planet updater: we run **one** tick when a planet is due, not
N ticks for N missed periods. ge-next does a bounded one-week catch-up. Ours is
a deliberate difference rather than an oversight — a week of downtime should not
detonate the galaxy's economy on restart — but it is a difference, and it is not
written down anywhere yet.

## Refuse — balance, not defect

- **DAMF applied to phasers.** Analysed 2026-09-15: it deletes the one mechanic
  that makes tonnage mean anything, and turns "what am I shooting this with?"
  into "whatever hits hardest". The document itself flags it as balance.
- **The NPC redesign wholesale.** Their own advice, and ours.

## The remaining ten, now verified

| # | Item | Verdict |
|---|---|---|
| 1 | Flux / energy underflow | **CLOSED.** Every debit validates first — cloak collapses when short, the droid hyperphaser returns below `HPMINFIR`, shields clamp at 0. `bigint`/`number` removes the wrapping class outright. |
| 2 | Team code reuse | **CLOSED.** `teamcode` is the PRIMARY KEY and rows are never deleted; removal sets a `removed` flag. That is ge-next's tombstone, reached independently — and the schema comment records WHY, because canon's `teamcode = -1` collided the moment a second team emptied. |
| 3 | Phaser spread bias, even-class truncation | **REFUSE.** They flag the phaser package as balance-affecting themselves. Ours is symmetric anyway: `withinArc` folds `abs(victimAngle - firingAngle)` to ≤180 and tests against `focus + PHABIAS`, so the beam is centred by construction. |
| 4 | PRICE shows the owner the wrong base price | **CLOSED.** We implement canon's two-price rule (`BASEPRICE` to the owner, `markup2a` to everyone else, GECMDS.C:4437). A player already reported it as a bug — issue #1 — and it was canon. We added a line to the output saying so. |
| 5 | `MAXPLREC` creation-failure handling | **N/A.** No fixed planet-record ceiling to fail against. |
| 6 | Stale/malformed NPC records after a config change | **FIXED.** `hydrateAll` filters on `userid startsWith 'Cybrg-'` and skips `damage >= 100`, but does NOT check the saved `shpclass` against the slot's configured class. Change the class config and an old row loads as a class no longer configured for that slot. `hydrateAll` now checks the saved class against the configured CPU_COMBATIVE set and skips (does not delete — `createSpawn` upserts the slot anyway). The guard FAILS OPEN on an empty class table: rejecting everything there would empty the galaxy of AI at boot, which `persistence.spec.ts` caught by using a real database and seeding no classes. |
| 7 | Zero-acceleration Cyber-Base entering movement code | **CONFIRMED, FIXED.** Real, and latent rather than live. Canon's data says immobile (`S23ACCL 0`, `S23WARP 0`) and the hyperwarp band writes `ptr->speed` directly with no bound — measured at 100,000 units for a target 50 sectors out. Unreachable today only because `S23LATK 20` means the base attacks classes 20+ and players fly 1-9; that is a sysop tunable, not a fix. `isStationaryClass` now withholds the movement half of the band while leaving shields and heading alone. The fix is NOT a speed clamp: hyperwarp is deliberately unbounded ("20 X normal speed", GECYBS.C:744), so clamping to `topSpeed` would break every mobile Cybertron. |
| 8 | NPC classes crowding each other out | **PARTIAL — canon wins.** Canon's "first class below cap in table order" bias does not apply: `pickSpawnClass` picks UNIFORMLY among eligible classes. The 1% wildcard branch can still select a class already at its cap, which is the half that applies — but canon does not contradict itself there, so under the determinable-intent rule it stays. ge-next's slot-range allocator is a redesign they advise against copying. |
| 9 | Scan `?` letters, stale/self locks | **CLOSED.** `findShip`'s `@` path excludes self explicitly and re-validates the lock on every use — `isIngame` then `inScanRange`, each clearing it (`clearedLock: true`) when it fails. It prefers the composite `lockKey` over a bare `shipno`, with a note explaining that every droid and every player's first ship is shipno 1. `?` is canon's own unidentified sentinel, not a defect. |
| 10 | Mine slot magic value overloaded | **CLOSED.** `MINE_SLOT_FREE = 255` marks a free slot, and `MineState.deployedBy` carries a stable userid independent of it — which is exactly the separation they ask for. |

**Final tally across the whole document: three defects found and fixed (B-01,
#6, #7), sixteen already handled or structurally impossible, two refused as
balance, nothing left open.**

Of the three, only B-01 was reachable in normal play. #7 was latent behind a
sysop tunable and #6 behind a configuration change — both worth fixing because
"unreachable because of a setting" is not the same as fixed.

## Found on the way: `reference/ge-source/` is incomplete

`CLAUDE.md` says `ge-source/` is "identical to `ge-upstream/mbmgemp/*.C`". It is
not: `ge-source/` holds 8 files, upstream holds 10. **`GELIB.C` is missing** —
and it contains `vector()`, `cbearing()`, `angleb()` and `anglec()`, the
geometry primitives. `GESAMPLE.C`, `MBMGEGRF.C` and `SECURE.C` are also absent.

**CORRECTION to this section, made while fixing it:** the TOOLING was already
right. `canon-citations.balance.spec.ts` loads BOTH trees, with a comment saying
"the source legitimately cites GELIB.C". Only the prose in `CLAUDE.md` was
wrong, and only a reader following it would have been misled — as this audit's
author was, having to read `ge-upstream` directly to verify the `cbearing`
claim.

`/reference/` is READ ONLY, so the fix is the sentence, not the tree.
`CLAUDE.md` now names the eight files `ge-source/` holds and points at
`ge-upstream` for `GELIB.C`.

## Method note

The document's own closing taxonomy — adopt safety/identity fixes, usually adopt
restored intent, keep classic balance, replace 16-bit workarounds with native
design — is nearly identical to the rule written into `CLAUDE.md` earlier the
same day, independently. Two ports converging on the same policy is reasonable
evidence the policy is right.

Credit: bug list from Anthony Schmidt (manicpop), `ge-next`. Every item was read
against the vendored original here rather than taken from ge-next's code — see
the licensing note in `CLAUDE.md` about not copying fixes from sibling ports.
