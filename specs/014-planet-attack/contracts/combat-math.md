# Combat Math Contract — Feature 014

Pseudocode-faithful reproduction of `cmd_attack`'s troop branch and
`attack_fig`'s fighter branch from `GECMDS.C`. The TypeScript
implementation in `planet-attack.service.ts` MUST follow this contract
exactly. SC-004 (deterministic-seed trace test) verifies byte-for-byte
agreement against the C reference.

All `rndm(N)` calls return floating-point in `[0, N)`. All `(unsigned
long)` casts in the C source map to `Math.floor(...)` in TypeScript —
applied at the same step in the same order.

---

## Troop attack — `attackTroop(num, ship, planet)`

```
let left1 = num                              # surviving attacker troops
let left2 = planet.items[I_TROOPS].qty       # surviving defender troops
let kill1 = 0                                # attacker losses this round
let kill2 = 0                                # defender losses this round

# Step 1: defender fighters fire first
let fighters = planet.items[I_FIGHTER].qty
if fighters > 1:
    kill1 = ((gernd() % 35) + 9) * fighters
    if kill1 > left1: kill1 = left1
    emit narration: "Defender fighters destroyed %d troops"

# Step 2: ground troops engage
let groundKills = floor(left2 * (rndm(plattrt1) + 0.25))
kill1 += groundKills
emit narration: "Defender ground troops killed %d more"

# Step 3: ratio-based attacker counter-kill
let ratio = (left2 > 0) ? (left1 / left2) : 0       # integer division in C
if ratio > 2:
    kill2 = floor(left1 * (rndm(plattrt2) + 0.1))
else:
    kill2 = 0

# Step 4: cap and apply
if kill1 > left1: kill1 = left1
if kill2 > left2: kill2 = left2
left1 -= kill1
left2 -= kill2
emit narration: "You lost %d troops; defenders lost %d troops"

# Step 5: outcome branching (in this exact order)
let won = 0

if left2 > 0 && left2 < left1 / 4:
    won = 1
    emit "Your troops have overrun the defenders"

else if left1 > 0 && left1 < left2 / 4:
    emit "Your remaining troops surrender to the defenders"
    planet.items[I_TROOPS].qty += left1   # defectors join planet
    left1 = 0

else if left1 > 0 && left2 == 0 && planet.items[I_FIGHTER].qty == 0:
    won = 1                                # full wipe-out — also a win

# Step 6: high-ratio item destruction
if ratio > 2 && left1 > left2 / 2:
    for each item in planet.items where item.kind != I_TROOPS:
        let destroyed = min(gernd() % 15, item.qty)
        if destroyed > 0:
            item.qty -= destroyed
            emit "%d %s on the planet were destroyed" (destroyed, item.name)

# Step 7: persist and return
planet.items[I_TROOPS].qty = left2
ship.items[I_TROOPS].qty += left1

# Step 8: notification + spy roll
if ratio > 1:
    callForHelp(planet, ship, kind=TROOP, num, won, sendSpyMail = (ratio > 5))

# Step 9: mail
if ratio > 1:
    let mailType = (won == 1) ? MESG03 : MESG02
    insertMail(planet.userid, mailType, planet.name, planet.xsect, planet.ysect, num, ship.shipname, ship.userid)

# Step 10: ownership transfer
if won == 1:
    planet.userid = ship.userid
    ship.hostile = 0
    WarUser[ship.userid].planets += 1

return won
```

### Notes

- `ratio` is **integer division** in the C source (both operands are
  `unsigned long`). TypeScript uses `Math.floor(left1 / left2)` for the
  same semantics. Note: this differs from the *fighter* branch's ratio
  computation, which is floating-point.
- The `left1 < left2/4` retreat branch uses **integer division** for
  `left2/4` — `Math.floor(left2 / 4)`.
- Step 6 uses `gernd() % 15` (range 0..14) per FR-014-016.
- All `floor(...)` conversions match `(unsigned long)` casts in the C
  source — apply BEFORE the cap step.

---

## Fighter attack — `attackFighter(num, ship, planet)`

