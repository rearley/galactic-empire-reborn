# Command Contracts: Social and Information

**Feature**: 012-social-commands

Each command is registered with `CommandRouterService` (feature 003) under the keyword
listed below. Aliases are noted where the original `GECMDS.C` command table defines
short forms.

All commands return a `CommandResult` (see `command.types.ts`). The
`broadcasts` field is non-empty only for `sen` and `tea`.

---

## `who`

- **Keyword**: `who`
- **Aliases**: (none — original GECMDS.C:5169 lists `"who"` only with `argMissingMessage` flag 1)
- **minArgs**: 0
- **Source**: `cmd_who` GECMDS.C:5162 (reinterpreted; see `research.md` D1)

### Grammar

```
who
```

### Result

`lines[]`, one row per active non-cloaked ship, sorted by `shipname` ascending
case-insensitive. Plus a header line.

```
text                                                     | category
"  Shipname               Class                Sector  Kills"  | system
" {shipname:22s} {classname:20s} ({xs:>2},{ys:>2})  {kills:>5d}" | info  (per ship)
```

`scanGrid`: omitted. `broadcasts`: omitted.

---

## `dat`

- **Keyword**: `dat`
- **Aliases**: (none in GECMDS.C:134 entry)
- **minArgs**: 1
- **Source**: `cmd_data` GECMDS.C:5829 (reinterpreted; see `research.md` D1)
- **argMissingMessage**: `"Usage: dat <ship-name-fragment>"`

### Grammar

```
dat <name-fragment>
```

`<name-fragment>` is matched case-insensitively as a substring against
`ShipState.shipname` for every connected non-cloaked ship.

### Result

If no match: one `system` line `"Ship not found."`.

If match: a multi-line stat block (`info` category):

```
"Ship: {shipname} (#{shipno})"
"Class: {classname}    Team: {teamname|'—'}"
"Sector: ({xs},{ys})    Heading: {heading}    Speed: {speed}"
"Energy: {energy}    Damage: {damage}    Kills: {kills}    Score: {score}"
"Cargo:"
"  Men:    {items[0]}    Missiles: {items[1]}    Torpedos: {items[2]}"
"  Ions:   {items[3]}    FluxPods: {items[4]}    Food:     {items[5]}"
"  Fghtrs: {items[6]}    Decoys:   {items[7]}    Troops:   {items[8]}"
"  Zips:   {items[9]}    Jammers:  {items[10]}   Mines:    {items[11]}"
"  Gold:   {items[12]}   Spy:      {items[13]}"
```

(All 14 `items[]` slots rendered per FR-006.)

`broadcasts`: omitted.

---

## `ros`

- **Keyword**: `ros`
- **Aliases**: (none; GECMDS.C:156 lists `"ros"` with flag 1)
- **minArgs**: 0
- **Source**: `cmd_geroster` (region around GECMDS.C:5276)
- **argMissingMessage**: n/a (minArgs=0)

### Grammar

```
ros [all]
```

`all` (case-insensitive) raises the cap to 200; otherwise cap is `ROSTER_MAX` (default 20).

### Result

`lines[]`, one header + one row per eligible user, sorted by `score DESC, kills DESC,
userid ASC`:

```
"  Rank  UserID                Score      Kills  Planets  Population"  (system)
" {rank:>4d}  {userid:20s} {score:>10}  {kills:>5d}  {planets:>5d}  {population:>10}"  (info per row)
```

AI userids (`Cybrg-*`, `@Droid-*`) are excluded server-side via SQL filter.

`broadcasts`: omitted.

---

## `sen`

- **Keyword**: `sen`
- **Aliases**: (none in GECMDS.C:160 entry)
- **minArgs**: 2
- **Source**: `cmd_send` GECMDS.C:1825
- **argMissingMessage**: `"Usage: sen <A|B|C> <message>"`

### Grammar

```
sen <A|B|C> <message…>
```

`<message>` is the joined remainder of the input after the channel token. Maximum
200 characters; over-length messages are rejected with the usage error and not
broadcast (FR-016a).

### Result

On success: one `system` confirmation line to the sender (e.g.
`"Message sent on channel A."`).

`broadcasts[]`:

