# Phase 1 Data Model: Cybertron AI

**No Prisma schema change.** This feature reuses the existing `Ship`,
`User`, and `ShipClass` tables. The AI-specific columns on `Ship` are
already present from feature 001 (`cybmine`, `cybskill`, `cybupdate`,
`tick`, `holdcourse`, `status`).

## Tables touched

### Ship (unchanged schema; columns the AI reads/writes)

| Column          | R/W | Purpose for the AI |
|-----------------|-----|--------------------|
| `userid`        | R   | Identity prefix `Cybrg-<n>` for **all** CYBORG-class ships (Cybertrons and Sarterns alike — verified against `GECYBS.C:104-105`). |
| `shipno`        | R   | Slot index used in the userid suffix. |
| `shpclass`      | R   | Resolves to a `ShipClass` row for caps/ranges/`tough`. |
| `xcoord`/`ycoord` | R/W | Read for distance/bearing math; written by 006a (movement). |
| `heading`/`head2b`/`speed`/`speed2b` | R/W | Set by `cyb_check_lockon` pursuit-band selection and `cyb_check_damage` random-heading branches. |
| `where`         | R/W | Hyperspace flag. Set to 1 on hyperwarp; 0 on drop-out. |
| `shield`        | W   | Set to 0 on hyperwarp entry; restored to `ShipClass.maxShields` on drop-out (per spec clarification + R-9). |
| `phasr`         | R   | Read for "phaser charge ≥ minimum" gate inside engagement. |
| `energy`        | W   | Reset to 50,000 at end of `cyb_lives` (FR-011) — Cybertrons do not run out of energy. |
| `damage`        | R   | Read by `cyb_check_damage` against `CYB_MINDAM`. |
| `items[]`       | R/W | Loadout: `I_GOLD`, `I_TORPEDO`, `I_MINE`, `I_DECOYS`, `I_JAMMERS`, `I_FLUXPOD`. Initialized at spawn (FR-004); decremented on weapon use; depletion is a flush trigger (FR-019). |
| `cybmine`       | R/W | Currently claimed target ship index (255 = none). The cornerstone of the targeting state machine. |
| `cybskill`      | R   | 3..17 set at spawn; per-tick `cybwhoops` 1-in-`cybskill` roll. |
| `cybupdate`     | R/W | Decremented per tick; on rollover randomize speed/heading if not hunting and reset to `100 + rnd%100` (FR-019). |
| `tick`          | R/W | Per-ship countdown; only ships at zero execute `cyb_lives` this tick. |
| `holdcourse`    | R/W | Set on jam/damage branches; decremented by `cyb_check_lockon` early-return (FR-010). |
| `status`        | R   | Iteration filter — only `AUTO` ships are considered AI. |
| `kills`         | W   | Incremented when this Cybertron's hit lands a kill (delegated to combat). |
| `phasrtype`/`shieldtype` | W | Set at spawn from class max (FR-004). |
| `lastfired`     | W   | Updated by 006b on weapon fire — included here so reviewers know AI weapon-fire still routes through 006b. |

### User (unchanged schema; columns the AI reads/writes)

| Column     | R/W | Purpose for the AI |
|------------|-----|--------------------|
| `userid`   | R   | Identity, `Cybrg-<n>` (single prefix for all CYBORG-class AI ships including Sarterns). |
| `cash`     | R/W | Gold balance. `+CYB_ALLOW` per ticking Cybertron (FR-005). Clamped to `CYB_MAXCASH` at load and on every flush (FR-005, FR-020). Transferred to attacker on death and zeroed (FR-005a). |
| `kills`    | R   | Read on the **target player** for `gebemean` and torpedo-volley sizing (FR-014, FR-015). |

### ShipClass (unchanged schema; columns the AI consumes)

| Column                   | Purpose |
|--------------------------|---------|
| `classNumber`            | Identity. AI iterates classes whose `category == 'CPU_COMBATIVE'` for spawn-fill. |
| `category`               | Filter for spawn-class candidates. |
| `scanRange`              | Per-class scan/lockon range. Used in target-eligibility test and jammer area effect. |
| `noClaim`                | Per-class pile-on cap — a target already claimed by `noClaim` Cybertrons is ineligible. |
| `tough`                  | `CYB_TOUGH_0` (ordinary) vs `CYB_TOUGH_1` (cyberquad) — drives `gebemean` short-circuit and breakoff exemption. |
| `cybCanAttack`           | Whether *this* class can be a Cybertron target (player-class flag). |
| `cybLowestClassAttacks`  | Lowest Cybertron class that will pick up this player class. |
| `maxShields`             | Used to restore `Ship.shield` on hyperwarp drop-out (R-9). |
| `maxPhaser`              | Used at spawn to set `Ship.phasrtype` (FR-004). |
| `hasTorpedo`/`hasMine`/`hasJammer`/`hasZipper` | Branch gates inside engagement, damage-response, and jammed-evasion. |

## Per-class tunables (cybertron.config.ts)

Held in `cybertron.config.ts`, keyed by `classNumber`, registered with
NestJS `ConfigModule`. Defaults sourced verbatim from `GECYBS.C` /
`GEMAIN.H` for shipped CPU classes (CYBORG and Sartern). Overridable via
env (`CYBERTRON_CLASS_<N>_TOT_TO_CREATE=…`, etc.).

