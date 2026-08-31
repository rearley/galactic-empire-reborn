/** Same limit the onboarding validator applies to player-chosen names. */
const MAX_SHIPNAME = 19;

/** Cheap, stable string hash — only needs to spread owners across buckets. */
function hash36(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Names a newly purchased hull.
 *
 * C calls every purchased ship " <NO NAME> " (GEFUNCS.C:194 `initshp`) and
 * expects the captain to `ren` it — it keys ships by (userid, shipno) and has no
 * unique-name index. This port does have one (`Ship_shipname_lower_idx`, global
 * and case-insensitive), so a fixed placeholder is impossible and the obvious
 * `${typeName} #${shipno}` is not safe either: `shipno` counts the captain's own
 * fleet, so every captain buying their second Stealth Fighter produced
 * "Stealth Fighter #2" and the second insert failed with P2002.
 *
 * The first attempt keeps the clean name — first captain to buy one gets it.
 * Later attempts append characters of a hash of `ownerKey`, so the alternatives
 * differ per captain rather than being the same short list for everyone: a
 * fixed ladder of five suffixes only tolerated five captains per class before
 * purchases started failing outright.
 */
export function buildPurchasedShipName(
  typeName: string,
  shipno: number,
  attempt: number,
  ownerKey = '',
): string {
  const suffix = attempt === 0
    ? ''
    : `-${hash36(`${ownerKey}:${shipno}`).slice(0, attempt + 1)}`;
  const tail = ` #${shipno}${suffix}`;
  // The number identifies the hull to its owner, so the class name gives way.
  const head = typeName.slice(0, Math.max(1, MAX_SHIPNAME - tail.length)).trimEnd();
  return `${head}${tail}`;
}
