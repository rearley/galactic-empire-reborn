# Concepts

Design explorations that are not part of the running game. Nothing in this
folder ships, and nothing here is a commitment.

## `hornet-bridge.html` — a graphical game on this engine (2026-09-22)

A single self-contained page. Open it in a browser; it needs no server. The
published copy is at https://claude.ai/artifact/W82eprPYJGTyjgHMFjzJRd (private
to the owner until shared).

**The idea:** a *separate* game, with its own galaxy and players, built from
this engine with a graphical client for players who never used the text
original. It does not share a galaxy with the classic game and does not need
to send players to it. This is not the `modern-ui` branch, which is a second
client onto the SAME galaxy and is bound by that branch's "ambient vs
requested" rule. A separate game is free of that rule, which is what makes a
live radar possible.

**What the mock-up settled:**

- **Scale is canon, and it decides the design.** A sector is 10,000 units,
  orbit is within 250 (0.025 sector), a Cyberquad fires from 0.1 sector,
  scanners reach 5–25 sectors, and the galaxy is ±100. Warp 10 crosses a sector
  in about 20 s (movement is `speed / 65000` per move, one move per ship every
  3 s). From orbit to galaxy is a factor of about 10,000, so the view is **one
  continuous zoom with four stops**: tactical, sector, scanner and galaxy. Icons
  stay a constant size on screen at every zoom.
- **Planets:** click one to target it, then **Orbit** flies you in and docks.
  Orbit opens a **planet screen** beside the still-live tactical view. It has
  Cargo (`tra up`/`tra down`, against real ship tonnage), Colony (tax, beacon,
  treasury, defences), Repairs (canon's 25,000-people rule), Assault (enemy
  planets) and Market (the neutral-zone trading posts).
- **Colonies screen:** every owned planet in one table. Clicking a row flies the
  camera there.
- **Every control maps to a classic command**, logged as it is sent. The text
  console (`` ` ``) stays as a power-user and debugging tool.
- **The torpedo lock meter is canon's formula**, shown for both sides. It
  teaches "a target at warp cannot be locked", which a playtester did not know.
- **Client-side smoothing is required.** The "smooth motion" toggle shows the
  raw 3-second movement tick; without smoothing it is unplayable.

**Tech direction if it is built:** React for the panels (as today), with
**PixiJS** for the play area in place of the mock-up's plain canvas. The render
loop reads a plain store and never goes through React re-renders. Sound via
Howler. It could later be installable as a PWA or wrapped with Tauri.

**Where it would live** is not decided. That open item is tracked in
`docs/PROGRESS.md`, 2026-09-23.

**Made up in the mock-up:** planets outside sector 12,-4, owners, prices,
economy rates, damage numbers and all AI behaviour.
