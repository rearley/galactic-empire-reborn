/**
 * Whether the dev-only debug controllers should be mounted.
 *
 * These are cheat endpoints with no authentication of any kind, and they act on
 * a ship *by name* — so anyone able to reach the port could teleport another
 * player's ship, swap its hull class, zero its damage, hand themselves
 * ordnance, rewrite any captain's credit balance, or spawn droids. They exist
 * because staging an engagement or a 500,000-credit purchase through normal
 * play costs minutes per attempt.
 *
 * The gate used to be `NODE_ENV !== 'production'`, which fails OPEN: a bare
 * `node dist/src/main`, a systemd unit, or any host that does not set NODE_ENV
 * published the lot. This fails CLOSED — the endpoints are absent unless
 * someone explicitly asks for them — and refuses outright in production even
 * when asked, so a stray environment variable cannot switch them on there.
 *
 * Local development turns them on through the `start:dev` script; `npm start`
 * deliberately does not.
 */
const AFFIRMATIVE = new Set(['1', 'true', 'yes', 'on']);

export function debugEndpointsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env['NODE_ENV'] ?? '').toLowerCase() === 'production') return false;
  return AFFIRMATIVE.has((env['GE_DEBUG_ENDPOINTS'] ?? '').trim().toLowerCase());
}
