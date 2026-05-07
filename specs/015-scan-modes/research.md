# Research — Scan Modes & Display Options

This document records the design decisions made before implementation. All NEEDS CLARIFICATION items from the spec's Clarifications section have already been resolved by the user; this file captures the *implementation-side* decisions that follow.

## D1 — `sca lo` plot characters: migrate to scantab letters

**Decision**: `sca lo` (and `sca lo full`) will plot detected ships using the same scantab letter table as `sca ra` and `sca se`, **not** the original `+`/`=` glyphs.

**Rationale**:
- The original C `scan_lo` (`GECMDS.C:2640`) does not call `update_scantab`; it plots `+` for AI ships and `=` for human ships, with no per-ship identification.
- FR-012 mandates a *shared* scan table across `sca ra`, `sca se`, and `sca lo`. Without letters, "shared" has no observable meaning.
- The user explicitly ratified this deviation in Clarification Q3 of the spec.
- The colour channel still encodes `human-player` vs. `AI`, so the AI-vs-player distinction is preserved without overloading the glyph.

**Alternatives considered**:
- *Keep `+`/`=` to honour the original* — rejected: makes `sca lo full`'s side panel ambiguous (which `=` is which?), and contradicts FR-012.
- *Use letters on `sca lo full` but keep `+`/`=` on bare `sca lo`* — rejected: forks behaviour for no reader benefit.

**Migration impact**: The existing 003/004 `sca lo` fixtures (`scan-handler.spec.ts` and any `sca`-tagged integration test) plot `+` / `=` characters. These will be updated as part of this feature's tests, not deferred. SC-007's "no regression" applies to behavioural intent (range, sector header, fail-on-invalid-state), not glyph literals.

## D2 — Widen NOSCANTAB from 15 to 26

**Decision**: The per-player scantab capacity is 26 entries, not the original 15.

**Rationale**:
- `GEMAIN.H:621` defines `NOSCANTAB 15` — a 1980s memory tradeoff (15 SHIPTAB structs × ~24 bytes × per-user array footprint mattered then).
- The alphabet is 26 letters. Capping the table at 15 means the user-visible promise of "letters A..Z" is hollow — the player only ever sees A..O.
- We have no equivalent memory constraint. Widening the table to 26 is a free win.
- The Edge Case "More than 26 detected ships → only 26 nearest receive letters" matches the alphabet bound, not the original 15-cap; this matches user expectation.

**Alternatives considered**:
- *Stay at 15* — rejected: contradicts the spec's edge-case wording.
- *Use a configurable cap* — rejected: YAGNI.

## D3 — SCANHOME via `scan:render` socket event, not ANSI

**Decision**: When the player has SCANHOME on, the gateway emits `scan:render` with `mode: "overwrite"`; when off, `mode: "append"`. No ANSI bytes are ever sent.

**Rationale**:
- The original `ansifunc(HOMEY)` (`GECMDS.C:2512`) writes `ESC[H` to the terminal, repositioning the cursor. The web client has no terminal — it has React state.
- Sending raw ANSI through a JSON channel and asking the browser to interpret it is brittle and out of contract with how every other gateway event is structured.
- A typed event with a `mode` discriminator is testable, readable, and lets the React frontend pick its own rendering strategy (replace a single panel vs. append a scrollable card).
- User explicitly ratified this approach in Clarification Q6.

**Alternatives considered**:
- *Embed ANSI in the existing `command:result` text* — rejected: breaks frontend's structured rendering model.
- *Two events: `scan:replace` and `scan:append`* — rejected: duplicates payload schema; a single discriminated event is simpler.

## D4 — Player options storage: reuse existing `User.options Int[]`

**Decision**: Persist `SCANNAMES` and `SCANHOME` in the existing `User.options Int[]` Prisma field. Indexes 0 and 1, exactly as `GEMAIN.H:233-234` defines.

