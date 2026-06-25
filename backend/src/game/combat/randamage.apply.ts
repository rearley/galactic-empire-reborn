import { SHIELDDM } from '../constants';
import { Random } from './random.port';
import { RandamageCaps, RandamageResult, RandamageSubsystem, rollRandamage } from './combat-math';
import { ShipState, shipKey } from '../ship/ship-state.types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipClassCacheService } from '../physics/ship-class-cache.service';
import { COMBAT_SUBSYSTEM_DAMAGED } from './combat-events';

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
  if (shieldtype === 20) return { subsystem: 'skipped', magnitude: 0 };

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
    case 'skipped':
      break;
  }

  return result;
}

/**
 * Roll + apply subsystem damage to `victim` and emit COMBAT_SUBSYSTEM_DAMAGED
 * when a real subsystem is hit. Centralises the per-hit-site logic that was
 * previously copy-pasted across 7 weapon-hit sites.
 *
 * Caps are read from the cache for the victim's class; each getter is wrapped
 * defensively — test mocks may not implement every getter, while production
 * getters never throw. A thrown getter degrades that capability to false.
 *
 * @see GEFUNCS.C:randamage line 1956
 */
export function applyRandamageAndEmit(
  random: Random,
  events: EventEmitter2,
  cache: ShipClassCacheService,
  victim: ShipState,
  sector: { x: number; y: number },
  tickAt: Date,
): { subsystem: RandamageSubsystem; magnitude: number } {
  const caps: RandamageCaps = { hasShields: false, hasPhasers: false, hasTorpOrMissile: false, hasCloak: false };
  try { caps.hasShields = cache.getMaxShields(victim.shpclass) > 0; } catch { /* test mock */ }
  try { caps.hasPhasers = cache.getMaxPhaser(victim.shpclass) > 0; } catch { /* test mock */ }
  try { caps.hasTorpOrMissile = cache.getHasTorpedo(victim.shpclass) || cache.getHasMissile(victim.shpclass); } catch { /* test mock */ }
  try { caps.hasCloak = cache.getHasCloak(victim.shpclass); } catch { /* test mock */ }
  const result = applyRandamage(random, victim, caps, victim.shieldtype);
  if (result.subsystem !== 'none' && result.subsystem !== 'skipped') {
    events.emit(COMBAT_SUBSYSTEM_DAMAGED, {
      victimId: shipKey(victim.userid, victim.shipno),
      subsystem: result.subsystem,
      sector,
      tickAt,
    });
  }
  return result;
}
