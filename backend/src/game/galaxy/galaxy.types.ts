/**
 * Types for the galaxy generator module.
 * @see specs/004-galaxy-generator/data-model.md
 * @see GEMAIN.H:438 GALPLNT, GEMAIN.H:467 GALWORM
 */

/**
 * Minimal wormhole view consumed by the scan renderer and other callers.
 * `visible: boolean` is the type-safe equivalent of `GALWORM.visible` (int
 * in the Prisma schema; 0 = hidden, 1 = visible in C source).
 *
 * @see GEMAIN.H:473 — GALWORM struct, visible field
 */
export interface GalaxyWormholeView {
  xcoord: number;
  ycoord: number;
  visible: boolean;
}

/**
 * Runtime configuration loaded from environment variables.
 * @see specs/004-galaxy-generator/contracts/galaxy-config.md
 */
export interface GalaxyConfig {
  seed: number;
  plodds: number;
  wormodds: number;
  maxplanets: number;
}

/**
 * A single entry in the s00 neutral-zone fixture.
 * @see GEPLANET.C:495-541 — s00[] struct layout
 */
export interface S00Entry {
  type: 1 | 2 | 3;
  name: string;
  xcoord: number;
  ycoord: number;
  env: number;
  res: number;
  owner: string;
  destX?: number;
  destY?: number;
}

/**
 * Structural snapshot of the persisted GalaxyMeta row.
 * Returned by GalaxyService.getMeta().
 */
export interface GalaxyMetaSnapshot {
  id: number;
  seed: bigint;
  plodds: number;
  wormodds: number;
  maxplanets: number;
  generatedAt: Date;
}
