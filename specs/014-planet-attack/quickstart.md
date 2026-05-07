# Quickstart — Feature 014 Manual Verification

End-to-end manual smoke path that exercises every command shipped in
this feature. Run after `/speckit-implement` finishes. Assumes the
backend is running locally (`pnpm --filter backend dev`) with a
freshly seeded galaxy and two test players: `attacker` and `defender`.

---

## 0. Prep

```bash
# Reset the galaxy to a deterministic seed
pnpm --filter backend prisma migrate reset --force
pnpm --filter backend run seed:dev

# Open two terminal sessions or browser tabs:
#   Tab A: log in as `attacker`
#   Tab B: log in as `defender`
```

In the seed script, place a planet `Tarkus` at sector `(5,5)` plnum `0`,
owner `defender`, password `secret`, items: 1000 troops, 50 fighters,
500 men, 100 ore, baseprice/markup populated. Place `attacker`'s ship
in sector `(5,5)` orbit-ready with cargo `[I_TROOPS=2000,
I_FIGHTER=200]`, ship class `Battleship` (`max_attk=1`). Place
`defender`'s ship somewhere else (irrelevant; they only need an open
session for the alert path).

---

## 1. `pln` — sanity check (defender)

In Tab B (defender):

```
> pln
PLANETS YOU OWN:
Tarkus               ( 5, 5)  #  0
```

✅ Expected: one row, sorted by plnum ascending (FR-014-040).

In Tab A (attacker):

```
> pln
You don't own any planets.
```

✅ Expected: empty-state line (FR-014-041).

---

## 2. `pri` — quote at orbited planet (attacker)

Attacker enters orbit:

```
> orb 0
Now in orbit around Tarkus.

> pri
men   @ 50 cr ea
ore   @ 100 cr ea
troops@ 25 cr ea
fighters@ 200 cr ea
```

✅ Expected: bare `pri` lists every sellable item (FR-014-052).

```
> pri 100 men
100 men @ 50 cr ea = 5000 cr total
```

✅ Expected: PRICE1 quote, no cash deducted, no inventory change
(FR-014-051). Verify by typing `who` and confirming attacker's cash is
unchanged.

```
> pri 999999 men
Insufficient cash for that purchase.
```

✅ Expected: BUY2 emitted (FR-014-053f).

---

## 3. `mai` password gate (attacker)

Attacker tries maintenance on the foreign planet:

```
> mai
This planet requires a password.
```

✅ Expected: MAINT2 (FR-014-060). Verify cash unchanged.

```
> mai wrong
Incorrect password.
```

✅ Expected: MAINT3 (FR-014-061). Verify cash unchanged.

```
> mai secret
Maintenance complete: repaired N points.
```

✅ Expected: existing feature-013 maintenance flow runs (FR-014-063).
Cash debited per the existing maintenance price.

(For the no-password sentinel: re-seed the planet with `password =
"none"` and verify bare `mai` works.)

---

## 4. `att N troops` — partial attack (attacker)

```
> att 500 troops
Defender fighters destroyed 23 troops.
Defender ground troops killed 47 more.
You lost 70 troops; defenders lost 12 troops.
Your attack stalled — defenders held the planet.
```

✅ Expected:
- Cargo deduction: attacker.cargo[I_TROOPS] now = 1500 (was 2000).
- Combat narration in source order (FR-014-010, FR-014-011, FR-014-013).
- Surviving attackers (`left1 = 500 - 70 = 430`) returned to cargo
  → attacker.cargo[I_TROOPS] = 1930 (FR-014-018).
- planet.items[I_TROOPS] = 988 (was 1000, lost 12) (FR-014-018).
- Defender (Tab B) saw `event.log` with `ALERT: Tarkus (5,5) attacked
  by 500 troops from <ship> commanded by attacker` (FR-014-029a — owner
  online path).
- defender's mailbox has 1 new mail of type MESG02 (FR-014-030).

Verify mail:

```sql
SELECT type, body FROM "MailStat" WHERE recipient_userid = 'defender' ORDER BY created_at DESC LIMIT 1;
-- => MESG02 / "Tarkus in sector (5,5) was attacked by 500 troops..."
```

---

## 5. `att N troops` — overwhelming attack (capture)

```
> att 1500 troops
Defender fighters destroyed 18 troops.
Defender ground troops killed 32 more.
You lost 50 troops; defenders lost 988 troops.
Your troops have overrun the defenders!
You have captured Tarkus.
```

✅ Expected:
- Cargo deduction: attacker.cargo[I_TROOPS] = 430 (post-step-4) - 1500 → ERROR (cargo insufficient).

Adjust the test: re-seed with attacker.cargo[I_TROOPS] = 5000 first,
then issue `att 4500 troops`. Confirm:
- planet.userid = `attacker` (FR-014-026).
- attacker's WarUser.planets incremented by 1.
- ship.hostile = 0 after capture.
- defender's mailbox has type MESG03 mail (FR-014-030 win branch).
- High-ratio path triggered item destruction on the planet (verify
  planet.items[I_MEN] / I_ORE decreased) (FR-014-016).

```
> pln
PLANETS YOU OWN:
Tarkus               ( 5, 5)  #  0
```

(attacker now owns it.)

---

## 6. `att N fighters` — fighter attack (separate planet)

Re-seed planet `Vulcan` at `(7,8)` plnum `0`, owner `defender`,
fighters 30, troops 600. Move attacker into orbit.

```
> att 50 fighters
Ground anti-air shot down 4 fighters.
Defender fighters destroyed 18 of yours.
You lost 22 fighters; defenders lost 12 fighters.
```

✅ Expected:
- Ground-fire branch fired (FR-014-020) — verified by the narration
  line.
- Defender fighters return-fire (FR-014-021).

Now attack a defender-fighterless planet (the bug-preservation
verification):

Re-seed planet `Endor` at `(9,3)` plnum `0`, owner `defender`,
fighters 0, troops 100. Orbit and:

```
> att 50 fighters
You lost 0 fighters; defenders lost 0 fighters.
```

✅ Expected (the documented bug):
- No ground-fire narration (`ratio == 0` skips the gate).
- No return-fire narration (no defender fighters).
- No item destruction.
- No win (planet.items[I_TROOPS] = 100, not < 5).
- No mail.
- No alert.
- All 50 fighters returned to cargo.

This is FR-014-019 / SC-008 confirmed live.

---

## 7. Concurrent attack (two-tab race)

Re-seed planet `Hoth` at `(2,2)` plnum `0`, owner `defender`, troops
3000. Log in as a third player `raider` in Tab C with cargo
[I_TROOPS=10000].

In Tab A (attacker, cargo 5000): orbit Hoth.
In Tab C (raider): orbit Hoth.

Tab A executes `att 4000 troops`. **While that command is resolving**,
Tab C executes `att 8000 troops`.

✅ Expected:
- Tab C blocks on the per-planet mutex (D1).
- Tab A's attack resolves first; if it captures, planet.userid =
  `attacker`.
- Tab C acquires the lock, re-validates preconditions; the self-attack
  check FAILS (because Tab A captured) → Tab C's command rejects with
  the self-attack error and **no cargo is deducted from Tab C**.

---

## 8. Cleanup

```bash
pnpm --filter backend prisma migrate reset --force
```

If all eight steps above pass, FR-014-001 through FR-014-063 are
exercised end-to-end and SC-001..SC-009 are demonstrated.