```
let left1 = num                              # surviving attacker fighters
let left2 = planet.items[I_FIGHTER].qty      # surviving defender fighters
let kill1 = 0
let kill2 = 0

# Step 1: ratio compute (FLOATING POINT — note the bug)
let ratio = (left2 > 0) ? ((left1 / left2) * 100) : 0

# Step 2: ground anti-air (only if planet has > 500 troops AND random gate)
if left1 > 0 && planet.items[I_TROOPS].qty > 500 && (gernd() % 5 - 1) > 0:
    let groundShootdown = floor(left1 * (rndm(plattrf1) + 0.05))
    kill1 += groundShootdown
    emit "Ground anti-air shot down %d fighters"

# Step 3: defender fighters return-fire
if left2 > 0:
    let returnFire = floor(left2 * (rndm(plattrf2) + 0.2))
    kill1 += returnFire
    emit "Defender fighters destroyed %d of yours"

# Step 4: attacker counter-kill (gated by ratio > 1)
if left2 > 0 && ratio > 1:
    kill2 = floor(left1 * (rndm(plattrf3) + 0.2))
else:
    kill2 = 0

# Step 5: cap and apply
if kill1 > left1: kill1 = left1
if kill2 > left2: kill2 = left2
left1 -= kill1
left2 -= kill2
emit "You lost %d fighters; defenders lost %d fighters"

# Step 6: outcome
let won = 0
if left1 > 0 && left2 == 0 && planet.items[I_TROOPS].qty < 5:
    won = 1
    emit "You have wiped out the planet's defenders"

# Step 7: high-ratio item destruction (NOT REACHED when left2 == 0 — the bug)
if ratio > 5:
    for each item in planet.items where item.kind != I_FIGHTER:
        let destroyed = min(gernd() % 15, item.qty)
        if destroyed > 0:
            item.qty -= destroyed
            emit "%d %s on the planet were destroyed" (destroyed, item.name)

# Step 8: persist and return
planet.items[I_FIGHTER].qty = left2
ship.items[I_FIGHTER].qty += left1

# Step 9: notification + spy roll
if ratio > 1 || won == 1:
    callForHelp(planet, ship, kind=FIGHTER, num, won, sendSpyMail = (ratio > 5))

# Step 10: mail
if ratio > 2 || won == 1:
    let mailType = (won == 1) ? MESG05 : MESG04
    insertMail(planet.userid, mailType, planet.name, planet.xsect, planet.ysect, num, ship.shipname, ship.userid)

# Step 11: ownership transfer
if won == 1:
    planet.userid = ship.userid
    ship.hostile = 0
    WarUser[ship.userid].planets += 1

return won
```

### Notes — fighter ratio bug (FR-014-019, SC-008)

The C source computes `ratio = (left1 / left2) * 100` with no
zero-check guard for `left2 == 0`. In the original, `left2 == 0` causes
`ratio = 0` (the `(left2 > 0) ? ... : 0` ternary above models this
behavior post-bug-preservation), which means:

- Step 2's ground-fire is skipped (gated by `ratio > 1` in some
  interpretations — actually gated by the troop count, but the `ratio
  > 1` check in Step 4 is what matters here).
- Step 4's attacker counter-kill is skipped (gated by `ratio > 1`).
- Step 7's item destruction is skipped (gated by `ratio > 5`).

Combined with Step 6's win check (`left2 == 0 && troops < 5`), this
means an attack that walks into a defender-fighterless planet with > 4
troops produces NO combat narration, NO item destruction, NO win, NO
mail, NO alert — and only Step 8's persist-and-return ever runs.

**This is intentional behavior preservation, not a bug to fix.** The
test in `attack-fighter-math.spec.ts` asserts this exact outcome and
fails if "fixing" the ratio computation removes the quirk.

---

## `callForHelp(planet, ship, kind, num, won, sendSpyMail)`

```
# Owner real-time alert
if planet.userid is online (room user:${planet.userid} non-empty at this instant):
    emit to room user:${planet.userid}:
        "ALERT: %s (%d,%d) attacked by %d %s from %s commanded by %s"
        (planet.name, planet.xsect, planet.ysect, num, kind, ship.shipname, ship.userid)
    # disconnect race: if room empties before emit, silent drop

# Spy intel mail roll
if sendSpyMail && planet.spyowner != "":
    if won == 1 || (gernd() % 6 == 0):
        insertMail(
            recipient = planet.spyowner,
            type = (kind == TROOP ? MESG02 : MESG04),
            class = MAIL_CLASS_DISTRESS,
            body = same payload as owner mail
        )
```

Note: the alert and the spy mail are independent — both, either, or
neither may fire on a given call (D4).

---

## `wonplnt(planet, ship)` — ownership transfer

```
planet.userid = ship.userid
ship.hostile = 0
WarUser.findOrCreate(ship.userid).planets += 1
```

Inlined in step 10/11 of the math above; this section exists for
implementer reference.
