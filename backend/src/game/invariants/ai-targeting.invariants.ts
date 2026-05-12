import { Invariant, Violation } from './invariants.types';

interface AiFireEventLike {
  shipClass: string;
  shooter: { x: number; y: number };
  target: { x: number; y: number };
  scanRange: number;
  /** Optional pre-computed `cdistance(shooter, target) * 10000` in raw coord units. */
  distanceRaw?: number;
}

function isAiFireEvent(v: unknown): v is AiFireEventLike {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const shooter = o.shooter as Record<string, unknown> | undefined;
  const target = o.target as Record<string, unknown> | undefined;
  return (
    typeof o.shipClass === 'string' &&
    typeof o.scanRange === 'number' &&
    !!shooter &&
    typeof shooter.x === 'number' &&
    typeof shooter.y === 'number' &&
    !!target &&
    typeof target.x === 'number' &&
    typeof target.y === 'number'
  );
}

function distanceRaw(e: AiFireEventLike): number {
  if (typeof e.distanceRaw === 'number') return e.distanceRaw;
  // cdistance(a,b) is in sectors; multiplied by 10_000 converts to raw coord units
  // (since our positions are in 0-30 / 0-15 sector units, 1 sector = 10_000 raw units).
  return Math.hypot(e.shooter.x - e.target.x, e.shooter.y - e.target.y) * 10_000;
}

/**
 * Asserts that AI ships never fire on a target outside their own scanner range.
 *
 * The C source gates phaser fire on the scanner (see GECYBS.C / GEDROIDS.C). The
 * fix history for A-001 / A-002 (and the player-side C-001 fix) made the gate
 * explicit in TypeScript: `cdistance(shooter,target) * 10_000 < scanRange`.
 *
 * @see backend/src/game/droid/droid-act-class-11.ts (A-001 fix)
 * @see backend/src/game/droid/droid-act-class-12.ts (A-002 fix)
 * @see backend/src/game/droid/droid-tick.service.ts
 * @see backend/src/game/cybertron/cybertron-tick.service.ts
 */
export const aiCannotFireAcrossMap: Invariant = {
  name: 'aiCannotFireAcrossMap',
  sourceRef: 'GECYBS.C / GEDROIDS.C scanner-gated phaser fire',
  run: (world): Violation[] => {
    const raw = (world.aiFireEvents as unknown[] | undefined) ?? [];
    const out: Violation[] = [];
    for (const item of raw) {
      if (!isAiFireEvent(item)) continue;
      const d = distanceRaw(item);
      if (d > item.scanRange) {
        out.push({
          rule: 'aiCannotFireAcrossMap',
          sourceRef: 'GECYBS.C / GEDROIDS.C scanner-gated phaser fire',
          severity: 'HIGH',
          detail: `${item.shipClass} fired at distanceRaw=${d.toFixed(0)} > scanRange=${item.scanRange}`,
        });
      }
    }
    return out;
  },
};

// Neutral zone = sector (0,0). @see GEMAIN.H:70-71 NEUTRAL_X / NEUTRAL_Y.
// @see GEPLANET.C:866-872 neutral() — `coord1(x)==0 && coord1(y)==0`.
// `coord1` floors a coord into its sector — for our sector-unit coords that's
// `Math.floor(x) === 0 && Math.floor(y) === 0`.
function inNeutralZone(p: { x: number; y: number }): boolean {
  return Math.floor(p.x) === 0 && Math.floor(p.y) === 0;
}

/**
 * Asserts that no AI fire event targets a coordinate inside the neutral zone.
 *
 * Original logic guards the entire neutral sector against combat — see every
 * `if (neutral(&warsptr->coord)) ...` site in `GECMDS.C`. AI ships must honour
 * that guard the same way players do.
 *
 * @see reference/ge-source/GEPLANET.C:866-872 neutral()
 * @see reference/ge-source/GEMAIN.H:70-71 NEUTRAL_X / NEUTRAL_Y
 */
export const aiRespectsNeutralZone: Invariant = {
  name: 'aiRespectsNeutralZone',
  sourceRef: 'GEPLANET.C:866 neutral() + GEMAIN.H:70-71',
  run: (world): Violation[] => {
    const raw = (world.aiFireEvents as unknown[] | undefined) ?? [];
    const out: Violation[] = [];
    for (const item of raw) {
      if (!isAiFireEvent(item)) continue;
      if (inNeutralZone(item.target)) {
        out.push({
          rule: 'aiRespectsNeutralZone',
          sourceRef: 'GEPLANET.C:866 neutral() + GEMAIN.H:70-71',
          severity: 'HIGH',
          detail: `${item.shipClass} fired into neutral zone at (${item.target.x}, ${item.target.y})`,
        });
      }
    }
    return out;
  },
};
