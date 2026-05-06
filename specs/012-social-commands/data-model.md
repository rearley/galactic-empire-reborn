# Phase 1 Data Model: Social and Information Commands

**Feature**: 012-social-commands
**Date**: 2026-05-06

This feature ships **no Prisma schema changes**. Every persistent field it needs
already exists from features 001 (`User`, `Team`, `Ship`) and 003 (`ShipState`).
The only model change is in-memory: a denormalised `teamcode` cache on `ShipState`.

---

## Existing entities (read or written, no shape change)

### `User` (Prisma)

| Field        | Type        | Use in this feature |
|--------------|-------------|---------------------|
| `userid`     | `String` PK | Roster row key (`ros`); identity behind active ship |
| `score`      | `BigInt`    | `ros` primary sort, DESC |
| `kills`      | `Int`       | `ros` tiebreaker, DESC |
| `planets`    | `Int`       | `ros` row field |
| `population` | `BigInt`    | `ros` row field |
| `teamcode`   | `BigInt?`   | Read by `dat` (resolves to team name); written by `tea` |

`ros` query (Prisma pseudocode):

```ts
prisma.user.findMany({
  where: {
    AND: [
      { NOT: { userid: { startsWith: 'Cybrg-' } } },
      { NOT: { userid: { startsWith: '@Droid-' } } },
    ],
  },
  orderBy: [{ score: 'desc' }, { kills: 'desc' }, { userid: 'asc' }],
  take: limit, // ROSTER_MAX or 200
});
```

### `Team` (Prisma)

| Field       | Type     | Use |
|-------------|----------|-----|
| `teamcode`  | `BigInt` PK | Resolved from team name in `tea <name>`; cached on User and ShipState |
| `teamname`  | `String` | Case-insensitive lookup target for `tea <name>`; rendered by `dat` |
| `teamcount` | `Int`    | (Not modified by this feature; midnight job reconciles) |

Lookup query for `tea <name>`:

```ts
prisma.team.findFirst({
  where: { teamname: { equals: name, mode: 'insensitive' } },
});
```

### `Ship` (Prisma) → `ShipState` (in-memory)

| Field       | Used by | Mutated by |
|-------------|---------|------------|
| `shipname`  | `who`, `dat`, `sen` | — |
| `shpclass`  | `who`, `dat`        | — |
| `xcoord`/`ycoord` | `who`, `dat`, `sen` (sector derivation) | — |
| `kills`     | `who`, `dat`        | — |
| `cloak`     | All — gating         | — |
| `damage`/`energy`/`speed`/`heading` | `dat` | — |
| `items[14]` | `dat`               | — |
| `freq[3]`   | `sen`, `fre`        | `fre` (sets `dirty`) |

The `Ship.freq` column already exists as `Int[]` (verified in `backend/prisma/schema.prisma`).

### `ConnectedShipsRegistry` (in-memory, feature 010)

Source of truth for "online" enumeration. Used by `who`, `dat`, and `sen` to walk live
ships. Cloak is read off the resolved `ShipState`, not the registry itself.

---

## In-memory-only addition: `ShipState.teamcode`

```ts
// backend/src/game/ship/ship-state.types.ts (additive change)
export interface ShipState {
  // ...existing fields...

  /**
   * Denormalised team affiliation cached from User.teamcode.
   * Hydrated at boot from User.teamcode; rewritten synchronously by the `tea`
   * command alongside the User row.
   * NOT persisted on Ship — re-derived from User.teamcode on every hydrate.
   * @see specs/012-social-commands/research.md D6
   */
  teamcode?: bigint;
}
```

No corresponding `Ship.teamcode` Prisma column is added in this feature
(per `research.md` D6).

---

## Validation rules

| Command | Rule | Reference |
|---------|------|-----------|
| `dat` | Exactly 1 arg; trimmed; non-empty | FR-004; spec edge case |
| `ros` | 0 or 1 arg; if 1, must be `all` (case-insensitive) | FR-010 |
| `sen` | ≥ 2 args; channel ∈ {A,B,C} (case-insensitive); message ≤ 200 chars | FR-012, FR-016a |
| `fre` | Exactly 2 args; channel ∈ {A,B,C}; freq = `hail` OR positive integer ≥ 1 | FR-017–020 |
| `tea` | 0 or 1 args; if 1, `leave` or a team name (1–31 chars per `Team.teamname`) | FR-023–025 |
| `who` | 0 args | FR-001 |

---

## State transitions

**`fre` only**: `ShipState.freq[i]` transitions to the new value; `dirty` becomes `true`;
within ≤ 1 SHIP_UPDATE heartbeat the new value is in `Ship.freq` in Postgres.

**`tea join` only**: `User.teamcode` ← `<new>`; `ShipState.teamcode` ← `<new>`;
`ShipState.dirty = true`; `player.snapshot` broadcast follows.

**`tea leave` only**: same as join with `<new> = null`.

No other command in this feature transitions persistent state.
