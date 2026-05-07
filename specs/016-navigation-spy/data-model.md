# Data Model — 016 Navigation, Spy, Help, Clear Screen

## 1. Ship — additive

Two new optional integer columns hold the autopilot destination. Both
are nullable; null = no autopilot target stored. The existing
`holdcourse Int @default(0)` field gains a documented secondary
semantic for player ships (boolean flag); AI semantics (countdown) are
preserved.

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `holdcourse` | `Int` | `0` | EXISTING. For player ships: `0` = inactive, `> 0` = autopilot active. For AI ships: per-tick countdown (unchanged from original). |
| `navTargetX` | `Int?` | `null` | NEW. Autopilot destination X sector coordinate. Range: `[-UNIVMAX, +UNIVMAX]` = `[-15, +15]`. |
| `navTargetY` | `Int?` | `null` | NEW. Autopilot destination Y sector coordinate. Range: `[-UNIVMAX, +UNIVMAX]`. |

**Invariant**: `holdcourse > 0` for a player ship implies both
`navTargetX !== null` and `navTargetY !== null`. The `nav` handler
always sets all three together; the physics-tick arrival branch and the
manual-cancel branch (`rot`/`imp`/`war`) always clear all three.

**Migration**: `prisma migrate dev --name nav_target_coords` — adds
`navTargetX Int?` and `navTargetY Int?` to `Ship`. No data
backfill needed (null = inactive).

**ShipState mirror** (in-memory `Map<shipKey, ShipState>`):

```ts
// added to ShipState in backend/src/game/ship/ship-state.types.ts
/** Autopilot target X sector. Null when autopilot inactive.
 *  @see GECMDS.C:5121 cmd_navigate (deviation: original was one-shot)
 *  @see specs/016-navigation-spy/research.md D1 */
navTargetX: number | null;

/** Autopilot target Y sector. Null when autopilot inactive. */
navTargetY: number | null;
```

The existing async DB-flush path picks these up automatically; the
mappers (`prismaShipToState` / `stateToPrismaUpdate`) gain two
field round-trips.

## 2. Planet — no schema change

The `spyowner String @default("")` field already exists on `Planet`
(`schema.prisma:247`). The `spy` handler writes the issuing player's
userid into it; the existing `PlanetState.spyowner` mapper already
round-trips the value. Empty string `""` continues to mean "no spy".

**Behavioural rules** (enforced by handler / scan-render):

- `spy` overwrites any prior `spyowner` (spec edge case: another
  player's spy is replaced).
- The original game's `GEPLANET.C:94` self-clear (planet owner becomes
  same as `spyowner` → clear) is **already** handled by existing planet
  ownership-change logic. No changes here.
- `scan pl <name>` reveals the per-item inventory block to the viewer
  iff `viewer.userid.toLowerCase() === planet.spyowner.toLowerCase() && spyowner !== ""`,
  in addition to the existing planet-owner case (D3).

## 3. HelpTopic — static reference data (no DB)

A frozen TypeScript record declared in
`backend/src/game/commands/help/help-topics.ts`:

```ts
export type HelpTopicId =
  | 'navigation'
  | 'combat'
  | 'trade'
  | 'planet'
  | 'ship';

export interface HelpTopic {
  readonly title: string;
  readonly body: ReadonlyArray<string>;
}

export const HELP_TOPICS: Readonly<Record<HelpTopicId, HelpTopic>>;
export const HELP_TOPIC_IDS: ReadonlyArray<HelpTopicId>;
```

Body is an array of plain lines that the handler joins with `\n`. Each
topic body lists the commands in that group and a short usage hint per
command. Authoring style mirrors the wiki tone where wiki coverage
exists.

## 4. Command Result — additive

The shared `CommandResult` type gains an optional `clearLog?: boolean`
field. When `true`, the frontend command-result handler invokes
`EventLog.clear()` after appending any `lines`. Existing call sites
ignore unknown keys; default `undefined` preserves existing behaviour.

```ts
// in backend/src/game/commands/command.types.ts
export interface CommandResult {
  lines: CommandLine[];
  /** When true, the frontend should clear the event log AFTER appending lines.
   *  Used exclusively by the `cls` command. @see specs/016-navigation-spy/research.md D4 */
  clearLog?: boolean;
}
```

## 5. Constants — additive

`backend/src/game/constants.ts`:

```ts
/** Universe half-extent — coordinates valid in [-UNIVMAX, +UNIVMAX].
 *  @see GEGLOBAL.H:134 univmax */
export const UNIVMAX = 15 as const;
```

`I_SPY = 13` is already declared in
`backend/src/game/constants/items.ts` and is reused as-is.

## Validation Rules

- `nav <x> <y>`: integer parse; reject if `x`/`y` non-integer or
  `Math.abs(x) > UNIVMAX || Math.abs(y) > UNIVMAX`.
- `spy`: `ship.where >= 10` (in orbit); planet `type !== PLTYPE_WORM`;
  planet not self-owned; not in neutral-zone (sector 0,0); cargo
  `items[I_SPY] > 0`.
- `hel <topic>`: topic must match a `HelpTopicId`; case-insensitive.
- `cls`: no arguments accepted (extra args silently ignored — matches
  the original; document in handler JSDoc).

## State Transitions

**Autopilot lifecycle** (per ship, player only):

```
inactive ──(nav x y in-bounds)──► active(target=x,y)
                                       │
   ┌───────────────────────────────────┤
   │                                   │
   ▼                                   ▼
(rot|imp|war)                  (physics tick: floor(coord) == target)
   │                                   │
   └─────────────►  inactive ◄─────────┘
                       │
                       └── (nav with new x,y) ──► active(target=x',y')
```

**Spy lifecycle** (per planet):

```
spyowner = "" ──(spy by user A in orbit)──► spyowner = "A"
spyowner = "A" ──(spy by user B in orbit)──► spyowner = "B"   (overwrite)
spyowner = "X" ──(planet ownership change to X)──► spyowner = "" (existing logic)
```
