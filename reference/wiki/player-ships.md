# Player Ships

Source: https://manicpop.org/gewiki/index.php?title=Player_ships

Ships available in a standard, unmodified installation of Galactic Empire 3.2e.
Ships are defined in MBMGESHP.MSG and can be edited by the sysop.

## Ship Stats Table

| # | Class | Shi | Pha | Tor | Mis | Dec | Jam | Zip | Mine | Atck | Clo | Acc | Warp | Tons | Price | Scan | Pts | Cyb | Cyb# | Dmg |
|---|-------|-----|-----|-----|-----|-----|-----|-----|------|------|-----|-----|------|------|-------|------|-----|-----|------|-----|
| 1 | Interceptor | 10 | 10 | Y | N | Y | Y | Y | Y | N | N | 5k | 10 | 1k | 65k | 100k | 750 | Y | 1 | 90 |
| 2 | Stealth Fighter | 15 | 15 | Y | Y | Y | Y | Y | Y | Y | Y | 5k | 20 | 2k | 500k | 200k | 1500 | Y | 2 | 90 |
| 3 | Heavy Freighter | 5 | 5 | Y | N | Y | Y | N | Y | Y | N | 3k | 8 | 60k | 40k | 50k | 500 | N | 0 | 200 |
| 4 | Destroyer | 15 | 15 | Y | Y | Y | Y | Y | Y | Y | N | 5k | 25 | 5k | 600k | 100k | 2000 | Y | 2 | 90 |
| 5 | Star Cruiser | 15 | 15 | Y | Y | Y | Y | Y | Y | Y | Y | 10k | 25 | 3k | 700k | 200k | 5000 | Y | 2 | 100 |
| 6 | Battle Cruiser | 19 | 19 | Y | Y | Y | Y | Y | Y | Y | Y | 3k | 30 | 6k | 800k | 250k | 5000 | Y | 2 | 125 |
| 7 | Frigate | 12 | 12 | Y | Y | Y | Y | Y | Y | Y | N | 10k | 30 | 12k | 1.25m | 250k | 5000 | Y | 2 | 125 |
| 8 | Dreadnought | 19 | 19 | Y | Y | Y | Y | Y | Y | Y | Y | 15k | 50 | 40k | 2m | 500k | 10000 | Y | 2 | 125 |
| 9 | Freight Barge | 6 | 3 | N | N | Y | Y | N | N | Y | N | 1k | 15 | 200k | 3m | 200k | 5000 | N | 0 | 200 |
| 34 | Sysopian Death Star | 6 | 5 | Y | Y | Y | Y | Y | Y | Y | Y | 5k | 255 | 100m | 32m | 1m | 1000 | Y | 0 | 100 |

## Column Definitions

- **Shi** — maximum shield level that can be purchased/installed
- **Pha** — maximum phaser level that can be purchased/installed
- **Tor** — has torpedo capability
- **Mis** — has missile capability
- **Dec** — has decoy capability
- **Jam** — has jammer capability
- **Zip** — has zipper capability
- **Mine** — has mine capability
- **Atck** — can launch planetary attacks
- **Clo** — has cloaking capability
- **Acc** — acceleration rate (how quickly ship speeds up and slows down)
- **Warp** — top rated warp speed (ships can travel at up to 150% of this speed but damage will occur)
- **Tons** — maximum weight ship can hold
- **Price** — cost to purchase at Zygor
- **Scan** — range of scanner in parsecs (100k = 10 sectors in any direction); long range scanner is 10x this value
- **Pts** — points awarded to attacker for destroying a ship of this type
- **Cyb** — whether combative CPU ships will pursue this ship class without being provoked
- **Cyb#** — how many combative CPU ships will pursue simultaneously
- **Dmg** — damage effect factor (100 is normal; lower = more fragile; higher = more resilient)

## Notes

- Ships are purchased at Zygor station
- Warp speed cap: ships can travel at up to 150% of rated warp but will take damage
- The Heavy Freighter (3) and Freight Barge (9) cannot be attacked by Cybertrons unprovoked (Cyb = N)
- The Sysopian Death Star (34) is an admin-only ship
