import { damstr } from '../../combat/combat-math';
import { SHIELDDM } from '../../constants';
import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShipClassCacheService, ShipClassEntry } from '../../physics/ship-class-cache.service';
import { UserRepository } from '../../player/user.repository';
import { Command, CommandContext, CommandResult, CommandResultLine } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { PMINFIRE } from '../../constants';
import { showarp } from '../../ship/showarp';
import { ShipState } from '../../ship/ship-state.types';
import { ITEM_NAMES, ITEM_TONS, NUMITEMS, capitaliseItem } from '../../constants/items';
import { coord1, coord2 } from '../../physics/coord';


/**
 * Handles the `report` / `rep` command — multi-line ship status read-out.
 *
 * @see GECMDS.C:1946 cmd_report
 */
@Injectable()
export class ReportHandlerService {
  constructor(
    private readonly prisma: PrismaService,
    /**
     * The `User` repository. `@Optional()` with a default built over the same
     * client this class already holds, so the suite's direct
     * `new ReportHandlerService(...)` sites keep compiling — and keep asserting on the very
     * same `prisma.user.*` calls, which is what proves the queries did not
     * change when they moved behind it. Nest injects the shared provider in
     * production. Safe ONLY because `UserRepository` is stateless and
     * constructible from `(prisma)` alone — see the statelessness note on that
     * class before adding a field or a constructor parameter to it.
     */
    @Optional()
    private readonly users: UserRepository = new UserRepository(prisma),
    /**
     * Ship-class fields (typeName, weapon fit, tonnage, warp) come from the
     * boot-time cache — the table is static seed data — rather than a
     * per-`onModuleInit` `prisma.shipClass.findMany`. `@Optional()` so the
     * many direct `new ReportHandlerService(prisma, users)` test
     * constructions keep compiling; a missing cache falls back to the same
     * `cls?.field ?? …` placeholders an unrecognised class number always hit.
     */
    @Optional()
    private readonly shipClassCache?: ShipClassCacheService,
  ) {}

  private classOf(classNumber: number): ShipClassEntry | undefined {
    return this.shipClassCache?.get(classNumber);
  }

