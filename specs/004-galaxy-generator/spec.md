# Feature Specification: Galaxy Generator

**Feature Branch**: `004-galaxy-generator`
**Created**: 2026-05-01
**Status**: Draft
**Input**: User description: "004-galaxy-generator — procedural 30×15 galaxy with sectors, planets, wormholes generated on first boot, deterministic from a configurable seed, persistent across restarts; wires deferred scan-pl and scan-lo planet/wormhole projection from feature 003"

## Clarifications

### Session 2026-05-01

- Q: Planet naming policy — should every generated planet have a unique name, or only the canonical neutral-zone planets (faithful to `GEPLANET.C:592` which leaves non-origin planet names empty until colonization)? → A: B — only neutral-zone (origin sector) planets are named at generation; all other planets are nameless until a player colonizes them in feature 005. `scan pl <name>` resolves only the named neutral-zone planets.
- Q: Origin-sector (neutral-zone) composition — the original `s00[]` table from `.MSG` config is not recoverable from source. How do we author the neutral-zone planet/wormhole table? → A: A — author 5 canonical neutral-zone entries as a TypeScript constant in code (an `s00` fixture), with `Zygor-3` at `plnum=1` (per `GECMDS.C:4127, 4558` references) and 4 more authored entries (total = 5, within the original `S00PLNUM` legal range of 3..9). Treated as a fidelity/balance fixture reviewed via PR, not an operator tunable. Documented deviation: original loaded these from `.MSG`; we author them in code.
- Q: Generator tunable defaults — `plodds`, `wormodds`, `maxplanets` defaults are not recoverable from source (lived in the missing `.MSG`). What are our defaults and how are they configured? → A: D — all three are env-configurable with documented defaults `plodds=4`, `wormodds=10`, `maxplanets=5` (within source legal bounds 1..20, 1..100, 1..9 respectively). Expected counts at default values: roughly 180–230 planets and 18–28 wormholes across the 449 non-origin sectors. Balance regression test pins the ranges `[100..300]` planets and `[10..40]` wormholes at the default seed and default tunables.
- Q: Wormhole destination scope — `GEPLANET.C:642-643` picks destinations anywhere in `[-univmax..+univmax]`, but our world is a bounded 30×15 grid where out-of-grid sectors don't exist. Faithful or constrained? → A: A — wormhole destinations MUST be sector coordinates inside the 30×15 grid (`0..MAXX-1 × 0..MAXY-1`). Documented deviation from `GEPLANET.C:642-643`: the original's larger universe was an artifact of the BBS port's explorable space; our bounded world treats out-of-grid destinations as a generator bug. Wormhole self-destinations (origin == destination) are also rejected.
- Q: Idempotency check & atomic generation — how does the generator decide on boot whether the galaxy already exists, and how is partial-generation crash recovery handled? → A: A — introduce a `GalaxyMeta` table (single row) carrying `seed`, `plodds`, `wormodds`, `maxplanets`, and `generated_at`. The generator wraps the entire 30×15 sector creation, all planet inserts, all wormhole inserts, and the `GalaxyMeta` row insert in a single Postgres transaction. Boot logic: if a `GalaxyMeta` row exists → skip generation entirely; else → run the full transaction. A crashed boot mid-generation rolls back automatically and leaves no meta row, so the next boot retries from scratch. The meta row is also the authoritative record of which seed and tunables produced the live world.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The world exists and is the same world after a restart (Priority: P1)

The first time the server boots against a fresh database, it generates a complete 30×15 sector galaxy populated with planets and wormholes, derived from a configured seed. Subsequent boots — whether moments later or after a deployment — reuse that same galaxy without overwriting it. Two operators starting fresh databases with the same seed produce byte-identical galaxies.

**Why this priority**: The galaxy is the physical substrate for every other gameplay feature. Combat, planet trading, AI ships, and movement all assume sectors, planets, and wormholes already exist. Without a generated and persistent world, no feature past 003 has anything to act on.

**Independent Test**: Boot the server against an empty database with a known seed, observe the populated galaxy in storage; restart the server and confirm the galaxy is unchanged; drop the database, boot again with the same seed, and confirm the resulting galaxy is identical to the first run.

**Acceptance Scenarios**:

