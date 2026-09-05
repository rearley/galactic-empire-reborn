# `reference/` — what each file is, and which one to read

Everything here is **READ ONLY**. Never modify a file in this tree.

## The one rule that matters

> **Read `ge-upstream/mbmgemp/GE/REL/`. Never read `GE/MSG/`. Never cite `GE/REL2/`.**

The distribution contains several generations and several *variants* of the same
configuration files. They are not interchangeable, and picking the wrong one has
already put wrong numbers into this codebase twice. If you are about to open a
`.MSG` file, check its directory against the table below first.

## Which release this is

The vendored distribution is **Galactic Empire 3.2e (1994-08-06)** — the final
release. `GE/DOCS/GEREADME.DOC` carries the full changelog back to 3.0f (1992);
3.2e is the newest entry, so there is nothing later to fetch.

Two changelog entries matter more than the rest, because they explain the file
layout:

- **3.2d (1994-03-06)** added the price options — *"In order to give you the
  option to specify the prices of items, phasers, and shields, many new messages
  were added to the `MBMGEMSG.MSG` file… GE will not operate properly without
  these new options."* That is `ITMPR01+`, `SHLDPR01+`, `PHSRPR01+`.
- **3.2e (1994-08-06)** added the per-Cybertron taunt families between the
  markers `CYBBASEM` and `CYBLASTM` — 13 classes × 16 messages.

Both notes also say *"There have been no changes to the default `MBMGESHP.MSG`
configuration"*, which is why the ship-class table is byte-identical everywhere
and ship classes were never affected by any of this.

## The map

### Source code

| path | what it is |
|---|---|
| `ge-source/*.C`, `*.H` | The nine files the port was originally written against. **Byte-identical** to `ge-upstream/mbmgemp/*.C` — either path is fine, and existing citations use `ge-source/`. |
| `ge-upstream/mbmgemp/*.C`, `*.H` | The same nine, plus five we did not originally have: `GELIB.C`, `SECURE.C`, `SECURE.H`, `MBMGEGRF.C`, `GESAMPLE.C`. |
| `ge-upstream/mbmgecvt/` | A data-conversion utility, not the game. Not canon for gameplay. |
| `ge-upstream/mbmgemap/` | A galaxy-map printing utility. Not canon for gameplay. |
| `ge-upstream/register/` | Registration/licensing code. Irrelevant to gameplay. |

### Data files — the part that goes wrong

| path | status |
|---|---|
| `ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG` | ✅ **THE option database.** 3.2e, 127,091 bytes. Byte-identical to the distribution root copy `mbmgemp/MBMGEMSG.MSG`. |
| `ge-upstream/mbmgemp/GE/REL/MBMGESHP.MSG` | ✅ **THE ship-class table.** 34 slots × 28 options, read in order by `GEMAIN.C:835-875`. Identical in all three locations. |
| `ge-upstream/mbmgemp/MBMGEMSG.MSG` | ✅ Same bytes as `GE/REL/`. Fine to read; prefer `GE/REL/` so citations are consistent. |
| `ge-upstream/mbmgemp/GE/MSG/MBMGEMSG.MSG` | ❌ **NEVER.** Pre-3.2d, 100,206 bytes, missing 277 ids. See below. |
| `ge-upstream/mbmgemp/GE/MSG/MBMGEHLP.MSG` | ⚠️ Also differs from `GE/REL/`. Use `GE/REL/MBMGEHLP.MSG`. |
| `ge-upstream/mbmgemp/GE/REL2/MBMG2*.MSG` | ❌ **NOT canon.** A second, differently-tuned instance. See below. |
| `ge-upstream/mbmgemp/GE/VIR60/` | Installer variant for a specific BBS version. Not a balance source. |
| `ge-upstream/mbmgemp/*.DAT`, `*.NEW` | Btrieve binaries — the shipped starting *world*, not the rules. We generate our galaxy procedurally and do not convert these. |

### Documentation