**Rationale**:
- `User.options` already exists in the schema (`backend/prisma/schema.prisma:50`) — the field was reserved for this exact purpose during 001-prisma-schema.
- No migration is needed; only seed-default behaviour (initialise the array length).
- Index assignments match the C source byte-for-byte (`SCANNAMES=0`, `SCANHOME=1`, `SCANFULL=2`, `MSG_FILTER=3`), preserving fidelity.
- The hot read path (every scan command) caches the two flags onto the in-memory `ShipState`, refreshed on login and on `set`. The DB is read once per session, not per scan.

**Alternatives considered**:
- *Add boolean columns `User.scanNames` and `User.scanHome`* — rejected: would also require a migration and split the option model from the canonical `options[]` array, drifting from the C source.
- *Fold into `ShipState.autoShield`/`autoRepair` style of per-ship flags* — rejected: SCANNAMES/SCANHOME are user-level preferences (not ship-level); the original stores them in `WARUSR.options`, not `WARSHP`.

**Schema impact**: None. `User.options` is `Int[]` and is already initialised on user creation. We document the index assignments in `data-model.md`.

## D5 — Scantab lifecycle (init / clear)

**Decision**:
- **Initialise lazily** on the first scan command after the player enters flight. Until that first call, the scantab is empty (no letters to leak).
- **Clear on**: (a) socket disconnect, (b) ship destruction (death), (c) dock-back-to-base.
- **Key by `userid+shipno`**, not by an ephemeral slot index. This prevents a new occupant of the same slot from inheriting letters.

**Rationale**:
- User explicitly ratified this in Clarification Q7.
- Matches the *effective* behaviour of the C source (the C array is keyed by `usrnum`, which the BBS recycled when a user logged out — the cleared `tmp.ship[i].flag = 0` already prevents leakage). Our keying is just more explicit.
- Lazy init avoids running `update_scantab` for players who never type a scan command before logging out.

**Storage**: A `Map<string, ScantabEntry[]>` on `ScanHandlerService` (singleton scope), keyed by `${userid}#${shipno}`. Cleared via gateway disconnect handler and via `ShipStateService.destroy()` callback hooks already wired up by 008-droid-ai and 014-planet-attack.

## D6 — Colour-channel encoding: semantic enum, not mapc digits

**Decision**: `ScanCell.colour` is one of `'self' | 'human' | 'ai' | 'planet'`, with mines and empty cells having no colour entry.

**Rationale**:
- The original C uses `mapc[y][x] = '1'` for AI and `'2'` for everything-else, encoded inline as ANSI escapes by `printmap` (`GECMDS.C:2997-3009`).
- The web frontend already drives Tailwind classes from a typed enum. Sending `'1'`/`'2'` and asking the React layer to translate would create a new translation step for no win.
- The 4-category set on `sca se` (per Clarification Q1) and 3-category set on `sca ra` (per Clarification Q2) map cleanly to this enum.

**Alternatives considered**:
- *Keep `'1'`/`'2'` mapc digits* — rejected: forces the frontend to memorise the mapping.
- *Use a numeric enum* — rejected: string enum is self-documenting in network captures.

## D7 — `sca lo full` side-panel formatting

**Decision**: Each row in the side panel uses the original `scan_sh` field formats:
- Distance: integer parsecs (no decimal).
- Bearing, heading: integer degrees, range 0–359.
- Speed: rendered through the existing `showarp()` formatter (already shipped in 003 as part of `sca sh`) — produces `Warp 4.5` / `Impulse` / `Stopped`.

**Rationale**:
- User ratified in Clarification Q4.
- Reuses the formatter shipped in 003, so existing `sca sh` fixtures stay valid and we don't need a parallel formatter.
- Matches the column layout of `printmapfull` (`GECMDS.C:3019-3082`).

**Alternatives considered**:
- *Decimal distances* — rejected: the original `scan_sh` is integer, and consistency across `sca sh` and `sca lo full` is a usability win.
- *Custom speed formatter* — rejected: duplicates `showarp`.

## Open questions resolved during planning

None. All seven Q items in the spec's Clarifications session were closed by the user before planning began.
