# Colonizing Planets

Source: https://manicpop.org/gewiki/index.php?title=Colonizing_planets

## Finding a Planet

- Use sector scans while traveling to find planets in your current sector
- Sectors can have 1–9 planetary objects (including wormholes)
- Default max planets per sector: 5 (MAXPLSE)
- Use planet scans to check attributes once in a sector with planets

### Planet Quality Ratings
- **Very Good** — highest production, holds most items
- **Good**
- **Marginal**
- **Poor** — lowest production

### Tips for Choosing a Planet
- Better environment + resources = higher production multiplier
- Pre-inhabited planets (small quantities of men/food already present)
  are easier to start with
- Planets closer to sector center are harder for attacking ships to escape
  from if equipped with sector-firing ion cannons

## Claiming a Planet

Orbit an unclaimed planet and use the ADMIN command to establish a colony.
Transfer men (minimum required) to claim it.

Command: `ADM` while orbiting

## Abandoning a Planet

Renounce your claim to a planet you own.

- Must be orbiting the planet
- Planet reverts to no owner — anyone can claim it
- Planet removed from your planet list
- You lose points allocated for that planet's population

Command: `ABANDON` or `ABA`

## Planetary Defense

### Ion Cannons
- Fire at attacking ships in the sector
- Can be set to fire automatically
- Very heavy cargo (250 tons each)
- Build up ion cannons before expecting attacks

### Fighters
- Used in planetary combat calculations when a planet is attacked
- Lighter than ion cannons, cheaper to produce

### Troops
- Used in planetary combat calculations
- Must be fed (1 food case per 100 troops per cycle) or 1/8th perish

## Production Cycle

The production cycle runs on the physics tick. Here is the exact calculation:

### Step 1: Troop Food Consumption
- 1 food case consumed per 100 troops
- If insufficient food: 1/8th of all troops perish, food set to zero
- If sufficient food: food reduced by 1 per 100 troops
- Fewer than 100 troops: no food consumed, no troops perish

### Step 2: Men Food Consumption
- If insufficient food (1 food case per 100 men): 1/8th of all men perish
- Fewer than 100 men: no food consumed, no men perish
- Note: due to an apparent game bug, men don't actually consume food

### Step 3: Tax Rate Factor
- Tax factor = 1 - (tax_rate / 120)
- 0% tax = 100% production
- 100% tax = 16.66% production

### Step 4: Gold Conversion
- Gold on the planet converts to cash at the planet's base gold price (default: 1000)

### Step 5: Item Production (per item, 14 items total)

**Base production quantity:**
```
qty = (men × (effort_rate / 100) × (production_rate / 10000) / 6) / 7
```

Simplified:
```
qty = men × production_rate × effort_rate_as_integer / 42,000,000
```

Example: 100,000 men, 10% effort on torpedoes (rate 500):
`(100000 × (10/100) × ((500/10000)/6)) / 7 = 11.9 torpedoes per cycle`

**Environment/Resources multiplier:**
- Poor=0, Marginal=1, Good=2, Very Good=3
- Factor = (environment + resources + 2) / 4
- Example: Good/Marginal = (2 + 1 + 2) / 4 = 1.25×

**Combined production factor:**
- tax_factor × environment_factor
- Example: Good/Marginal planet with 10% tax:
  `(1 - 10/120) × 1.25 = 0.9166 × 1.25 = 1.145833`

**Cash reserve reduction (per item cycle):**
- keep_percentage = 95 - ((6 - environment - resources) × 10)
- VG/VG planet: keeps 95% of cash per item
- P/P planet: keeps 35% of cash per item
- This runs 14 times (once per item), so cash drains quickly

**Cash bonus:**
- If planet has cash in the bank: production factor increased by 1.5×
- Cash is consumed as items are produced

Example with 10,000 cash on Good/Marginal planet:
- Men produced 1.5×, cash → 6,500
- Missiles produced 1.5×, cash → 4,225
- Torpedoes 1.5×, cash → 2,746
- ... (continues for all 14 items)

### Step 6: Maximum Item Capacity
- Each planet has a maximum it can hold based on environment/resources
- Production stops when at capacity

## List of Owned Planets

View your planets and their status.

Command: `PLN`

## Administration

Manage a planet's settings while orbiting.

Command: `ADM`

Options include:
- Set tax rate
- Set production effort allocation per item type
- Set trade password
- Transfer items

## Orbit

Enter orbit around a planet to interact with it.

Command: `ORB [planet number]`
