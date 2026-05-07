# Contract — `hel` / `?` command

**Source**: `GECMDS.C` command table entry for `hel` (cmd_help) — wiki for tone.
**Handler**: `backend/src/game/commands/handlers/help.handler.ts` (new)
**Keywords**: `hel`, `?`  ·  **Aliases**: bound under both keywords via `register(cmd)` twice (or via `aliases: ['?']` on the canonical entry).  ·  **MinArgs**: `0`

## Forms

### `hel` (no argument)

Emit a topic catalog as multiple `info` lines:

```
Available help topics:
  hel navigation   — movement, scan, autopilot
  hel combat       — phasers, torpedoes, missiles, mines, decoys
  hel trade        — buy, sell, transfer, jettison, prices
  hel planet       — orbit, land, attack, spy, planet management
  hel ship         — shields, energy, repair, set, destruct, abandon
```

### `hel <topic>`

| Condition | Output |
|---|---|
| `topic.toLowerCase()` matches a known `HelpTopicId` | Emit the topic body lines (typed `info` category). First line is the topic title; remaining lines list commands/usage. |
| topic unknown | `HEL_UNKNOWN`: `"Unknown help topic '{topic}'. Valid topics: navigation, combat, trade, planet, ship."` |

### `?` (alias)

Identical behaviour to `hel` for both forms. Implementation: register
the same `Command` under both keywords.

## Topic body content (authoritative)

Lives in `backend/src/game/commands/help/help-topics.ts`. Each body is
a `ReadonlyArray<string>` of plain lines. Tone matches the wiki where
wiki coverage exists; otherwise, terse usage hints.

Approximate content per topic (commands listed; final wording TBD in
implementation, locked by snapshot test):

- **navigation**: `nav`, `rot`, `imp`, `war`, `sca`, `lock`, `orbit`, `land`.
- **combat**: `pha`, `tor`, `mis`, `mine`, `dec`, `jam`, `flux`, `shi`, `freq`, `attack`.
- **trade**: `buy`, `sell`, `transfer`, `jett`, `price`, `pln`.
- **planet**: `orb`, `land`, `attack`, `spy`, `admin`, `withdraw`, `dat`.
- **ship**: `rep`, `cloak`, `maint`, `set`, `rename`, `destruct`, `abort`, `abandon`.

## Messages added

| ID | Template |
|---|---|
| `HELFMT` | `Available help topics: navigation, combat, trade, planet, ship. Try 'hel <topic>'.` |
| `HEL_UNKNOWN` | `Unknown help topic '{0}'. Valid topics: navigation, combat, trade, planet, ship.` |

(The full per-topic line list is rendered directly from the
`HELP_TOPICS` record; only the catalog header and unknown-topic
fallback need MessageId entries.)

## Test coverage required

- `help.handler.spec.ts`:
  - no-arg form lists all five topic IDs.
  - each topic ID returns its body, first line is the title.
  - unknown topic returns `HEL_UNKNOWN` with the offending input echoed.
  - `?` registered with identical handler behaviour for both forms (parametrised across both keywords).
  - case-insensitive topic match (`HEL Navigation`, `? NAVIGATION`).
- Snapshot test pinning the exact line content per topic so future edits to wording are deliberate.
