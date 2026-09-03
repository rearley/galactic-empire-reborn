# reference/ — where canon lives

Three trees, in order of authority. **All READ ONLY.**

| Tree | What it is |
|------|-----------|
| `ge-source/` | The nine original C files and headers. Verified **byte-identical** to `ge-upstream/mbmgemp/*.C`. This is the path every `@see` comment in the codebase cites — keep citing it, it is stable. |
| `ge-upstream/` | The **full** original distribution, vendored from github.com/bsimser/ge (MIT). Everything `ge-source/` lacks: the `.MSG` data files, the manuals, and four more C files. See its `PROVENANCE.md`. |
| `wiki/` | Community transcription of the GE wiki, plus `_raw/` snapshots. Useful for prose and context. Has been caught being wrong on numbers more than once. |

## Precedence when they disagree

1. **C source** (`ge-source/`, identical to `ge-upstream/mbmgemp/*.C`)
2. **`.MSG` data files** (`ge-upstream/mbmgemp/GE/REL/` — NOT `GE/MSG/`, which is a stale partial snapshot; see PROVENANCE.md)
3. **`wiki/`**

**In-game help text (`MBMGEHLP.MSG`) is outside this ranking.** It states design
*intent*, and the shipped configuration frequently does not implement it. It is
never authoritative for a number.

> Worked example: the help says twice that Cybertrons will not attack an
> Interceptor or Freighter unless provoked. `S21LATK {0}` means the Cybertron
> Scout pursues every class. The config is what ran.

## Don't hand-transcribe canon — extract it

Every hand-copied table in this project has drifted. Three did so silently for
months, each behind a plausible comment claiming canon was unavailable. Use the
extractors, and pin the result with a test that re-reads the original file.

| Question | Command |
|----------|---------|
| Ship class values (34 slots × 28 fields) | `node tools/extract-ship-classes.mjs` |
| Sysop option defaults and clamp bounds | `node tools/extract-sysop-options.mjs [NAME...]` |
| Item tables (MAXPL, weights, values, manhours) | `node tools/extract-item-tables.mjs` |

Add `--json` to any of them. `extract-ship-classes.mjs --ts` regenerates
`backend/prisma/seed/ship-classes.ts`, which is a **generated artifact** — edit
canon or the script, never the seed.

## The data-file format

    MAXPLRS {The maximum players in the game at once: 30} N 1 256
    S01SRNG {  Scan Range: 100000}

The value after the last `: ` or `? ` inside the braces is the **default**. The
trailing letter is the type (`N` numeric, `B` yes/no, `S` string) and, for `N`,
the declared range.

`GEMAIN.C:835-875` reads ship-class options **sequentially** via `++classbase`,
so the *order* of options is what binds them to struct fields — the mnemonic
names are for humans only. The extractors assert that order before trusting a
parse.

## Two traps that have already cost time

**Bounds are not defaults.** `numopt(NAME, min, max)` clamps; it does not
suggest. 44 of 51 options were once seeded by picking a bound, 20 of them
sitting exactly *on* one, in both directions.

**Watch the index basis.** `wptr->shpclass` in the C is a **0-based** index into
`shipclass[]` (`GEMAIN.C:898`, `GECMDS.C:412` prints `i+1`, `GECMDS.C:4562`
parses `atoi()-1`). Our `classNumber` is 1-based. C's `- 1` in
`lowest_to_attk - 1` is that conversion, not a rule.
