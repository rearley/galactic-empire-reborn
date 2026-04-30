# Movement

Source: https://manicpop.org/gewiki/index.php?title=Movement

## Speed Units

- **Warp 1** = speed of light = 153.846153 parsecs per centock (10000 ÷ 65)
- **Impulse 1** = 1% of warp 1 = 1.538461 parsecs per centock
- A parsec is the smallest unit of distance in the game
- Speeds that are not multiples of 13 will round up/down each centock

## Physics Formula

From GEFUNCS.C lines 648-649:

```c
ptr->coord.xcoord = ptr->coord.xcoord + ((ptr->speed * sin(degtorad(ptr->heading))) / 65000.0);
ptr->coord.ycoord = ptr->coord.ycoord - ((ptr->speed * cos(degtorad(ptr->heading))) / 65000.0);
```

This runs every tick. Heading is in degrees (0–359). Speed is the current
speed value. Division by 65000.0 converts to parsecs per centock.

## Impulse Speed

At impulse, ships can:
- Raise shields
- Activate cloaking
- Deploy decoys
- Use standard phasers
- Fire torpedoes (and be hit by torpedoes)

Example speeds:
- IMP 1 = 1–2 parsecs / centock
- IMP 13 = 20 parsecs / centock
- IMP 15 = 23–24 parsecs / centock
- IMP 50 = 76–77 parsecs / centock
- IMP 65 = 100 parsecs / centock
- IMP 99 = 152–153 parsecs / centock

Command: `IMP [speed]` (1–99)

## Warp Speed

At warp, the following are NOT available:
- Shields cannot be raised
- Cloaking cannot be activated
- Decoys cannot be deployed
- Torpedoes cannot be fired or hit the ship
- Standard phasers switch to **hyperphasers**

Ships can travel at up to 150% of their rated warp speed but will take damage.

Example speeds:
- WAR 1 = 153–154 parsecs / centock
- WAR 5 = 769–770 parsecs / centock
- WAR 10 = 1538–1539 parsecs / centock
- WAR 13 = 2000 parsecs / centock
- WAR 20 = 3076–3077 parsecs / centock
- WAR 50 = 7692–7693 parsecs / centock
- WAR 65 = 10000 parsecs / centock
- WAR 75 = 11538–11539 parsecs / centock

Command: `WAR [speed]` or `WARP [speed]`

## Rotation

Ships rotate toward a target heading. Rotation costs energy.

From GEMAIN.H:
- `ROTENGUSE = 30` — energy used to rotate
- `ROTAMT = 20` — degrees of rotation per tick

Command: `ROT [degrees]` (0–359)

## Navigation

The `NAV` command sets an automatic course to a target sector coordinate.
Ship will navigate autonomously until it arrives or the command is cancelled.

Command: `NAV [x] [y]`

## Energy Costs (from GEMAIN.H)

- Rotation: 30 energy per tick while rotating
- Acceleration: 120 energy per acceleration event
- Movement: minimum 3000 energy, 10 energy per tick while moving
