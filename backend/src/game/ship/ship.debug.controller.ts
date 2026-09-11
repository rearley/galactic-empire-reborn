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
import { UserRepository } from '../player/user.repository';
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
  constructor(
    private readonly shipState: ShipStateService,
    private readonly users: UserRepository,
  ) {}

  /**
   * POST /debug/ship/credits?shipname=Reliant&amount=2000000
   *
   * Sets the owning captain's balance. Credits live on the User row, not the
   * ship, so `outfit` cannot reach them — and a second hull costs 500,000 while
   * a starter pilot has 5,000, which makes the multi-ship flow untestable
   * without grinding trade runs.
   */
  @Post('credits')
  async credits(
    @Query('shipname') shipname: string,
    @Query('amount') amountParam: string,
  ): Promise<object> {
    if (!shipname) throw new BadRequestException('shipname is required');
    const amount = optionalCount(amountParam, 'amount');
    if (amount === undefined) throw new BadRequestException('amount is required');

    const target = this.shipState.findByName(shipname);
    if (!target) throw new BadRequestException(`no live ship named '${shipname}'`);

    await this.users.setCash(target.userid, BigInt(amount));

    return { ok: true, shipname: target.shipname, credits: amount };
  }

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
    @Query('shield') shieldParam?: string,
    @Query('shieldtype') shieldtypeParam?: string,
    @Query('shieldstat') shieldstatParam?: string,
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

    const shield = optionalCount(shieldParam, 'shield');
    const shieldtype = optionalCount(shieldtypeParam, 'shieldtype');

    // shieldUp in the combat tick requires BOTH shieldstat===1 and shield>0,
    // so charge and raised-state are set independently here.
    let shieldstat: number | undefined;
    if (shieldstatParam !== undefined) {
      const v = shieldstatParam.toLowerCase();
      if (v === 'up') shieldstat = 1;
      else if (v === 'down' || v === 'dn') shieldstat = 0;
      else throw new BadRequestException("shieldstat must be 'up' or 'down'");
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
      if (shield !== undefined) s.shield = shield;
      if (shieldtype !== undefined) s.shieldtype = shieldtype;
      if (shieldstat !== undefined) s.shieldstat = shieldstat;
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
      shield: updated.shield,
      shieldtype: updated.shieldtype,
      shieldstat: updated.shieldstat,
    };
  }
}
