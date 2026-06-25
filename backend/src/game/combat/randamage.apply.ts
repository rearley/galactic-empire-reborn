import { SHIELDDM } from '../constants';
import { Random } from './random.port';
import { RandamageCaps, RandamageResult, rollRandamage } from './combat-math';
import { ShipState } from '../ship/ship-state.types';

/**
 * Applies random subsystem damage to a victim ship. Calls {@link rollRandamage}
 * then mutates the victim's field for the chosen subsystem.
 *
 * Skipped entirely when `shieldtype === 20` (special/invulnerable shield class).
 * Shield hit also sets `shieldstat = SHIELDDM` (3).
 *
 * @see GEFUNCS.C:randamage line 1956
 */
export function applyRandamage(
  rand: Random,
  victim: ShipState,
  caps: RandamageCaps,
  shieldtype: number,
): RandamageResult {
  if (shieldtype === 20) return { subsystem: 'none', magnitude: 0 };

  const result = rollRandamage(rand, victim.damage, caps);

  switch (result.subsystem) {
    case 'shield':
      victim.shield = result.magnitude;
      victim.shieldstat = SHIELDDM;
      break;
    case 'phasor':
      victim.phasr = result.magnitude;
      break;
    case 'firecntl':
      victim.firecntl = result.magnitude;
      break;
    case 'cloak':
      victim.cloak = result.magnitude;
      break;
    case 'tactical':
      victim.tactical = result.magnitude;
      break;
    case 'helm':
      victim.helm = result.magnitude;
      break;
    case 'none':
      break;
  }

  return result;
}