```ts
[
  {
    room: <see below>,
    event: 'message.send',
    payload: { from: ship.shipname, channel: 'A'|'B'|'C', text: string },
  },
]
```

`room` selection:

| Sender's `freq[ch]` | Room                                |
|---------------------|-------------------------------------|
| 0 (hail or unset)   | special: `hail` (gateway broadcasts to all sockets, filtering cloaked ships) |
| 1 – 19 999          | `sector:{xsect}:{ysect}`            |
| ≥ 20 000            | special: `galaxy` (gateway broadcasts to all sockets) |

The gateway recognises the special `hail` and `galaxy` rooms and replaces them with
`server.emit(...)` (galaxy) or `server.emit(...)` with cloak filtering applied per
recipient (hail). For sector rooms, the gateway calls
`server.to(`sector:${x}:${y}`).emit(...)`.

The sender does not receive their own `message.send` event — the confirmation line
in `lines[]` serves that purpose.

---

## `fre`

- **Keyword**: `fre`
- **Aliases**: (none in GECMDS.C:138 entry)
- **minArgs**: 2
- **Source**: `cmd_freq` GECMDS.C:1885
- **argMissingMessage**: `"Usage: fre <A|B|C> <number|hail>"`

### Grammar

```
fre <A|B|C> <number|hail>
```

- `hail` (case-insensitive) → freq = 0
- positive integer 1–19 999 → sector-scoped
- positive integer ≥ 20 000 → galaxy-wide
- `0` (literal numeric) → rejected (FR-019)
- negative or non-integer → rejected (FR-020)

### Result

On success, one `success` line:

| Scope     | Confirmation                                              |
|-----------|-----------------------------------------------------------|
| hail      | `"Channel {ch} set to hail."`                             |
| sector    | `"Channel {ch} set to {freq} (sector-scoped)."`           |
| galaxy    | `"Channel {ch} set to {freq} (galaxy-wide)."`             |

On error, one `system` line:
`"Usage: fre <A|B|C> <number|hail>"` — covers bad channel, freq=0, negative, non-integer.

Mutates `ship.freq[channelIndex]` and sets `ship.dirty = true`. Persistence flows
through the existing flush cycle (FR-021).

`broadcasts`: omitted.

---

## `tea`

- **Keyword**: `tea`
- **Aliases**: (none in GECMDS.C:165 entry)
- **minArgs**: 0
- **Source**: `cmd_team` GECMDS.C:5277 (subset; see `research.md` D2)

### Grammar

```
tea                       # show current affiliation
tea <team-name>           # join (exact case-insensitive name match)
tea leave                 # clear affiliation
```

### Result

| Input        | Result `lines`                                                   |
|--------------|------------------------------------------------------------------|
| `tea` (no team)   | one `info` line `"You are not on a team."`                  |
| `tea` (on team)   | one `info` line `"You are on team {teamname}."`             |
| `tea leave`       | one `success` line `"You have left your team."`             |
| `tea <name>` (match)    | one `success` line `"You have joined team {teamname}."` |
| `tea <name>` (no match) | one `system` line `"No such team: {name}"` (no state change, FR-027) |

On a successful join or leave (FR-026), `broadcasts[]` includes a single entry
matching the existing sentinel pattern used by `rename.handler.ts`:

```ts
[
  {
    room: '__player_snapshot__',
    event: 'player.snapshot',
    payload: {},
  },
]
```

The gateway's existing `processBroadcasts()` loop in `game.gateway.ts`
recognises `event === 'player.snapshot'` and resolves it to a global
`server.emit('player.snapshot', { players: registry.list() })` —
the `room` field is ignored on this branch. No new gateway code is required
for `tea`; per-socket targeting is unnecessary because the snapshot is
idempotent for non-affected clients.

Persistence: `User.teamcode` is updated synchronously via Prisma in the handler;
`ShipState.teamcode` is updated in-memory and `dirty = true` is set so subsequent
`Ship` flushes are unaffected (no `Ship.teamcode` column exists; see
`research.md` D6).

---

## Cross-cutting

- All six commands are registered in `commands.module.ts:onModuleInit()`.
- All six commands respect the unknown-keyword and insufficient-args branches of
  `CommandRouterService.dispatch()` exactly as feature 003 implemented them
  (FR-029, FR-030).