  get command(): Command {
    return {
      keyword: 'report',
      aliases: ['rep'],
      minArgs: 1,
      argMissingMessage: formatMessage(MessageId.REPFMT),
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    const sub = args[0]?.toLowerCase() ?? '';
    const cls = this.classOf(ship.shpclass);
    const typeName = cls?.typeName ?? `Class ${ship.shpclass}`;

    const lines: CommandResultLine[] = [];

    // Header: REP01 + DASHES
    lines.push({
      text: formatMessage(MessageId.REP01, typeName, ship.shipname),
      category: 'system',
    });
    lines.push({
      text: formatMessage(MessageId.DASHES),
      category: 'system',
    });

    if (sub === 'nav') {
      return { lines: [...lines, ...this.buildNav(ship)] };
    }

    if (sub === 'sys') {
      return { lines: [...lines, ...this.buildSys(ship, cls?.hasCloak ?? false)] };
    }

    if (sub === 'inv' || sub === 'cargo') {
      let totalTons = 0;
      for (let i = 0; i < NUMITEMS; i++) {
        const qty = Number(ship.items[i] ?? 0n);
        if (qty <= 0) continue;
        const itemTons = ITEM_TONS[i];
        const tons = qty * itemTons;
        totalTons += tons;
        // Canon capitalises the first letter of a COLUMN entry at the call
        // site, leaving the table itself lower case:
        //   sprintf(gechrbuf,"%s%s%12ld", item_name[i], gedots(...), qty);
        //   gechrbuf[0] = toupper(gechrbuf[0]);
        // @see GECMDS.C:2064-2065
        const name = capitaliseItem(ITEM_NAMES[i]);
        const dots = '.'.repeat(Math.max(1, 26 - name.length));
        lines.push({
          text: `${name}${dots}${qty.toLocaleString()}  (${itemTons} ton${itemTons !== 1 ? 's' : ''} ea)`,
          category: 'info',
        });
      }
      if (totalTons === 0) {
        lines.push({ text: formatMessage(MessageId.REP_CARGO_NONE), category: 'info' });
      }
      const cap = cls?.maxTons ?? ship.maxTons ?? 1000;
      lines.push({
        text: formatMessage(MessageId.REP_CARGO_TOTAL, Math.round(totalTons), cap),
        category: 'info',
      });
      return { lines };
    }

    if (sub === 'wpns') {
      const yn = (v: boolean) => v ? 'yes' : 'no';
      lines.push({ text: 'Weapons & Systems:', category: 'system' });
      lines.push({ text: `  Phasors:    type ${ship.phasrtype}  (upgradeable to type ${cls?.maxPhaser ?? '?'})`, category: 'info' });
      lines.push({ text: `  Shields:    type ${ship.shieldtype}  (upgradeable to type ${cls?.maxShields ?? '?'})`, category: 'info' });
      lines.push({ text: `  Torpedoes:  ${yn(cls?.hasTorpedo ?? false)}`, category: 'info' });
      lines.push({ text: `  Missiles:   ${yn(cls?.hasMissile ?? false)}`, category: 'info' });
      lines.push({ text: `  Decoys:     ${yn(cls?.hasDecoy ?? false)}`, category: 'info' });
      lines.push({ text: `  Jammers:    ${yn(cls?.hasJammer ?? false)}`, category: 'info' });
      lines.push({ text: `  Zippers:    ${yn(cls?.hasZipper ?? false)}`, category: 'info' });
      lines.push({ text: `  Mines:      ${yn(cls?.hasMine ?? false)}`, category: 'info' });
      lines.push({ text: `  Cloak:      ${yn(cls?.hasCloak ?? false)}`, category: 'info' });
      lines.push({ text: `  Cargo:      ${cls?.maxTons ?? '?'} tons`, category: 'info' });
      lines.push({ text: `  Max warp:   ${cls?.maxWarp ?? '?'}`, category: 'info' });
      return { lines };
    }

    if (sub === 'acc') {
      return { lines: [...lines, ...await this.buildAcc(ship)] };
    }

    // Unknown sub-command
    return {
      lines: [{ text: formatMessage(MessageId.REPFMT), category: 'system' }],
    };
  }

  /** @see GECMDS.C:1967 nav section */
  private buildNav(ship: ShipState): CommandResultLine[] {
    const lines: CommandResultLine[] = [];
    lines.push({ text: formatMessage(MessageId.REP35), category: 'system' });

    // Compute approximate sector coords from float universe coords.
    // setsect() in C source maps float coords to integer sector grid.
    const xsect = coord1(ship.xcoord);
    const ysect = coord1(ship.ycoord);
    const xcord = coord2(ship.xcoord);
    const ycord = coord2(ship.ycoord);
    const heading = Math.round(ship.heading);
    const displaySpeed = ship.speed;
    // REP03/REP06 are `Speed..................Warp %s` and canon fills the slot
    // with `showarp(speed)` — the bare figure (GECMDS.C:1972, :1980). Passing
    // our own "warp 10.0" into a message that already says Warp printed
    // "Speed..................Warp warp 10.0", which is what a pilot saw.
    const speedStr = showarp(displaySpeed);

    if (ship.where === 1) {
      // Hyperspace
      lines.push({ text: formatMessage(MessageId.REP02, xsect, ysect), category: 'info' });
      lines.push({ text: formatMessage(MessageId.REP03, speedStr), category: 'info' });
      lines.push({ text: formatMessage(MessageId.REP04, heading), category: 'info' });
    } else if (ship.where === 0) {
      // Normal space
      lines.push({ text: formatMessage(MessageId.REP05, xsect, ysect), category: 'info' });
      lines.push({ text: formatMessage(MessageId.REP06, speedStr), category: 'info' });
      lines.push({ text: formatMessage(MessageId.REP07, heading), category: 'info' });
    } else if (ship.where >= 10) {
      // In orbit
      lines.push({
        text: formatMessage(MessageId.REP08, ship.where - 10, xsect, ysect),
        category: 'info',
      });
    }

    lines.push({
      text: formatMessage(MessageId.REP32, xsect, ysect, xcord, ycord),
      category: 'info',
    });

    return lines;
  }

  /** @see GECMDS.C:2007 sys section */
  private buildSys(ship: ShipState, hasCloak: boolean): CommandResultLine[] {
    const lines: CommandResultLine[] = [];
    const energy = Math.round(ship.energy);
    lines.push({ text: formatMessage(MessageId.REP09, energy), category: 'info' });

    if (ship.shieldtype > 0) {
      if (ship.shieldstat === 1) {
        const maxCharge = 40 + ship.shieldtype * 10;
        const pct = maxCharge > 0 ? Math.max(0, Math.round((ship.shield * 100) / maxCharge)) : 0;
        // REP10 is `Shields (Mark-%d)...... UP` — ONE slot, the mark. The
        // charge percentage has its own line in canon (REP11B, Shield Bank
        // Charge), so passing pct here filled nothing and dropped it.
        void pct;
        lines.push({ text: formatMessage(MessageId.REP10, ship.shieldtype), category: 'info' });
        lines.push({ text: formatMessage(MessageId.REP11B, ship.shield), category: 'info' });
      } else {
        // REP11 takes the mark too — without it the report read
        // "Shields (Mark-)...... DOWN".
        lines.push({ text: formatMessage(MessageId.REP11, ship.shieldtype), category: 'info' });
      }
    }

    if (ship.phasrtype > 0) {
      // Canon has two lines here and no percentage: REP23 when the bank can
      // fire and REP24 when it cannot. `Phasors: type 2 (100% charged)` was
      // ours. @see GE/REL/MBMGEMSG.MSG
      lines.push({
        text: formatMessage(
          ship.phasr >= PMINFIRE ? MessageId.REP23 : MessageId.REP24,
          ship.phasrtype,
        ),
        category: 'info',
      });
    }

    lines.push({
      text: formatMessage(
        MessageId.REP24A,
        ship.freq[0] ?? 0,
        ship.freq[1] ?? 0,
        ship.freq[2] ?? 0,
      ),
      category: 'info',
    });

    if (hasCloak) {
      if (ship.cloak > 0) {
        lines.push({ text: formatMessage(MessageId.REP12), category: 'info' });
      } else {
        lines.push({ text: formatMessage(MessageId.REP13), category: 'info' });
      }
    }

    // C passes the damstr WORD, not a number: `damage = (unsigned)(damage+.5);
    // damstr(damage); prfmsg(REP14, gechrbuf);` @see GECMDS.C:2037-2040
    lines.push({
      text: formatMessage(MessageId.REP14, damstr(Math.round(ship.damage))),
      category: 'info',
    });

    // The pilot is told what is broken. The port tracked all of these and
    // acted on them but never mentioned them. @see GECMDS.C:2041-2050
    if (ship.shieldstat === SHIELDDM) {
      lines.push({ text: formatMessage(MessageId.REP15), category: 'info' });
    }
    if (ship.helm < 0) {
      lines.push({ text: formatMessage(MessageId.REP16), category: 'info' });
    }
    if (ship.cloak < 0) {
      lines.push({ text: formatMessage(MessageId.REP17), category: 'info' });
    }
    if (ship.tactical < 0) {
      lines.push({ text: formatMessage(MessageId.REP18), category: 'info' });
    }
    if (ship.repair > 0) {
      lines.push({ text: formatMessage(MessageId.REP18A, ship.repair), category: 'info' });
    }

    return lines;
  }

  /** @see GECMDS.C:2074 acc section */
  private async buildAcc(ship: ShipState): Promise<CommandResultLine[]> {
    const lines: CommandResultLine[] = [];
    lines.push({ text: formatMessage(MessageId.REP25), category: 'system' });

    const user = await this.users.getAccountSummary(ship.userid);

    if (!user) return lines;

    if (user.planets === 0) {
      lines.push({ text: formatMessage(MessageId.REP26), category: 'info' });
    } else {
      lines.push({ text: formatMessage(MessageId.REP27, user.planets), category: 'info' });
    }

    lines.push({ text: formatMessage(MessageId.REP28, user.cash.toLocaleString()), category: 'info' });

    const score = user.score <= 0n ? '0' : user.score.toLocaleString();
    lines.push({ text: formatMessage(MessageId.REP30, score), category: 'info' });

    lines.push({ text: formatMessage(MessageId.REP31, user.kills), category: 'info' });

    if (user.teamcode && user.teamcode > 0n) {
      const team = await this.prisma.team.findUnique({
        where: { teamcode: user.teamcode },
        select: { teamname: true },
      });
      if (team) {
        lines.push({ text: formatMessage(MessageId.REP31A, team.teamname), category: 'info' });
      }
    }

    return lines;
  }
}
