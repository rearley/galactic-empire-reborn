# Concepts

Design explorations that are not part of the running game. Nothing in this
folder ships, and nothing here is a commitment.

## `hornet-bridge.html` — moved to its own repo (2026-09-28)

A playable mock-up, made 2026-09-22, of a **separate, graphical game** on this
engine: its own galaxy and players, for people who never used the text
original. On 2026-09-28 it became its own project, `rearley/ge-reborn-modern`,
copied from this repo at `f0b2e6f` with full history. The mock-up, and the
record of what it settled (the four-stop zoom forced by canon scale, the planet
screen, the torpedo-lock meter, client smoothing, PixiJS and React), live there
now. They were removed from this repo in the same change. The published copy is
still at https://claude.ai/artifact/W82eprPYJGTyjgHMFjzJRd.

**Why a separate repo, not two games on one domain:** the new game is meant to
go its own way, and this repo's rule that canon is the source of truth would
fight every change it makes. The engine is shared by history only. Fixes cross
over by cherry-pick from the new repo's `upstream` remote, never automatically.

**What it replaced:** the `modern-ui` branch, a second client onto *this*
galaxy, bound by its "ambient vs requested" rule. The branch was deleted the
same day, unmerged. It was local only, and its last commit was `87b921f`.
