/**
 * Validates a ship name per cmd_rename character rules.
 * @see GECMDS.C:5002 — strncpy(..., margv[1], 19) enforces 1–19 char limit
 */
export function isValidShipName(name: string): boolean {
  // 1–19 printable ASCII (0x21–0x7E, no space, no control chars)
  return /^[\x21-\x7E]{1,19}$/.test(name);
}
