/**
 * Validates a ship name per cmd_rename character rules.
 *
 * Canon: `rstrin(); strncpy(warsptr->shipname, margv[1], 19)`
 * (GECMDS.C:5002-5010). `rstrin()` restores the input line that the argument
 * tokeniser split apart, so `margv[1]` reads to the END OF THE LINE rather
 * than stopping at the first space — the standard MajorBBS idiom, and the same
 * one `cmd_send` uses so that `sen A hello there` sends both words.
 *
 * Interior spaces are therefore legal and always were. This rejected them,
 * which is why `ren BigCat II` produced a ship called "BigCat" and said
 * nothing about the half it dropped.
 *
 * Leading and trailing spaces are still refused. Canon cannot produce one —
 * the parser has already eaten the separator before `margv[1]` begins — and
 * the callers trim, so a padded name arriving here is a bug in the caller.
 */
export function isValidShipName(name: string): boolean {
  // 1-19 printable ASCII (0x20-0x7E), no control chars, no tabs, not padded.
  return /^[\x20-\x7E]{1,19}$/.test(name) && name.trim() === name;
}
