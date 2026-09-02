# ge-upstream — authoritative original Galactic Empire distribution

Source: https://github.com/bsimser/ge (MIT, © 2018 Bil Simser)
Retrieved: 2026-09-02, `git clone --depth 1`. The `.git` directory was stripped;
these are vendored reference files. **READ ONLY — never modify.**

## Why this exists

`reference/ge-source/` held only nine files (the C source and headers). Those nine
were verified **byte-identical** to this distribution, so nothing built on them has
drifted. What was missing was everything else — above all the *data* files, which
the port had been reconstructing from wiki transcriptions.

## What this adds that `ge-source/` never had

| Path | Size | Why it matters |
|------|------|----------------|
| `GE/MSG/MBMGESHP.MSG` | 207K | **Ship class table.** All 34 classes × 28 options, with defaults. The authoritative source for shields, phasers, warp, tonnage, price, points, scan range, and the CPU hunting fields (LATK/NATK/MAKE/TOUGH/DAMF). |
| `GE/MSG/MBMGEMSG.MSG` | 100K | Sysop option blocks with defaults and clamp bounds; item table; `S00P*` neutral-zone planet definitions. |
| `GE/MSG/MBMGEHLP.MSG` | 45K | In-game help text. Describes *intent* — repeatedly contradicted by the shipped defaults, so it is **not** authoritative for numbers. |
| `GE/DOCS/GEREADME.DOC` | 105K | Release notes and changelog. |
| `GE/DOCS/MBMGEMP.DOC` | 60K | User's guide. |
| `GE/DOCS/GEINST.DOC`, `GESYSOP.DOC`, `GETERM.DOC` | — | Install, sysop, and terminal documentation. |
| `GELIB.C`, `SECURE.C`, `MBMGEGRF.C`, `GESAMPLE.C` | — | Four C files absent from `ge-source/`. |
| `GE/REL2/` | — | A second release with differing message files. |

## Data file format

Options are declared as:

    S01SRNG {  Scan Range: 100000}

The value after the colon inside `{}` is the **default**. `GEMAIN.C:835-875` reads
them **sequentially** via `++classbase`, so the *order* of options is what binds them
to struct fields — the mnemonic names are for humans only.

## Precedence when sources disagree

1. The C source (`ge-source/`, identical to `ge-upstream/mbmgemp/*.C`)
2. The `.MSG` data files here
3. `reference/wiki/` — a community transcription; already caught being wrong

In-game help text sits outside this ranking: it states design intent, and the shipped
configuration frequently does not implement it. Example: the help promises that
"Cybertrons will not attack an Interceptor or Freighter unless provoked", but
`S21LATK {0}` means the Cybertron Scout pursues every class, including Interceptors.
