# 022 — Fidelity Audit v2

**Status:** planning
**Date:** 2026-05-11

This spec wraps the brainstormed design at
[`docs/superpowers/specs/2026-05-11-fidelity-audit-v2-design.md`](../../docs/superpowers/specs/2026-05-11-fidelity-audit-v2-design.md),
which is the authoritative source for goals, scope, method, and acceptance.

## Why this exists

Playtest has been reactive. Bugs like full-map scanner visibility and
AI ships firing from across the universe slipped through unit tests
because each function passed in isolation. This audit pins the rules
that span subsystems.

## What ships under this spec

- A C↔TS audit walk across four high-risk subsystems
  (scanners & visibility, AI targeting & engagement, ship state
  persistence, combat ranges & weapons), with findings recorded in
  [`findings.md`](./findings.md) using the 020 schema.
- An invariant test harness at `backend/src/game/invariants/` runnable
  in test mode (Jest) and dev-tick mode (`INVARIANTS_RUNTIME=1`).
- Inline fixes for every HIGH-severity finding, each with a test
  reference. MEDIUM/LOW findings are filed with `deferred` disposition.
- A dev playtest validation run with runtime invariants on.

## Out of scope

UX/copy bugs, frontend rendering, midnight job correctness, mail,
social commands, planet economy. Future audits.

## Acceptance

See "Acceptance" in the design doc.