| Key            | Type | Source | Notes |
|----------------|------|--------|-------|
| `tot_to_create` | int  | `GECYBS.C` class table | Per-class population cap. |
| `tooclose`     | int  | `GECYBS.C` class table | Range gate for warp-fire and `cyb_attack` vs `cyb_annoy` decision (FR-006). |
| `hyperdist1`   | float | `GECYBS.C` class table | Long-range pursuit threshold (~25 sectors). |
| `hyperdist2`   | float | `GECYBS.C` class table | Mid-range brake threshold (~10 sectors). |
| `cyb_gold`     | int  | `GECYBS.C` class table | Spawn-init upper bound for `I_GOLD = rnd%cyb_gold` (FR-004). |

## New ShipClass seed rows (data only — no schema change)

`prisma/seed/ship-classes.ts` is extended with two rows for Sarterns
(classes 24 and 25). All field values come **verbatim** from the
original C source class table. The seed is idempotent; rerunning it
upserts rather than duplicating.

| Row attribute | Class 24 | Class 25 |
|---------------|----------|----------|
| `classNumber` | 24 | 25 |
| `category` | `'CPU_COMBATIVE'` | `'CPU_COMBATIVE'` |
| `tough` | per C source | per C source |
| `scanRange`, `maxShields`, `maxPhaser`, `hasTorpedo`, `hasMine`, `hasJammer`, `hasZipper`, `noClaim`, `cybCanAttack`, `cybLowestClassAttacks` | per C source | per C source |

(Exact numbers will be filled in during implementation when reading the
C class table; intentionally left as "per C source" here so this design
doc does not duplicate game-balance constants outside their canonical
location.)

## In-memory-only state

| Owner                   | Field | Purpose |
|-------------------------|-------|---------|
| `CybertronTickService`  | `private spawnTickCounter: number` | Modulo-30 counter that gates spawn-slot execution to once every ~30 service ticks (R-2). |
| `CybertronTickService`  | `private activationsThisTick: number` | Hard-cap counter for `CYBMAXPERTICK = 2` per service tick (R-3). Resets at the start of each tick. |
| `taunt-pool.ts`         | `TAUNT_MESSAGES: readonly string[]` | Fixed pool of hostile in-character strings; `cyb_annoy` picks one via the seeded `Random` port. |

No other in-memory-only state is introduced — all per-Cybertron AI state
already lives on the `Ship` and `User` rows in Postgres and in
`ShipStateService`'s in-memory `Map`.

## Validation rules

- **`cybskill`**: integer in `[3, 17]` (FR-013). Enforced at spawn, not
  re-validated on rehydrate (rehydrate trusts the DB row; out-of-range
  values are logged and clamped).
- **`User.cash`**: clamped to `[0, CYB_MAXCASH]` for any user whose
  `userid` matches `/^Cybrg-/` (single prefix covers Cybertrons and
  Sarterns — see `GECYBS.C:104-105`). Enforced at every persistence
  boundary: spawn-init insert, immediate-flush hooks, the 30s async
  ShipStateService flush, and boot-time hydrate (FR-005, FR-020).
- **`cybmine`**: byte; 255 sentinel for "no target". Validated against
  the existing `Ship` table on every read (target may have logged out
  since acquisition — `cyb_check_lockon` clears on invalid).
- **Spawn slot picker**: only allocates `shipno` values above the
  configured human player ceiling (`nterms` in the original — sourced
  from a config constant) so AI ships never collide with player slots.

## State transitions (per-Cybertron `cyb_lives` flow)

```
                           ┌──────────────────────────┐
                           │  Ship row (status=AUTO)  │
                           │  tick > 0                │
                           └───────────┬──────────────┘
                                       │ tick decrement (every PHYSICS tick)
                                       ▼
                           ┌──────────────────────────┐
                           │  tick == 0?              │
                           └───────────┬──────────────┘
                                       │ yes
                                       ▼
                           +CYB_ALLOW gold (clamped on flush)
                                       │
                                       ▼
                           ┌──────────────────────────┐
                           │  jammer == 0?            │
                           └─────┬──────────────┬─────┘
                            yes  │              │ no
                                 ▼              ▼
                       Engagement scan      Jammed branch:
                       (warp-fire,          mine? jammer? new heading,
                       attack/annoy,        hold-course timer
                       lay decoys,          (FR-008)
                       breakoff roll)
                       (FR-006, FR-007)
                                 │              │
                                 ▼              ▼
                                 cyb_check_damage (FR-009)
                                 │
                                 ▼
                                 cyb_check_lockon (FR-010)
                                   ├─ holdcourse > 0 → decrement, return
                                   ├─ target invalid → clear cybmine
                                   └─ scan + pursuit-band selection
                                       (hyperwarp / brake / close / combat)
                                 │
                                 ▼
                                 energy = 50_000
                                 next tick = long sleep | short sleep
                                 (FR-011)
                                 │
                                 ▼
                                 cybupdate decrement (FR-019)
                                 if rollover and not hunting:
                                   randomize speed/heading
                                   reset cybupdate = 100 + rnd%100
```
