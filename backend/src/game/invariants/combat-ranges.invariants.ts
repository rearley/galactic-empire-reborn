import { Invariant, Violation } from './invariants.types';

interface CombatEventLike {
  weapon: string;
  shooter: { x: number; y: number };
  target: { x: number; y: number };
  maxRange: number;
}

function isCombatEvent(v: unknown): v is CombatEventLike {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const shooter = o.shooter as Record<string, unknown> | undefined;
  const target = o.target as Record<string, unknown> | undefined;
  return (
    typeof o.weapon === 'string' &&
    typeof o.maxRange === 'number' &&
    !!shooter &&
    typeof shooter.x === 'number' &&
    typeof shooter.y === 'number' &&
    !!target &&
    typeof target.x === 'number' &&
    typeof target.y === 'number'
  );
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Asserts every recorded weapon-fire event resolved within the weapon's max range.
 *
 * Each event carries its own `maxRange` (the caller computes it from weapon type +
 * the constants in `GEMAIN.H` / `GEFUNCS.C`). The invariant is purely about
 * "shooter is too far from target for this shot to be legal."
 *
 * @see GEFUNCS.C:cdistance
 * @see GEMAIN.H weapon range/disfact constants
 */
export const weaponFireRangeRespected: Invariant = {
  name: 'weaponFireRangeRespected',
  sourceRef: 'GEFUNCS.C:cdistance + GEMAIN.H weapon-range constants',
  run: (world): Violation[] => {
    const raw = (world.combatEvents as unknown[] | undefined) ?? [];
    const out: Violation[] = [];
    for (const item of raw) {
      if (!isCombatEvent(item)) continue;
      const d = distance(item.shooter, item.target);
      if (d > item.maxRange) {
        out.push({
          rule: 'weaponFireRangeRespected',
          sourceRef: 'GEFUNCS.C:cdistance + GEMAIN.H weapon-range constants',
          severity: 'HIGH',
          detail: `${item.weapon} fired at distance ${d.toFixed(2)} > maxRange ${item.maxRange}`,
        });
      }
    }
    return out;
  },
};
