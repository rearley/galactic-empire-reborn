/** Same limit the onboarding validator applies to player-chosen names. */
const MAX_SHIPNAME = 19;

/**
 * Names a newly purchased hull.
 *
 * C calls every purchased ship " <NO NAME> " (GEFUNCS.C:194 `initshp`) and
 * expects the captain to `ren` it — it keys ships by (userid, shipno) and has no
 * unique-name index. This port does have one (`Ship_shipname_lower_idx`, global
 * and case-insensitive), so a fixed placeholder is impossible and the obvious
 * `${typeName} #${shipno}` is not safe either: `shipno` counts the captain's own
 * fleet, so two captains buying their second Stealth Fighter both produced
 * "Stealth Fighter #2" and the second insert failed with P2002.
 *
 * `attempt` lets the caller step aside for a name already taken; each attempt
 * yields a distinct name within the 19-character limit.
 */
export function buildPurchasedShipName(
  typeName: string,
  shipno: number,
  attempt: number,
): string {
  // Suffix disambiguates retries: '', 'b', 'c', ... appended to the number.
  const suffix = attempt === 0 ? '' : String.fromCharCode('a'.charCodeAt(0) + attempt);
  const tail = ` #${shipno}${suffix}`;
  // The number identifies the hull to its owner, so the class name gives way.
  const head = typeName.slice(0, Math.max(1, MAX_SHIPNAME - tail.length)).trimEnd();
  return `${head}${tail}`;
}
