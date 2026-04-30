# GE Wiki Reference

Human-readable game mechanics documentation compiled from the Galactic Empire
community wiki at https://manicpop.org/gewiki/

These documents supplement the original C source in `../ge-source/`.
When implementing any mechanic, consult both the wiki doc (for intent and
behavior) and the C source (for exact implementation).

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
