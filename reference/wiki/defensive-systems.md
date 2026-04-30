# Defensive Systems

Source: https://manicpop.org/gewiki/index.php?title=Defensive_systems

## Shields

Shields absorb damage from phasers and other weapons.

- Shield level is purchased/installed (max level depends on ship class)
- Shields can only be raised at impulse speed
- Shields drop automatically when entering warp
- Shields are NOT automatically raised after:
  - Firing torpedoes
  - Completing maintenance
  - Exiting warp

Command: `SHI` — toggle shields up/down

## Cloak

Cloaking hides your ship from other players' scans.

- Only available on ship classes with cloaking capability (see player-ships.md)
- Can only be activated at impulse speed
- Costs energy while active
- Cloak value: -1 = up, 0 = down, positive = timer (GEMAIN.H WARSHP struct)

Command: `CLO` — toggle cloak

## Decoy

Decoys are deployed into space to intercept incoming torpedoes and missiles.

- Reduces (does not eliminate) chance of being hit
- Duration: DECOYTIME (15) × TICKTIME (6) = 90 seconds
- Multiple decoys increase interception probability
- Each decoy can intercept one incoming weapon

Command: `DEC` — deploy one decoy

## Jammer

Blocks scanner systems of all ships in the immediate area — including
the ship that deployed it.

### Usage
`JAM` — no options or arguments

### Behavior
- Affects all ships in range, not just enemies
- Stack successive jammers to extend duration
- After jamming ends, scanners return to normal

### Strategy
**Defensive**: Deploy while being pursued. Jump to high warp on a random
heading. The pursuer cannot scan you and must guess your heading.

**Offensive**: Deploy before approaching a target. The target cannot scan
you until the jamming ends.
