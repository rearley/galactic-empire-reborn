# Living documentation — what each file is for, and its format

Scoped to `docs/`. These files are the handoff between Claude Code sessions and
the Claude Project used for planning. **Update them at the end of every implement
session.**

| File | Purpose | Update when |
|------|---------|-------------|
| `ARCHITECTURE.md` | Module map, responsibilities, data flow | Any structural change |
| `DECISIONS.md` | Why things are the way they are | Any architecture decision |
| `PROGRESS.md` | What's built, what's next, known issues | Every completed feature |
| `DATA_MODEL.md` | Entities, fields, relationships in plain English | Schema changes |
| `GAME_MECHANICS.md` | Implemented mechanics with C source references | Each mechanic lands |
| `DEPLOYMENT.md` | How production is actually put together | Any deploy-shape change |
| `audits/` | Point-in-time review findings, with a status banner | A review runs, or a finding closes |
| `concepts/` | Design explorations that do not ship: mock-ups, with a README of what each settled | A concept is explored or superseded |

## Where open work is tracked

Three places, and nowhere else. Anything else you find that reads like an open
item is stale and should be corrected in place:

1. The newest entries at the bottom of `PROGRESS.md` — each session's
   `**Known issues:**`, plus the named `## Backlog — …` sections.
2. `audits/` — security and canon-gap findings, each with a status.
3. `DECISIONS.md` — deviations from canon, each with its reason.

## The rule that keeps these honest

**A doc that says work is outstanding when it is already done is worse than no
doc**, because it sends the next session to re-do finished work, and it hides the
items that really are open among ones that are not. When you close something,
close its note in the same commit.

Equally: **do not delete a note just because the work is done.** Keep won't-fix
decisions, deliberate deviations, and research that was expensive to produce.
Rewrite the note to say what was decided and why, rather than dropping it. The
2026-09-09 sweep kept every rejected design and every removed feature for exactly
this reason.

## PROGRESS.md is append-only

Newest at the bottom. Entries are dated and are a historical record: **do not
edit a past entry to make it current.** It was true when written. If it is now
wrong, append a new entry that says so.

The `<!-- INDEX -->` block at the top lists the latest entries in reverse, and
must be updated when you append. Forward-looking sections inside the file — a
roadmap, a backlog — are not history and may be edited in place.

## Formats

### ARCHITECTURE.md

Plain text module map. No diagrams needed.

```
GameGateway (gateway/)
  └── receives player commands via Socket.io
  └── routes to CommandRouterService
  └── broadcasts tick events to sector rooms

ShipStateService (game/ship/)
  └── owns in-memory Map<shipId, ShipState>
  └── flushes to Postgres async every 30s or on significant state change
  └── source of truth for all active ship state
```

### DECISIONS.md

```
## [date] — Decision title
**Context:** why this came up
**Decision:** what was decided
**Reason:** why
**Alternatives rejected:** what else was considered and why not
```

### PROGRESS.md

```
## [date] — feature name
**Completed:** what was built
**Tests:** what is covered and at what level
**Decisions made:** any deviations from plan
**Next:** what comes next
**Known issues:** anything deferred
```

## When a deviation lands here, ask whether a player meets it

If they do, it also belongs in `GUIDE_DEVIATIONS` in
`backend/src/public/guide.ts`, on the page they would be reading when it bites.
See that directory's `CLAUDE.md`.
