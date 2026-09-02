/**
 * Resolves `adm password <word|none|team>` into the planet's stored password
 * and team lock.
 *
 * C branches three ways (GEMAIN.C:3266-3290):
 *
 *   if (sameas(plptr->password,"none"))  { plptr->teamcode = 0; }
 *   else if (sameas(plptr->password,"team")) {
 *       if (waruptr->teamcode > 0) plptr->teamcode = waruptr->teamcode;
 *       else { plptr->teamcode = 0; plptr->password[0] = 0; }
 *   }
 *   else { plptr->teamcode = 0; }
 *
 * The port stored the word and never touched `teamcode`, which left the whole
 * team-access path inert — and let `adm password team` from a teamless owner
 * stand as an ordinary password, so anyone who typed "team" could land. C
 * wipes the password in that case precisely to avoid it.
 */
export type PlanetPasswordOutcome = 'cleared' | 'team-set' | 'team-refused' | 'password-set';

export interface PlanetPasswordResult {
  password: string;
  teamcode: bigint;
  outcome: PlanetPasswordOutcome;
}

export function resolvePlanetPassword(
  value: string,
  ownerTeamcode: bigint | null | undefined,
): PlanetPasswordResult {
  const word = (value ?? '').trim();
  const lower = word.toLowerCase();

  if (lower === 'none') {
    return { password: word, teamcode: 0n, outcome: 'cleared' };
  }

  if (lower === 'team') {
    const team = ownerTeamcode ?? 0n;
    if (team > 0n) {
      return { password: word, teamcode: team, outcome: 'team-set' };
    }
    // C clears BOTH — `plptr->teamcode = 0; plptr->password[0] = 0;`
    return { password: '', teamcode: 0n, outcome: 'team-refused' };
  }

  return { password: word, teamcode: 0n, outcome: 'password-set' };
}
