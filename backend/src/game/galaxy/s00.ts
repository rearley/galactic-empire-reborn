/**
 * Canonical neutral-zone (sector 0,0) planet fixture.
 *
 * This fixture defines the fixed contents of the origin sector, which is
 * the neutral zone that all players start in. The entries are loaded by
 * GalaxyService during first-boot galaxy generation and are never altered
 * by the procedural generator.
 *
 * @see GEPLANET.C:495-541 — s00[] struct layout and field semantics
 * @see GECMDS.C:4127 — Zygor-3 named as canonical neutral-zone planet
 * @see GECMDS.C:4558 — Zygor-3 assigned plnum=1 in the neutral zone
 */

import { S00Entry } from './galaxy.types';

/**
 * Number of planets in the neutral-zone fixture.
 * Must be in the legal S00PLNUM range of 3..9.
 */
export const S00_PLNUM = 5 as const;

/**
 * Frozen array of neutral-zone planet entries for sector (0,0).
 *
 * Index 0 is always Zygor-3 (plnum=1), the canonical starting planet
 * referenced throughout the original source. The remaining four entries
 * provide variety in environment and resource richness to give new players
 * meaningful choices within the neutral zone.
 *
 * Coordinate system: xcoord/ycoord are in the range 0..1 representing
 * position within the sector cell. All entries are placed in 0.1..0.9
 * to avoid edge overlap; minimum peer distance is ≥ 0.07.
 *
 * env values: 0=Earth-like, 1=Arid, 2=Toxic, 3=Frozen
 * res values: 0=Poor, 1=Adequate, 2=Rich, 3=Abundant
 *
 * @see GEPLANET.C:495-541
 * @see GECMDS.C:4127, 4558
 */
export const S00: S00Entry[] = Object.freeze([
  {
    // plnum=1 — canonical starting planet for new players
    // @see GECMDS.C:4127, 4558
    type: 2,
    name: 'Zygor-3',
    xcoord: 0.5,
    ycoord: 0.5,
    env: 0,   // Earth-like
    res: 2,   // Rich
    owner: '',
  },
  {
    type: 2,
    name: 'Nexus Prime',
    xcoord: 0.2,
    ycoord: 0.3,
    env: 1,   // Arid
    res: 3,   // Abundant
    owner: '',
  },
  {
    type: 2,
    name: 'Caldor IV',
    xcoord: 0.7,
    ycoord: 0.2,
    env: 0,   // Earth-like
    res: 1,   // Adequate
    owner: '',
  },
  {
    type: 2,
    name: 'Minera',
    xcoord: 0.3,
    ycoord: 0.7,
    env: 2,   // Toxic
    res: 3,   // Abundant
    owner: '',
  },
  {
    type: 2,
    name: 'Draconis',
    xcoord: 0.8,
    ycoord: 0.8,
    env: 3,   // Frozen
    res: 0,   // Poor
    owner: '',
  },
]) as S00Entry[];
