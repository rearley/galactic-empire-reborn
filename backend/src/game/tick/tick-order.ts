/**
 * The order handlers run in on a tick, because canon's order is load-bearing.
 *
 * `warrtia` is ONE function and its sequence is a fixed list (GEMAIN.C:2256-2267):
 *
 *   fluxstat, repairship, shieldstat, cloakstat,
 *   checktm, fireion, recharge, checkdam
 *
 * That list is not arbitrary. `fluxstat` reloads a pod when energy falls below
 * ENGYMIN, and it runs FIRST specifically so that everything downstream sees a
 * refilled tank. `cloakstat` then drops the cloak when energy is under
 * CLENGUSE. Run them the other way round and a cloaked ship dies at zero power
 * with a full hold of pods, and the reload lands a moment too late to matter.
 *
 * This port split `warrtia` across services, and until this file existed the
 * sequence was whatever order Nest happened to construct them in — an emergent
 * property of the DI graph, not a decision. It came out backwards for exactly
 * that pair, and it was found by a player watching his cloak fail with fifteen
 * pods aboard:
 *
 *   cloak 7,500/tick + Mark-7 shields 700/tick, from a full 65,000 tank
 *   -> zero after eight ticks
 *   -> cloak tested first, shuts down
 *   -> flux fires, refills to 65,000
 *   -> shields take 700, recharge adds 1
 *   -> ship observed at 64,301 with the cloak off.  Exactly as predicted.
 *
 * Lower numbers run earlier. The gaps are deliberate: a new handler slots
 * between two existing ones without renumbering, and its position becomes a
 * decision someone writes down rather than an accident of module order.
 */
export const TickOrder = {
  /** `fluxstat` — reload a pod before anything can starve. GEMAIN.C:2256 */
  FLUX: 100,
  /** `repairship`, `shieldstat` — restorative pass. GEMAIN.C:2257-2258 */
  RESTORE: 200,
  /** `cloakstat` — the cloak upkeep and starvation test. GEMAIN.C:2259 */
  CLOAK: 300,
  /** `checktm` — torpedo, missile and decoy flight. GEMAIN.C:2264 */
  PROJECTILES: 400,
  /** AI brains, which fire weapons and so must see settled state. */
  AI: 500,
  /** Anything with no ordering requirement of its own. */
  DEFAULT: 1000,
} as const;

export type TickOrderValue = (typeof TickOrder)[keyof typeof TickOrder];
