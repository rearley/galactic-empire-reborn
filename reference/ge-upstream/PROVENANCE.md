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
| `GE/REL/MBMGESHP.MSG` | 207K | **Ship class table.** All 34 classes × 28 options, with defaults. The authoritative source for shields, phasers, warp, tonnage, price, points, scan range, and the CPU hunting fields (LATK/NATK/MAKE/TOUGH/DAMF). |
| `GE/REL/MBMGEMSG.MSG` | 127K | Sysop option blocks with defaults and clamp bounds; item table; `S00P*` neutral-zone planet definitions. |
| `GE/REL/MBMGEHLP.MSG` | 45K | In-game help text. Describes *intent* — repeatedly contradicted by the shipped defaults, so it is **not** authoritative for numbers. |
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


## Which copy of each `.MSG` — settled 2026-09-03

The distribution carries three copies of each `.MSG`: the `mbmgemp/` root,
`GE/REL/`, and `GE/MSG/`. **`GE/REL/` is the shipped configuration.** It is
byte-identical to the root copy; `GE/MSG/` is an earlier snapshot.

| file | root | `GE/REL/` | `GE/MSG/` |
|---|---|---|---|
| `MBMGESHP.MSG` | 207,186 | same | **same** — ship classes are unaffected |
| `MBMGEMSG.MSG` | 127,091 | same | 100,206 — 277 ids missing |
| `MBMGEHLP.MSG` | 44,769 | same | 44,712 — differs |

Two independent reasons `GE/REL/` wins:

1. **The C source cannot run against `GE/MSG/`.** Nine option ids it reads by
   name are absent there: `ITMPR01` (GEMAIN.C:569), `SHLDPR01` and `PHSRPR01`
   (GEMAIN.C:579, 589), `HYPDST1`, `HYPDST2`, `CYBNEW`, `DROIDNEW`, `CYBBASEM`,
   `CYBLASTM`.
2. **`GE/REL/` is demonstrably later.** It fixes typos the earlier copy carries
   (`them maximum` → `the maximum` in ADMIN4, `there %s` → `their %s` in
   ATTACKM5, `completly` → `completely` in CLOKUP) and replaces the generic
   `CYBMSG1..19` taunts with per-Cybertron `CYB1M*` families.

Of the 179 sysop options both copies define, exactly **three** disagree:

| option | `GE/MSG/` | `GE/REL/` (shipped) | what it controls |
|---|---|---|---|
| `PFIRDST` | 7 | **5** | phaser range falloff exponent, `dd^n` |
| `HPFIRDST` | 9 | **5** | hyperphaser range falloff exponent |
| `ITMWT13` | 200 | **50** | weight of 100 gold, i.e. 0.5 tons per unit |

All three had reached our constants from the stale copy and were corrected on
2026-09-03. Anything sourced from `GE/MSG/` before that date is suspect and
should be re-checked against `GE/REL/`.

### `MBMGEHLP.MSG` — diffed 2026-09-03

The help database was the one `.MSG` never checked after the `MBMGEMSG.MSG`
episode. It has now been diffed properly. **Result: the two copies differ in
exactly one line, and no number in either copy is load-bearing.**

Both copies define the **same 62 ids** (`HLPINDEX`, `HLPSTART`, … `HLPZIP`);
none is present in one and absent from the other. Of those 62, 61 are
byte-identical. The whole delta is one line inside `HLPSET`, present in
`GE/REL/` (line 961) and missing from `GE/MSG/`:

```
  filter     -  filters out 80% of the battle messages
```

That is the third independent confirmation that **`GE/REL/` is the later,
shipped copy**: `filter` is `options[MSG_FILTER]`, the fourth entry of
`cmd_set`'s option table (`GECMDS.C:5196-5201`, `#define NUMOPTS 4`), so the
earlier help text documents only three of the four options the shipped binary
accepts. The 57-byte size difference is this line and nothing else.

**The "80%" is prose, not a constant.** Nothing reads it. The mechanism is
binary: `outprfge` (`GEMAIN.C:2547-2576`) calls `clrprf()` and returns for a
`FILTER`-class message when `options[MSG_FILTER] == TRUE`, and `outprf()`s it
otherwise. 80% is Murdock's estimate of what share of battle chatter is sent
`FILTER` rather than `ALWAYS`; there is no percentage anywhere in the code.

Every other number stated in `MBMGEHLP.MSG` — sector size 10000x10000 parsecs,
galaxy 6000x6000, bearings -180..+180, Cybertron top speed warp 8.0, the
`HLPSCORE` kill-point table, "1/4 impulse" for wormholes, "10 to 50 troops in a
pass" — is identical in both copies, so no help-derived figure in this port can
have been contaminated by the stale snapshot. It remains true that
`MBMGEHLP.MSG` states *intent* and is never authoritative for a value: the
`HLPSCORE` table (Interceptor 10 … Dreadnought 500) is help text, and
`MBMGESHP.MSG`'s `max_points` column is what the game actually loads.

**Conclusion: no constant in this codebase is at risk from the `MBMGEHLP.MSG`
divergence.** Use `GE/REL/` anyway, for consistency with the other two files.

### Correction to a citation used elsewhere — the base-price block DOES ship

`docs/CANON_AUDIT_2026-09.md` (D5, and its finding at `:338-341`) states that
`grep ITMPR MBMGEMSG.MSG` "returns ZERO hits", concludes the shipped data file
predates `GEMAIN.C:569`, and rules gold's base price unresolvable from canon.
That grep was run against `GE/MSG/`. In the shipped `GE/REL/` copy the whole
block is present at lines 1564-1660, including:

```
1612:ITMPR13 {Base price for gold: 1000} N 1 32000
```

So the value *is* canon, it *is* 1000, and the port's 100 is wrong. Likewise
`SHLDPR01` (`:1664`) and `PHSRPR01` (`:1740`) ship — as the "nine option ids
absent from `GE/MSG/`" list above already implied.
