# Audit Findings — 020 Source Fidelity Audit

> **SUPERSEDED, in part.** This audit predates
> `reference/ge-upstream/` — the full original distribution, obtained 2026-09-02.
> It was written against the nine C files and the wiki, so **any claim about a
> VALUE here should be re-checked** with the extractors in `tools/`; several
> figures it treats as canonical came from wiki tables that turned out to be
> rounded or wrong. Its findings about **logic** stand.
>
> Current audit: `CANON_AUDIT_2026-09.md`. Index: `README.md`.

**Schema**: Each finding has id, sourceRef, tsModule, severity, disposition, testRef, notes.

| id | sourceRef | tsModule | severity | disposition | testRef | notes |
|----|-----------|----------|----------|-------------|---------|-------|
| F-001 | GEFUNCS.C:1956 | backend/src/game/combat/combat-math.ts | HIGH | fixed | test/unit/roll-hull-damage.spec.ts | TS `randamage` was hull-damage roll; renamed to `rollHullDamage`; real `randamage()` (subsystem-damage) added |
| F-002 | GEFUNCS.C:1031 | backend/src/game/combat/combat-tick.service.ts | MEDIUM | fixed | test/unit/interceptor-preload.spec.ts | Phaser reload was `+PRELOAD`; fixed to `phasrtype * PRELOAD` via `phaserReloadAmount()` |
| F-003 | GEMAIN.H:473 | backend/src/game/galaxy/galaxy.types.ts | MEDIUM | fixed | test/integration/wormhole-visibility.spec.ts | Added GalaxyWormholeView with visible:boolean; getSectorWormholes maps Int→boolean; scan checks updated to !wormhole.visible |
| F-004 | GECMDS.C:2138 | backend/src/game/commands/handlers/scan.handler.ts | MEDIUM | n/a | — | C printmapfull() ordering matches TS SidePanelRow; scan lo full is deliberate TS enhancement not in C source |
| F-005 | GEFUNCS.C:808-816 | backend/src/gateway/game.gateway.ts | MEDIUM | fixed | test/integration/beacon.spec.ts | Added beacon emission in handleSectorTransition with observer check + gernd()%10===0 gate |
| F-006 | GECMDS.C:5197-5201 | backend/src/game/commands/handlers/set.handler.ts | MEDIUM | fixed | test/unit/set-options-coverage.spec.ts | Added scanfull (options[2]) and filter (options[3]) to set handler and catalog; ShipState gains scanFull/msgFilter |
| F-007 | GEMAIN.H (multiple) | backend/src/game/constants.ts | HIGH | fixed | test/unit/gemain-pins.spec.ts | ENGYMAX fixed 50000→65000; 25+ missing constants added; GEMAIN_GAMEPLAY_PINS bidirectional pin map added |
| F-008 | — | backend/test/manual/ | LOW | fixed | test/manual/T053.manual.spec.ts, T043.manual.spec.ts, T077.manual.spec.ts | Manual smoke tests encoded per QA checklists |

---

> Subsequent audit: see [specs/022-fidelity-audit-v2/findings.md](../specs/022-fidelity-audit-v2/findings.md) for the deeper persistence/combat/AI/scanner walk and runtime invariants harness.
