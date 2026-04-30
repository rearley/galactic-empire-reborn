# Items

Source: https://manicpop.org/gewiki/index.php?title=Items

Items can be purchased, sold, transferred to/from planets, and carried
in a ship's inventory. All values are defaults from MBMGEMSG.MSG.

## Item Reference Table

| # | Item | Weight (tons) | Production Rate | Base Price | Purpose |
|---|------|--------------|-----------------|------------|---------|
| 0 | Men | 1 | 3500 | 2 | Create items, pay taxes, add to owner's score |
| 1 | Missiles | 5 | 300 | 20 | Ship-to-ship combat |
| 2 | Torpedoes | 3 | 500 | 7 | Ship-to-ship combat |
| 3 | Ion Cannons | 250 | 4 | 33 | Planetary defense |
| 4 | Flux Pods | 20 | 200 | 200 | Powering ships |
| 5 | Food Cases | 2 | 8000 | 2 | Sustenance for men and troops on a planet |
| 6 | Fighters | 15 | 100 | 50 | Planetary defense and attack |
| 7 | Decoys | 3 | 900 | 18 | Defense vs torpedoes and missiles |
| 8 | Troops | 2 | 200 | 1 | Planetary defense and attack |
| 9 | Zippers | 5 | 100 | 99 | Trigger mines |
| 10 | Jammers | 4 | 300 | 21 | Jam all nearby ship scanners |
| 11 | Mines | 5 | 500 | 16 | Ship-to-ship combat |
| 12 | Gold | 0.5 | 30 | 100 | Sell for cash, increase planetary production |
| 13 | Spies | 1 | 20 | 100 | Intelligence on other planets |

Source index values (I_MEN=0, I_MISSILE=1, I_TORPEDO=2, etc.) map directly
to the `items[]` array in the WARSHP struct (GEMAIN.H).

## Item Details

### Men
- Create all other items on a planet
- Pay taxes (reduces planetary cash debt)
- Contribute to the planet owner's score (population ÷ 10,000 per midnight cycle)
- 1/8th perish if insufficient food (1 food case per 100 men)

### Missiles
- Ship-to-ship combat weapon
- Travel at warp speed — can hit ships traveling at warp (unlike torpedoes)
- Must be charged from the ship's flux pile
- More charge = further range and more damage

### Torpedoes
- Ship-to-ship combat weapon
- Travel at ~warp 16 (2441 parsecs/centock by default)
- Cannot be fired at warp, cannot hit ships at warp
- Do not require flux charging
- Always hit unless target warps away or intercepted by decoy
- Firing torpedoes lowers shields (will not auto-raise)

### Ion Cannons
- Planetary defense only
- Can fire at attacking ships in the sector
- Very heavy (250 tons each)

### Flux Pods
- Power source for missiles and hyper-phasers
- Required for missile charging
- 20 tons each

### Food Cases
- Consumed by men and troops on planets
- 1 food case per 100 men per production cycle
- 1 food case per 100 troops per production cycle
- Starvation kills 1/8th of population

### Fighters
- Planetary defense and attack
- Used in planetary combat calculations

### Decoys
- Deployed from ship during combat
- Reduce (not eliminate) chance of being hit by torpedoes and missiles
- Ephemeral — last for a limited time (DECOYTIME = 15 × TICKTIME)

### Troops
- Planetary defense and attack
- Used in planetary combat calculations
- Lighter than fighters (2 tons vs 15 tons)

### Zippers
- Trigger nearby mines
- Useful for clearing mine fields or as an offensive weapon

### Jammers
- Blocks scanners of ALL ships in the area including the deploying ship
- Mainly defensive — cover a retreat
- Can be used offensively for surprise attacks
- Stack multiple jammers for longer jamming duration

### Mines
- Deployed in space
- Damage ships that pass through them
- CPU Cybertrons use mines aggressively

### Gold
- Sell at planets for cash
- Increases planetary production when deposited
- Very light (0.5 tons) — good cargo for small ships
- Converted to cash during planet production cycle

### Spies
- Deployed to enemy planets
- Return intelligence about planet contents and defenses

## Commands

- `BUY [item] [quantity]` — purchase items while orbiting a planet
- `SELL [item] [quantity]` — sell items while orbiting a planet
- `JET [item] [quantity]` — jettison items into space
- `TRN [item] [quantity]` — transfer items to/from planet while orbiting
- `PRI` — show current prices at this planet
