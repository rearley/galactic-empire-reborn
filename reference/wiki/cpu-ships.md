# CPU Ships

Source: https://manicpop.org/gewiki/index.php?title=CPU_ships

CPU ships are AI-controlled. There are two categories: combative ships
(Cybertrons and Sarterns) and droid ships.

## Combative Ships (Cybertrons + Sartens)

| # | Class | Name | Shi | Pha | Tor | Mis | Dec | Jam | Zip | Min | Att | Clo | Acc | Warp | Tons | Scan | Pts | User | Make | Tough | Dmg |
|---|-------|------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|------|------|-----|------|------|-------|-----|
| 21 | Cybertron Scout | Cybertron ### | 2 | 2 | Y | N | Y | Y | Y | Y | N | N | 2k | 8 | 900 | 50k | 1000 | 0 | 10 | 0 | 90 |
| 22 | Cybertron Battle Cruiser | Cyberquad ### | 3 | 3 | Y | N | Y | Y | N | Y | Y | N | 5k | 10 | 12.5k | 1000 | 2000 | 0 | 5 | 1 | 100 |
| 23 | Cybertron Base Star | Cyber Base-### | 9 | 16 | N | N | Y | Y | Y | Y | N | N | 0 | 0 | 1.25m | 200k | 10000 | 20 | 1 | 1 | 2000 |
| 24 | Sarten Attack Drone | SADx3### | 1 | 1 | N | N | Y | Y | N | N | N | N | 1.2k | 8 | 100 | 20k | 50 | 0 | 6 | 0 | 30 |
| 25 | Sarten Obliterator | SOBx9### | 5 | 16 | Y | N | N | N | N | N | Y | N | 200 | 15 | 234k | 400k | 500 | 3 | 2 | 1 | 500 |

## Droid Ships

| # | Class | Name | Shi | Pha | Tor | Mis | Dec | Jam | Zip | Min | Att | Clo | Acc | Warp | Tons | Price | Scan | Pts | User | Make | Tough | Dmg |
|---|-------|------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|------|-------|------|-----|------|------|-------|-----|
| 31 | Lydorian Garbage Scow | NCC Lx4### | 1 | 1 | N | N | Y | Y | Y | Y | N | N | 50 | 1 | 10000 | 20000 | 25000 | 5 | 0 | 2 | 0 | 100 |
| 32 | Murdonian Transport | Trans-Gal #2### | 2 | 5 | N | N | Y | Y | Y | Y | N | N | 400 | 8 | 30000 | 20000 | 25000 | 200 | 0 | 2 | 0 | 100 |
| 33 | Vakory Survey Drone | Vakory SD-82### | 1 | 1 | N | N | Y | Y | Y | Y | N | N | 1200 | 4 | 100 | 20000 | 25000 | 50 | 0 | 2 | 0 | 100 |

## Column Definitions

- **Shi** — shields
- **Pha** — phaser level
- **Tor** — torpedo capability
- **Mis** — missile capability
- **Dec** — decoy capability
- **Jam** — jammer capability
- **Zip** — zipper capability
- **Min** — mine capability
- **Att** — can launch planetary attacks (CPU ships cannot do this regardless of setting)
- **Clo** — cloaking capability
- **Acc** — acceleration rate
- **Warp** — top warp speed (normal, not hyperwarp)
- **Tons** — maximum cargo weight
- **Scan** — scanner range in parsecs
- **Pts** — points awarded for destroying this ship
- **User** — lowest player ship class this CPU will pursue unprovoked (0 = pursues all)
- **Make** — maximum number of this ship type that can exist simultaneously
- **Tough** — 0 = stupid AI, 1 = smart AI
- **Dmg** — damage factor (100 = normal)

All CPU ships are defined with a price of 20000 but cannot be purchased.

## Hyperwarp

Combative CPU ships use hyperwarp to stay close to human players:

- If a combative CPU ship is **more than 25 sectors** from the human player
  it is pursuing, it travels at **20x its normal speed**
- It drops back to normal speed when within **10 sectors** of the target
- When scanning a hyperwarp ship, the scan reads "Hyper" — masking the actual speed

Source: GEREADME.DOC, 08/06/94 Release 3.2e

## Cybertron Behavior Notes (see GECYBS.C)

- Cybertrons are **persistent** — saved to DB between sessions
- Difficulty escalates with player kill count:
  - 0–29 kills: normal behavior
  - 30–59 kills (CYB_BE_NICE): gets tougher
  - 60+ kills (CYB_BE_EASY): gets really mean
- Each Cybertron has a `cybskill` value (propensity to make errors — higher = fewer errors)
- Cybertrons respect the neutral zone
- Cybertrons accumulate gold (capped at CYB_MAXCASH = 2,000,000)
- Cybertrons occasionally break off attacks randomly (CYB_BREAKOFF = 1 in 500 chance)

## Droid Behavior Notes (see GEDROIDS.C)

- Droids are **ephemeral** — not persisted, respawn fresh each time
- The **Murdonian Transport** (class 32) is the primary PvE target for new players:
  - Heavily loaded with items (flux pods, decoys, torpedoes, mines, jammers, missiles, ion cannons, gold)
  - Runs from players but fights back hard if cornered
  - Does not save to DB
