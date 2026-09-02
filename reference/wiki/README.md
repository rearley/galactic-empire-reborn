# GE Wiki Reference

Human-readable game mechanics documentation compiled from the Galactic Empire
community wiki at https://manicpop.org/gewiki/

These documents supplement the original C source in `../ge-source/`.
When implementing any mechanic, consult both the wiki doc (for intent and
behavior) and the C source (for exact implementation).

## Provenance and verification

Synced from the live wiki on 2026-09-02 via `index.php?title=X&action=raw`.
The unmodified wikitext of all 58 pages is preserved in `_raw/`, so any claim
made from these documents can be checked against the source rather than taken
on trust.

The eight originally-curated files were verified numerically against `_raw/`
rather than overwritten, because they carry hand-added C-source
cross-references the wiki does not have. `player-ships.md`, `cpu-ships.md`,
`items.md`, `defensive-systems.md` and `commands.md` contain **zero** numeric
discrepancies against the live pages. `colonizing-planets.md` was replaced: the
live page is substantially fuller and carries its own inline GEPLANET.C line
references.

Known quirks in the wiki itself (present upstream, not transcription errors):
- CPU class 22 lists `Scan 1000`, which would be 0.1 sectors. Every other class
  is in the 20k-400k range.
- `MBMGEMSG.MSG` labels `ITMPR11` as mines and `ITMPR12` as jammers, but C has
  `I_JAMMERS = 10` and `I_MINE = 11` (GEMAIN.H:154-155), so the labels are
  transposed relative to the item indices the values actually key on.

## Files

| File | Contents |
|------|----------|
| `player-ships.md` | All player ship classes with full stat tables |
| `cpu-ships.md` | All AI ship classes (Cybertrons, Sarterns, Droids) with behavior notes |
| `movement.md` | Impulse/warp physics, speed formulas, energy costs |
| `items.md` | All 14 items — weights, production rates, base prices, purposes |
| `weapons-and-combat.md` | Phasors, torpedoes, missiles, mines, jammers, decoys, maintenance |
| `defensive-systems.md` | Shields, cloaking, decoys, jammers |
| `colonizing-planets.md` | Planet finding, claiming, production cycle formula (exact math) |
| `commands.md` | Complete command reference with categories |
| `sysop-options.md` | **MBMGEMSG.MSG — every sysop-tunable option with its default.** The values our `config/game.config.json` should be measured against; the C source supplies only the clamp bounds. |
| `attacking-planets.md` | Troop and fighter assault mechanics |
| `scoring.md` | Score formulas and the roster |
| `teams-and-trade-alliances.md` | Teams, team passwords, trade access |
| `reports-and-scans.md` | Every report and scan mode |
| `communications.md` | Radio channels and frequencies |
| `set-command.md` | SET options |
| `what-is-damf.md` | Damage factor — why Sarten Obliterators are hard |
| `sysop-configuration.md`, `sysop-commands.md` | Sysop surface |
| `bugs-and-potential-improvements.md` | Known issues in the original |
| `torpedoes.md`, `missiles.md`, `cloak.md`, `orbit.md`, `self-destruct.md`, `centock.md`, `parsec.md`, `flux-pods.md`, `cash.md` | Term pages |
| `_raw/*.wiki` | Unmodified wikitext snapshot of all 58 pages |

## Key Mechanics to Cross-Reference with C Source

| Mechanic | Wiki Doc | C Source |
|----------|----------|----------|
| Ship movement physics | movement.md | GEFUNCS.C lines 648-649 |
| Planet production cycle | colonizing-planets.md | GEPLANET.C |
| Torpedo behavior | weapons-and-combat.md | GEFUNCS.C, GECMDS.C |
| Cybertron AI | cpu-ships.md | GECYBS.C |
| Droid AI | cpu-ships.md | GEDROIDS.C |
| Hyperwarp (CPU) | cpu-ships.md | GEMAIN.C |
| Ship maintenance | weapons-and-combat.md | GECMDS.C lines 4469-4516, GEFUNCS.C lines 411-421 |
| Item definitions | items.md | GEMAIN.H (NUMITEMS, item indices) |

## License

Wiki content is available under GNU Free Documentation License (GFDL).