| path | status |
|---|---|
| `ge-upstream/mbmgemp/GE/DOCS/GEREADME.DOC` | The changelog. Excellent for *why* a value is what it is. |
| `ge-upstream/mbmgemp/GE/DOCS/GESYSOP.DOC`, `MBMGEMP.DOC`, `GEINST.DOC` | Manuals. Describe **intent**; not authoritative for a number. |
| `ge-upstream/mbmgemp/MBMGEHLP.MSG` / `GE/REL/MBMGEHLP.MSG` | In-game help. States intent, and the shipped configuration frequently does not implement it. **Never authoritative for a number.** |
| `wiki/` | Community transcription. Useful, repeatedly caught being wrong. Never cite against the C source or the `.MSG`. |

## Why `GE/MSG/` is forbidden

It is not a different source of truth. It is an **older revision of the same
file** — the pre-3.2d configuration, shipped alongside the 3.2e one.

Two independent proofs, either sufficient:

1. **The C source cannot run against it.** Nine ids it reads by name are absent:
   `ITMPR01`, `SHLDPR01`, `PHSRPR01`, `HYPDST1`, `HYPDST2`, `CYBNEW`,
   `DROIDNEW`, `CYBBASEM`, `CYBLASTM`.
2. **It is demonstrably earlier.** `GE/REL/` fixes typos it still carries
   (`them maximum` → `the maximum` in ADMIN4, `there %s` → `their %s` in
   ATTACKM5, `completly` → `completely` in CLOKUP), and replaces its generic
   `CYBMSG1..19` taunts with the per-class `CYB1M*` families 3.2e introduced.

Of the 179 sysop options both files define, **exactly three disagree** — and
`GEREADME.DOC` documents all three as deliberate 3.2d changes, so reading the
old file does not merely lag the shipped game, it *reverses* balance work:

| option | `GE/MSG/` | `GE/REL/` (shipped) | changelog |
|---|---|---|---|
| `PFIRDST` | 7 | **5** | *"the documentation… was backwards. You reduce the value in HPFIRDST and PFIRDST to increase the range and power."* |
| `HPFIRDST` | 9 | **5** | same entry |
| `ITMWT13` | 200 | **50** | *"The weight of gold has been reduced to increase the amount all ships can hold."* |

All three had reached our constants and were corrected on 2026-09-03.
`backend/test/balance/msg-provenance.balance.spec.ts` now fails if any file
under `backend/src`, `backend/test` or `tools` reads the stale path.

## Why `GE/REL2/` is not canon either

`GE/REL2/` is a **second, differently-tuned instance** of the module — a sysop
could run two games side by side, and it uses its own `MBMG2*.DAT` files. Of the
60 sysop options it shares with the standard release, **33 have different
values**: `CYBGOLD` 1200 → 25, `HPDAMMAX` 50 → 35, `CLENGUSE` 7500 → 2600,
`DECODDS` 11 → 8, and so on.

Nothing marks these as alternates inside the file, so a value lifted from
`MBMG2MSG.MSG` looks exactly like canon and is not. If you find yourself citing
`MBMG2*`, stop.

## Precedence, when sources disagree

1. **The C source** — `ge-source/` (= `ge-upstream/mbmgemp/*.C`)
2. **The `.MSG` data** — `ge-upstream/mbmgemp/GE/REL/`
3. **`wiki/`** — useful, has been wrong, never cite against 1 or 2

In-game help (`MBMGEHLP.MSG`) sits outside this ranking: it states design
*intent*, and the shipped configuration frequently does not implement it. Worked
example — the help says twice that Cybertrons will not attack an Interceptor or
Freighter unless provoked, but `S21LATK {0}` means the Cybertron Scout pursues
every class.

## Two habits that keep this honest

- **Do not hand-transcribe canon.** Generate it with a script under `tools/`
  and pin it with a test that re-reads the original file. See
  `tools/extract-ship-classes.mjs` and
  `backend/test/balance/ship-class-canon.balance.spec.ts`.
- **Check the line number before you cite it.** Open the file. Off-by-two
  citations get re-transcribed later as fact, and that is the exact mechanism
  by which the dead `shieldprice[]` array at `GEMAIN.C:299-341` — which sits
  inside an `OMITTED 3.2c.7` comment block — became a live price table here.

See also `ge-upstream/PROVENANCE.md` for where the distribution came from.
