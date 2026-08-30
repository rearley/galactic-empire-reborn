/**
 * Dev-only ship outfit endpoint for QA and combat playtesting.
 * Gated behind NODE_ENV !== 'production' by the module registration.
 *
 * Ship state is owned by ShipStateService's in-memory map (Postgres is a flush
 * target), so a tester cannot stage an engagement with SQL — the next flush
 * overwrites it. Acquiring ordnance legitimately means flying to Zygor and
 * trading, which costs minutes per attempt and is impossible once a Cybertron
 * has you at high damage. This mutates the live ship instead.
 *
 * @see specs/008-droid-ai/quickstart.md — sibling droid spawn endpoint
 */

import { Controller, Post, Query, BadRequestException } from '@nestjs/common';
import { ShipStateService } from './ship-state.service';
import { I_TORP, I_MISSL, I_MINE } from '../constants/items';

/** Parses an optional non-negative integer query param. */
function optionalCount(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new BadRequestException(`${name} must be a non-negative integer`);
  }
  return n;
}

@Controller('debug/ship')
export class ShipDebugController {
  constructor(private readonly shipState: ShipStateService) {}

  /**
   * POST /debug/ship/outfit?shipname=Reliant&torps=10&missiles=10&mines=10&damage=0
   *
   * Every quantity is optional; omitted fields are left untouched. `damage` is
   * hull damage as a percentage, 0..100 (ships die at 100).
   */
  @Post('outfit')
  outfit(
    @Query('shipname') shipname: string,
    @Query('torps') torpsParam?: string,
    @Query('missiles') missilesParam?: string,
    @Query('mines') minesParam?: string,
    @Query('damage') damageParam?: string,
    @Query('x') xParam?: string,
    @Query('y') yParam?: string,
    @Query('shpclass') shpclassParam?: string,
  ): object {
    if (!shipname) throw new BadRequestException('shipname is required');

    const torps = optionalCount(torpsParam, 'torps');
    const missiles = optionalCount(missilesParam, 'missiles');
    const mines = optionalCount(minesParam, 'mines');
    const damage = optionalCount(damageParam, 'damage');
    if (damage !== undefined && damage > 100) {
      throw new BadRequestException('damage must be between 0 and 100');
    }

    // Teleport. Clearing the neutral zone by flying takes several minutes of
    // warp, during which a Cybertron will usually destroy a starter ship —
    // which made hands-on weapon testing effectively impossible. Coordinates
    // may be negative: ships legitimately occupy negative sectors.
    let at: { x: number; y: number } | undefined;
    if (xParam !== undefined || yParam !== undefined) {
      if (xParam === undefined || yParam === undefined) {
        throw new BadRequestException('x and y must be supplied together');
      }
      const x = Number(xParam);
      const y = Number(yParam);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new BadRequestException('x and y must be finite numbers');
      }
      at = { x, y };
    }

    // Hull class swap. Weapon availability is per class (the class 1 Interceptor
    // has hasMissile=false), so testing missiles at all requires a class 2+ hull.
    let shpclass: number | undefined;
    if (shpclassParam !== undefined) {
      const n = Number(shpclassParam);
      if (!Number.isInteger(n) || n < 1) {
        throw new BadRequestException('shpclass must be a positive integer');
      }
      shpclass = n;
    }

    const target = this.shipState.findByName(shipname);
    if (!target) throw new BadRequestException(`no live ship named '${shipname}'`);

    const updated = this.shipState.mutate(target.userid, target.shipno, (s) => {
      // ShipState.items is bigint[] (mirrors the Prisma BigInt[] column).
      if (torps !== undefined) s.items[I_TORP] = BigInt(torps);
      if (missiles !== undefined) s.items[I_MISSL] = BigInt(missiles);
      if (mines !== undefined) s.items[I_MINE] = BigInt(mines);
      if (damage !== undefined) s.damage = damage;
      if (at) {
        s.xcoord = at.x;
        s.ycoord = at.y;
      }
      if (shpclass !== undefined) s.shpclass = shpclass;
    });
    if (!updated) throw new BadRequestException(`ship '${shipname}' is no longer live`);

    return {
      ok: true,
      shipname: updated.shipname,
      damage: updated.damage,
      torps: Number(updated.items[I_TORP]),
      missiles: Number(updated.items[I_MISSL]),
      mines: Number(updated.items[I_MINE]),
      xcoord: updated.xcoord,
      ycoord: updated.ycoord,
      shpclass: updated.shpclass,
    };
  }
}
