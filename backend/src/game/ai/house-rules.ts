/**
 * The port's AI house rules: every AI behaviour that is OURS rather than
 * canon's, one named switch each.
 *
 * Canon is the source of truth, and a deviation is allowed only when it is
 * deliberate, written down in `docs/DECISIONS.md`, and justified by something
 * other than taste. Scattered through the code as `PORT-ORIGINAL` comments, the
 * AI's deviations could only be found by reading all of it. Here they are
 * listed once, each with the DECISIONS entry that justifies it, and each can be
 * switched off — so the AI can be run as canon's, and compared with ours.
 *
 * Production runs `PORT_RULES`, every rule on. `CANON_RULES` turns every rule
 * off: what remains is the canon AI. Every `PORT-ORIGINAL` marker in the AI code
 * names the rule it belongs to (`@house-rule <name>`), and
 * `test/game/ai/house-rules.spec.ts` fails on a marker that does not, or on a
 * rule nothing reads.
 *
 * Adding a rule: add the switch here and its DECISIONS heading below, read it
 * where the behaviour acts, tag that site's `PORT-ORIGINAL` comment, and give it
 * an on/off test. @see issue #63
 */
export interface AiHouseRules {
  /**
   * The neutral zone is a sanctuary from Cybertrons: a pilot inside sector
   * (0,0) cannot be claimed, a claim on a pilot who flies in is released, and a
   * target inside it is not engaged. Canon's only neutral test is the hunter's
   * own position, GECYBS.C:251 `if (!neutral(&ptr->coord)`, so a canon
   * Cybertron locks a pilot on the hub, flies to them and shadows them there.
   */
  zoneSanctuary: boolean;
  /**
   * A killed Cybertron class stays empty for a hold scaled by its rarity.
   * Canon has no respawn delay: it refills whichever slot it examines next.
   */
  respawnHold: boolean;
  /**
   * When a pilot dies, every Cybertron claim on them is released at the kill.
   * Canon's `killem` releases only the killer's claim,
   * GEFUNCS.C:1113 `shipclass[wptr->shpclass].won_func(wptr,who,ptr);`, and
   * lets the rest lapse on their holders' next activation.
   */
  releaseClaimsOnDeath: boolean;
  /**
   * A droid never spawns inside the neutral zone. Canon places them anywhere,
   * with no zone test: GEDROIDS.C:131 `if (univmax < 20)` and its two arms.
   */
  droidsSpawnOutsideZone: boolean;
  /**
   * The Cybertron population scales with the galaxy we deploy (UNIVMAX 100)
   * rather than canon's 300. A no-op at canon's size.
   */
  scalePopulation: boolean;
  /**
   * A Cybertron's close band — where it drops to 990 and brawls — starts at its
   * own firing range when that is shorter than canon's 3.0 sectors
   * (GECYBS.C:787 `if (low_dist <= 3.0)`). The Cyberquad can only shoot from a
   * tenth of a sector (S22SRNG 1000), so canon has it amble the last three
   * sectors at walking pace, which a stopped pilot can exploit for a minute.
   */
  closeBandAtFiringRange: boolean;
}

/**
 * Nest token for the rules. Nothing binds it in production, so every consumer's
 * `@Optional()` default — `PORT_RULES` — is what runs; a test or the galaxy
 * simulation passes `CANON_RULES` by hand.
 */
export const AI_HOUSE_RULES = Symbol('AI_HOUSE_RULES');

/** What production runs: every house rule on. */
export const PORT_RULES: Readonly<AiHouseRules> = Object.freeze({
  zoneSanctuary: true,
  respawnHold: true,
  releaseClaimsOnDeath: true,
  droidsSpawnOutsideZone: true,
  scalePopulation: true,
  closeBandAtFiringRange: true,
});

/** Canon's AI: every house rule off. */
export const CANON_RULES: Readonly<AiHouseRules> = Object.freeze({
  zoneSanctuary: false,
  respawnHold: false,
  releaseClaimsOnDeath: false,
  droidsSpawnOutsideZone: false,
  scalePopulation: false,
  closeBandAtFiringRange: false,
});

/** The `docs/DECISIONS.md` heading that justifies each rule, verbatim after `## `. */
export const HOUSE_RULE_DECISIONS: Readonly<Record<keyof AiHouseRules, string>> = Object.freeze({
  zoneSanctuary: '2026-09-20 — The neutral zone blinds Cybertrons to pilots inside it, but not to the galaxy outside',
  respawnHold: '2026-09-20 — Cybertron rarity is re-expressed as respawn time',
  releaseClaimsOnDeath: "2026-09-21 — A Cybertron's claim changes only through a named transition",
  droidsSpawnOutsideZone: '2026-09-01 — Droids stay out of the neutral zone',
  scalePopulation: '2026-09-08 — AI population scales with UNIVMAX; HYPDST1/HYPDST2 wired',
  closeBandAtFiringRange: '2026-09-21 — A Cybertron closes to its own firing range before it slows to fight',
});