1. **Given** a fresh empty database and a configured seed, **When** the server starts, **Then** all 450 sectors of the 30×15 grid exist in persistent storage, each populated with the planets and wormholes assigned to it by the generator.
2. **Given** a database that already contains a generated galaxy, **When** the server is restarted, **Then** the sector, planet, and wormhole records are unchanged — no rows are added, removed, or rewritten.
3. **Given** two empty databases configured with the same seed, **When** each server boots independently, **Then** both galaxies contain the same number of planets and wormholes in the same coordinates with the same names, types, and destinations.
4. **Given** two empty databases configured with different seeds, **When** each server boots independently, **Then** the resulting galaxies differ in planet/wormhole placement.

---

### User Story 2 - Players can see planets and wormholes when they look around (Priority: P1)

A connected player who runs `scan lo` from inside a sector that contains a planet, a wormhole, or both sees those objects rendered on the tactical grid using the original game's character codes alongside any ships present. A player who runs `scan pl <name>` for a known planet receives a status read-out for that planet — the deferred command stub from feature 003 now returns real data.

**Why this priority**: Feature 003 shipped `scan lo` and `scan pl` as ship-only/stub implementations with explicit `TODO(004)` markers because there was nothing else in the world to draw or query. The galaxy generator's first observable side effect for players is that those commands begin returning planet and wormhole data. Without this surface, the generator has no visible product.

**Independent Test**: With a generated galaxy in place, place a test player in a sector chosen to contain a known planet and a known wormhole; issue `scan lo` and confirm the grid payload includes one cell per object at the expected coordinates with the correct character code; issue `scan pl <name>` for the planet and confirm a populated status response (not the deferred stub) is returned.

**Acceptance Scenarios**:

1. **Given** a player in a sector that contains one planet, **When** they type `scan lo`, **Then** the resulting grid payload includes a planet cell at the planet's coordinates with the original game's planet character.
2. **Given** a player in a sector that contains one wormhole, **When** they type `scan lo`, **Then** the resulting grid payload includes a wormhole cell at the wormhole's coordinates with the original game's wormhole character.
3. **Given** a player in a sector that contains both another ship and a planet, **When** they type `scan lo`, **Then** the resulting grid payload contains entries for both, plus the player's own self-cell.
4. **Given** a generated galaxy that contains the canonical neutral-zone planet `Zygor-3` (the original game's `plnum==1` neutral-zone planet referenced in `GECMDS.C:4127, 4558`), **When** any player types `scan pl Zygor-3`, **Then** the response describes that planet's location, type, environment, resources, and ownership state — not the deferred stub line from feature 003.
5. **Given** a generated galaxy, **When** any player types `scan pl NOTAPLANET` for a name that does not exist, **Then** the response is the original game's "no such planet" line.

---

### User Story 3 - Operators can reseed an empty world without code changes (Priority: P2)

An operator deploying the server can override the seed via configuration to produce a different but still deterministic galaxy on the next fresh boot. Operators do not need to change source code or migrations to do this. The configured seed is recorded somewhere observable so that operators can confirm which seed produced the live world.

**Why this priority**: A configurable seed is a small but important escape hatch — production may want a different world than dev, and developers may want to scratch and re-run without committing seed changes. Not P1 because the default seed already works; deferring would not block any other feature.

**Independent Test**: Set the seed configuration to value A, boot against an empty database, capture the resulting planet count and a sample of planet coordinates; drop the database, set the seed to value B, boot, and confirm the resulting galaxy differs from the first run while still being internally consistent (idempotent on subsequent restarts under seed B).

**Acceptance Scenarios**:

1. **Given** an empty database and seed value A configured, **When** the server boots, **Then** the resulting galaxy is deterministic for seed A.
2. **Given** an empty database and seed value B configured, **When** the server boots, **Then** the resulting galaxy is deterministic for seed B and observably different from the seed-A galaxy.
3. **Given** no seed is explicitly configured, **When** the server boots against an empty database, **Then** generation proceeds using a documented default seed and the resulting galaxy is reproducible across machines.

---

### Edge Cases

- A boot that begins generation but is interrupted before completion must not leave the galaxy half-populated such that the next boot incorrectly believes the world is fully generated and skips it. (Resolved by the single-transaction wrap in FR-012: a crash before the `GalaxyMeta` insert rolls back all sector/planet/wormhole writes.)
- A generated planet name must be unique within the named (neutral-zone) set so that `scan pl <name>` can resolve unambiguously; non-origin planets are nameless and not addressable by `scan pl` until colonized.
- A sector may legitimately contain multiple planets; the rendering of `scan lo` must handle that without collision in the cell payload.
- A wormhole's destination must be a coordinate within the 30×15 grid bounds, not an arbitrary value.
- The generator must respect the original game's "no Cybertrons in the neutral zone" expectation for the origin sector by not placing hostile-feeling planets there if the original logic excluded such placement; placement rules must be documented based on the C source.
- A configured seed that yields zero planets or zero wormholes is treated as a generator bug, not a valid world.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate the full 30×15 sector grid (450 sectors) on first boot when the persistent store contains no sector records.
- **FR-002**: System MUST detect a populated galaxy on subsequent boots by checking for the presence of a `GalaxyMeta` row, and skip generation entirely when one exists — no sector, planet, or wormhole records may be inserted, updated, or deleted as a side effect of the generation step on any non-first boot.
- **FR-003**: System MUST place planets across the galaxy procedurally, allowing more than one planet per sector, with each planet identified within its sector by a discriminator consistent with the original game's planet-number field.
- **FR-004**: System MUST place wormholes with both an origin coordinate and a destination coordinate, with both endpoints inside the 30×15 grid (`xsect ∈ 0..MAXX-1`, `ysect ∈ 0..MAXY-1`). Origin and destination MUST refer to different sectors — a wormhole that loops to itself is a generator bug.
- **FR-005**: System MUST drive all randomized placement decisions from a single seedable random source, such that re-running generation against an empty store with the same seed produces an identical galaxy.
- **FR-006**: System MUST accept the seed via runtime configuration (with a documented default seed used when none is set) so operators can change it without modifying source code or migrations.
- **FR-006a**: System MUST accept the three generator tunables — `plodds`, `wormodds`, `maxplanets` — via runtime configuration with documented defaults (`plodds=4`, `wormodds=10`, `maxplanets=5`). Provided values MUST be validated against the source's legal `numopt` bounds (`plodds` 1..20, `wormodds` 1..100, `maxplanets` 1..9); out-of-range values fail boot with a clear error rather than silently clamping.
- **FR-007**: System MUST preserve every field shape and constant from the original game's sector, planet, and wormhole structures referenced in `GEMAIN.H` — including sector types, planet types, environment, resources, and wormhole visibility — populated with values consistent with the original game's generation logic.
- **FR-007a**: System MUST populate the origin sector (the neutral zone, `(0,0)`) deterministically from a fixed canonical table of 5 entries (the `s00` fixture), with `Zygor-3` at `plnum=1`. This table is authored in source as a fidelity fixture (the original game loaded an equivalent table from a `.MSG` config file that is not recoverable from `reference/ge-source/`). The origin-sector planets bypass the random `plodds`/`maxplanets` machinery used for non-origin sectors.
- **FR-008**: System MUST assign each neutral-zone (origin-sector) planet a unique, canonical name from a curated table at generation. All non-origin planets MUST be created with an empty name field — names for those are assigned only when a player colonizes them in a later feature. Uniqueness is required across the named neutral-zone set; non-origin nameless planets do not participate in name uniqueness.
- **FR-009**: System MUST expose the generated galaxy through a service interface that other features (scan, future combat, future planet system, AI ships) can read without each re-querying the persistent store directly for read-only lookups.
- **FR-010**: System MUST replace the `scan pl <name>` deferred stub from feature 003 with a real lookup against the named-planet set (the neutral-zone planets at generation, plus any colonized planets that exist by the time the command runs). Returns either the planet's status (location, type, environment, resources, ownership) or the original game's "no such planet" line. Nameless non-origin planets are unaddressable by name and that is the intended behavior.
- **FR-011**: System MUST replace the planet-and-wormhole projection deferred markers in `scan lo` from feature 003 such that the grid payload includes one cell per planet and one cell per wormhole present in the player's current sector, using the original game's character codes.
- **FR-012**: System MUST run generation atomically inside a single Postgres transaction that wraps every sector insert, every planet insert, every wormhole insert, and the `GalaxyMeta` row insert, so that a crash mid-generation rolls back to an empty galaxy and the next boot retries cleanly. The `GalaxyMeta` row is the last write; its presence is the sole signal that generation completed successfully.
- **FR-013**: System MUST log a single line on every boot summarizing whether generation ran and, if so, the seed used, the three tunable values in effect (`plodds`, `wormodds`, `maxplanets`), and the resulting planet and wormhole counts.
- **FR-013a**: On the idempotent boot path, if the env-loaded config disagrees with the persisted `GalaxyMeta` on any of `seed`/`plodds`/`wormodds`/`maxplanets`, the system MUST emit a single WARN log line naming each mismatched field with both values; persisted values remain authoritative.

### Key Entities *(include if feature involves data)*

- **Sector**: One cell of the 30×15 grid, identified by its `(x, y)` coordinates, carrying a sector type from the original game's enumeration. The 450-sector grid is created exhaustively — every coordinate in `0..MAXX-1 × 0..MAXY-1` exists as a row.
- **Planet**: A single planet identified by its sector coordinates and a per-sector planet-number discriminator, carrying a globally unique name, a planet type, an environment factor, a resource factor, and ownership/economic fields populated with the original game's defaults for an unowned planet. Multiple planets per sector are valid.
- **Wormhole**: A pair of coordinates — origin and destination — each within the grid, plus a visibility flag and a name, faithful to the original game's wormhole structure. Both endpoints are records in the persistent store.
- **Galaxy**: The collective set of all sector, planet, and wormhole records. Treated as a singleton — there is only ever one galaxy in a given database.
- **GalaxyMeta**: A single-row table recording the seed and tunable values (`plodds`, `wormodds`, `maxplanets`) actually used at generation time, plus the `generated_at` timestamp. Its presence is the boot-time signal that the galaxy is fully generated; its absence triggers regeneration. Authoritative provenance for the live world.
- **Generator Seed**: A configuration value used to derive every random decision the generator makes. Recorded in `GalaxyMeta` and in the boot log so the operator can correlate the live world with its seed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh-database boot at the default seed and default tunables (`plodds=4`, `wormodds=10`, `maxplanets=5`) produces all 450 sectors, a planet count in the range `[100..300]`, and a wormhole count in the range `[10..40]`, with one log line summarizing the result.
- **SC-002**: Re-booting the server against the just-generated database results in zero writes to the sector, planet, or wormhole stores — verified by a record count equality check before and after the second boot.
- **SC-003**: Two clean databases generated with the same configured seed produce the same planet count, the same wormhole count, the same set of planet coordinates and names, and the same set of wormhole origin/destination pairs.
- **SC-004**: A player in a sector chosen to contain a planet and a wormhole receives a `scan lo` grid payload that includes a planet cell and a wormhole cell at their generated coordinates, in addition to any ships and the self-cell.
- **SC-005**: A player who issues `scan pl <name>` for any name produced by the generator receives a populated status response; the same command for an unknown name returns the original game's "no such planet" line; neither path returns the feature-003 deferred stub.
- **SC-006**: Changing the seed configuration value and booting against a fresh database produces a galaxy whose planet coordinate set is not equal to the default-seed galaxy.

## Assumptions

- The 003 ShipStateService and CommandRouter wire-up that landed in feature 003 remains the entry point for `scan lo` and `scan pl`; this feature only fills in the deferred branches, it does not redesign the command surface.
- Planet ownership state at generation time is "unowned, default economic values" — colonization, taxation, and trade are out of scope for 004 and land in feature 005.
- The neutral zone rule from the original game (no AI hostility at origin) is respected by the generator only insofar as it places planets; AI placement and behavior are out of scope and land in features 007 and 008.
- The generator runs synchronously during application startup, blocking module initialization until complete. The galaxy is small enough (450 sectors, dozens of planets, a small number of wormholes) that this is acceptable on every boot and does not need a background job.
- Sector types beyond `SECTYPE_NORMAL=1` are populated only as the original game's generator would populate them; no new sector types are introduced by this feature.
- The default seed is a documented constant chosen for reproducibility, not a wall-clock value; operators who want a non-default world set the seed configuration.
- Persistent storage uses the schema introduced in feature 001 (Prisma) — sector, planet, and wormhole tables already exist with fields shaped to match `GEMAIN.H`. The `GalaxyMeta` table is new in this feature and is added via a new migration; prior migrations are not edited. If other schema gaps are discovered during planning, they are addressed by additional new migrations in this feature.
