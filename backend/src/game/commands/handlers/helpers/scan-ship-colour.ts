import { GESTAT_AUTO } from '../../../constants';

/**
 * Whether a scanned hull is drawn as AI or as another captain.
 *
 *   if (wptr->status == GESTAT_AUTO)  mapc[..] = '1';   // AI
 *   else                              mapc[..] = '2';   // player
 *   — GECMDS.C:2622-2625
 *
 * The scan builders tested `status === 1 ? 'ai' : 'human'`, but status 1 is
 * GESTAT_USER — a human (GEMAIN.H:210-211) — so every scan mode drew
 * Cybertrons as fellow captains and captains as Cybertrons. That is the one
 * distinction on the map that decides whether a pilot runs or waves.
 */
export function scanShipColour(status: number): 'ai' | 'human' {
  return status === GESTAT_AUTO ? 'ai' : 'human';
}
