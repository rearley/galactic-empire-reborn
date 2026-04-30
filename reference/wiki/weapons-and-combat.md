# Weapons and Combat

Source: https://manicpop.org/gewiki/index.php?title=Weapons_and_combat

## Phasers

Standard phasers fire at impulse speed. At warp speed, phasers switch
to **hyper-phasers** automatically.

- Phasor reload rate: 10 per tick (PRELOAD = 10 from GEMAIN.H)
- Phasor spread bias: 2 degrees (PHABIAS = 2 from GEMAIN.H)
- Energy drained when hit: 1000 (SHHITENG = 1000 from GEMAIN.H)

Command: `PHA [percent]` — fire phasers at specified power (1–100%)

## Torpedoes

Projectile weapon. Despite traveling at ~warp 16 (2441 parsecs/centock
by default), torpedoes obey these rules:

- **Cannot** be fired by a ship at warp speed
- **Cannot** hit a ship traveling at warp speed
- Do not require flux charging (have their own charge)
- **Always hit** their target unless:
  - Target jumps to warp (torpedo loses lock and disappears)
  - Intercepted by a decoy
- Firing torpedoes lowers shields — they will NOT auto-raise afterward
- Ship must be at impulse or full stop to fire

Command: `TOR [ship letter]` or `TOR @` (fires at locked target)

### Torpedo Offensive Strategy
- Use at impulse against impulse targets
- Lock onto target first with `LOC` command for `TOR @` shorthand

### Torpedo Defensive Strategy
- Quick jump to warp 1+ (even for one centock) causes pursuing torpedoes
  to lose lock and disappear
- Warning: warping drops shields, making you vulnerable to phasers
- Deploy decoys to reduce (not eliminate) torpedo hit chance

## Missiles

Unlike torpedoes, missiles:
- **Can** travel at warp speed
- **Can** hit ships traveling at warp
- Must be charged from the ship's flux pile
- More charge = further range and more damage on impact

Command: `MIS [ship letter] [charge percent]`

## Mines

Deployed in space. Ships passing through mine locations take damage.
Cybertrons use mines aggressively (especially when at high damage %).
Zippers can be used to trigger/clear mines.

Command: `MIN` — deploy mine at current location

## Zippers

Trigger mines in the vicinity. Used offensively (clear path for yourself,
detonate mines near enemies) or defensively.

Command: `ZIP`

## Decoys

Deployed to intercept incoming torpedoes and missiles. Reduce but do not
eliminate hit probability.

- Duration: DECOYTIME (15) × TICKTIME (6) = 90 seconds
- Each decoy has a chance to intercept one incoming weapon

Command: `DEC` — deploy decoy

## Jammers

Blocks scanners of ALL ships in the area — including the deploying ship.

### Usage
Command: `JAM` — no options

### Strategy
- **Defensive**: Deploy to cover a retreat. Use at high warp on random heading.
  Stack multiple jammers for longer coverage.
- **Offensive**: Sneak attack — jam the area, approach under scanner blackout.

## Lock

Lock onto a specific ship as your primary target. Allows use of `@` shorthand
in weapon commands.

Command: `LOC [ship letter]`

## Maintenance (Ship Repair)

Repair your ship by purchasing maintenance services while orbiting:
- Zygor station
- Tahanian Station
- Any planet with population of at least 25,000 men

Cost:
- 2,500 credits in the neutral zone
- 200 credits at any other qualifying planet
- Planet trade password required if set

Duration: 1 centock + 1 centock per 3% of damage

During the final centock of repair:
- Offline ship systems are repaired
- Top warp speed is restored if it was reduced
- Shield charge is reset to zero (recharge after maintenance completes)

Maintenance is cancelled if you:
- Break orbit
- Fire weapons
- Are targeted by another ship

Command: `MAI` or `MAI [password]`

Sources: GECMDS.C lines 4469–4516, GEFUNCS.C lines 411–421
