import { Injectable, Logger } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CybertronControlService } from '../../cybertron/cybertron-control.service';
import { UNIVMAX } from '../../constants';
import { ITEM_KEYWORDS, ITEM_NAMES } from '../../constants/items';
import {
  parseSysArgs, SYS_HELP_LINES, sysClassIsValid, sysTypeIsValid, sysGotoIsValid,
} from './sys-commands';

/**
 * Handles `sys <subcommand>`. Currently supports:
 *   - `sys unjam` — clears the firer's jammer counter immediately.
 *
 * @see GECMDS.C — sys command dispatch
 */
@Injectable()
export class SysHandlerService {
  private readonly logger = new Logger(SysHandlerService.name);

  constructor(
    private readonly shipState: ShipStateService,
    private readonly prisma: PrismaService,
    private readonly cybControl: CybertronControlService,
  ) {}

  readonly command: Command = {
    keyword: 'sys',
    aliases: [],
    minArgs: 1,
    argMissingMessage: formatMessage(MessageId.SYS_FMT),
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> =>
      this.handle(ship, args),
  };

  /**
   * Canon's sysop gate, which runs BEFORE the subcommand is looked at:
   *
   *   if ((!syscmds) || (sysonly && !(usrptr->flags&ISYSOP)))
   *       { prf("Huh?\r"); ... return; }
   *
   * Both options ship YES (MBMGEMSG.MSG:197 SYSCMDS, :202 SYSONLY), so an
   * ordinary player gets "Huh?" and nothing else.
   *
   * Canon reads sysop status from the MajorBBS user record's ISYSOP flag. This
   * port has no such record, so identity comes from the GE_SYSOP_USERNAME
   * allowlist — port-original plumbing for a canon gate. Empty or unset means
   * nobody is a sysop, which is the safe default: `sys unjam` clears the
   * caller's own jammer counter, so an ungated `sys` is a free, instant,
   * universal counter to the jammer weapon.
   *
   * It matches on USERNAME, not `userid`. `userid` is
   * `usr_${randomBytes(12).toString('hex')}` (auth.service.ts:38) — minted at
   * registration, so it cannot be configured before the account exists and is
   * different after every database reset, which would make the allowlist
   * silently stop granting. The username is chosen by the operator and re-used
   * across resets, so it can be set once and stay true. Matching is
   * case-insensitive because `User.username` is case-insensitively unique.
   *
   * @see GECMDS.C:4752-4760 cmd_sysop
   */
  private isSysop(ship: ShipState): boolean {
    const name = ship.username?.trim().toLowerCase();
    if (!name) return false;
    return (process.env.GE_SYSOP_USERNAME ?? '')
      .split(',')
      .map((u) => u.trim().toLowerCase())
      .filter((u) => u.length > 0)
      .includes(name);
  }

  /**
   * A record of every sysop action that CHANGES something.
   *
   * Canon logs nothing. On a server anyone can reach, these are the most
   * dangerous commands available — they mint currency, re-hull ships and kill
   * other players — and "who gave themselves a million credits, and when" is
   * not a question that should be answered from memory. Read-only commands are
   * deliberately not logged: they would bury the entries that matter.
   *
   * A refused attempt is not logged here either. It never happened, and
   * recording it as though it did would make the log lie in the direction that
   * matters most.
   */
  private audit(ship: ShipState, sub: string, args: readonly string[], detail: string): void {
    this.logger.warn(
      `SYSOP ${ship.username ?? ship.userid} (${ship.userid}#${ship.shipno}) ` +
        `ran "sys ${[sub, ...args].join(' ')}" — ${detail}`,
    );
  }

  private static line(text: string): CommandResult['lines'][number] {
    return { text, category: 'system' as const };
  }

  private static say(...texts: string[]): CommandResult {
    return { lines: texts.map((t) => SysHandlerService.line(t)) };
  }

  private static huh(): CommandResult {
    return SysHandlerService.say(formatMessage(MessageId.SYS_HUH));
  }

  private async handle(ship: ShipState, args: string[]): Promise<CommandResult> {
    // The gate runs BEFORE the subcommand is looked at, exactly as canon does
    // (GECMDS.C:4752). A non-sysop's "Huh?" is indistinguishable from an
    // unknown command, so the toolkit's existence is not disclosed.
    if (!this.isSysop(ship)) return SysHandlerService.huh();

    const { sub, rest, int } = parseSysArgs(args);

    switch (sub) {
      case 'help':
        return SysHandlerService.say(...SYS_HELP_LINES);

      case 'classlist':
        return this.classList();

      case 'list':
        return this.shipList(int(0) ?? 0);

      case 'unjam':
        this.shipState.mutate(ship.userid, ship.shipno, (s) => { s.jammer = 0; });
        this.audit(ship, sub, rest, 'jammer cleared');
        return SysHandlerService.say(formatMessage(MessageId.SYS_UNJAM));

      case 'maint':
        // GECMDS.C:4912 — repair = 1, then repairship(). Our repair tick reads
        // the same flag, so setting it is the whole of the effect here.
        this.shipState.mutate(ship.userid, ship.shipno, (s) => { s.repair = 1; });
        this.audit(ship, sub, rest, 'fast maintenance started');
        return SysHandlerService.say('Maintenance started.');

      case 'get':
        return this.giveItems(ship, int(0), rest[1], rest);

      case 'cash':
        return this.giveCash(ship, int(0), rest);

      case 'goto':
        return this.teleport(ship, int(0), int(1), rest);

      case 'class':
        return this.setClass(ship, int(0), rest);

      case 'shieldtype':
      case 'phasertype':
        return this.setType(ship, sub, int(0), rest);

      case 'kill':
        return this.killByUsername(ship, rest[0], rest);

      case 'cybpause': {
        const secs = int(0);
        if (secs === null) return SysHandlerService.huh();
        const applied = this.cybControl.pauseFor(secs);
        this.audit(ship, sub, rest, `cybertrons paused ${applied}s`);
        return SysHandlerService.say(`Cybertrons paused for ${applied} seconds`);
      }

      default:
        return SysHandlerService.huh();
    }
  }

  /** `sys get nnn <itemname>` — GECMDS.C:4782. amt must be > 0. */
  private giveItems(ship: ShipState, amt: number | null, keyword: string | undefined, rest: readonly string[]): CommandResult {
    if (amt === null || amt <= 0 || !keyword) return SysHandlerService.huh();
    const k = keyword.trim().toLowerCase();
    const index = ITEM_KEYWORDS.findIndex((kw) => k.startsWith(kw) || ITEM_NAMES[ITEM_KEYWORDS.indexOf(kw)]?.startsWith(k));
    if (index < 0) return SysHandlerService.huh();

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.items[index] = (s.items[index] ?? 0n) + BigInt(amt);
    });
    this.audit(ship, 'get', rest, `+${amt} ${ITEM_NAMES[index]}`);
    return SysHandlerService.say(`Created ${amt} ${ITEM_NAMES[index]}.`);
  }

  /**
   * `sys cash nnn` — GECMDS.C:4822, `waruptr->cash += atol(...)`.
   * atol takes a sign, and removing credits is as legitimate an admin action
   * as granting them, so negatives are allowed.
   */
  private async giveCash(ship: ShipState, amt: number | null, rest: readonly string[]): Promise<CommandResult> {
    if (amt === null) return SysHandlerService.huh();
    await this.prisma.user.update({
      where: { userid: ship.userid },
      data: { cash: { increment: BigInt(amt) } },
    });
    this.audit(ship, 'cash', rest, `cash ${amt >= 0 ? '+' : ''}${amt}`);
    return SysHandlerService.say(`Cash adjusted by ${amt}.`);
  }

  /** `sys goto x y` — GECMDS.C:4829. Centres the ship in the sector. */
  private teleport(ship: ShipState, x: number | null, y: number | null, rest: readonly string[]): CommandResult {
    if (x === null || y === null || !sysGotoIsValid(x, y, UNIVMAX)) return SysHandlerService.huh();
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.where = 0;
      s.hostile = 0;
      s.xcoord = x + 0.5;
      s.ycoord = y + 0.5;
    });
    this.audit(ship, 'goto', rest, `teleported to ${x} ${y}`);
    return SysHandlerService.say(`Teleported to sector ${x} ${y}.`);
  }

  /** `sys class nnn` — GECMDS.C:4880. Canon also resets topspeed to the hull's max. */
  private async setClass(ship: ShipState, n: number | null, rest: readonly string[]): Promise<CommandResult> {
    if (n === null) return SysHandlerService.huh();
    const classes = await this.prisma.shipClass.findMany({ select: { classNumber: true, maxWarp: true } });
    const target = classes.find((c) => c.classNumber === n);
    if (!target || !sysClassIsValid(n, classes.length)) return SysHandlerService.huh();

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.shpclass = n;
      s.topspeed = target.maxWarp;
    });
    this.audit(ship, 'class', rest, `hull -> class ${n}`);
    return SysHandlerService.say(`Ship is now class ${n}.`);
  }

  /** `sys shieldtype|phasertype nnn` — GECMDS.C:4892, :4903. */
  private setType(ship: ShipState, which: 'shieldtype' | 'phasertype', n: number | null, rest: readonly string[]): CommandResult {
    if (n === null || !sysTypeIsValid(n)) return SysHandlerService.huh();
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      if (which === 'shieldtype') s.shieldtype = n;
      else s.phasrtype = n;
    });
    this.audit(ship, which, rest, `${which} -> ${n}`);
    return SysHandlerService.say(`${which} set to ${n}.`);
  }

  /**
   * `sys kill <username>` — GECMDS.C:4801.
   *
   * Canon matches a prefix of the ship's `userid` and kills EVERY match. This
   * port matches the username instead: `userid` here is an opaque
   * `usr_<hex>` minted at registration, which no operator could type. Prefix
   * matching is kept, and so is killing every match, because a captain can own
   * several hulls and canon takes them all.
   */
  private killByUsername(ship: ShipState, needle: string | undefined, rest: readonly string[]): CommandResult {
    const target = needle?.trim().toLowerCase();
    if (!target) return SysHandlerService.huh();

    const hits = this.shipState
      .findAllShips()
      .filter((s) => (s.username ?? '').toLowerCase().startsWith(target));

    if (hits.length === 0) return SysHandlerService.say('Not found');

    for (const victim of hits) {
      this.shipState.mutate(victim.userid, victim.shipno, (s) => { s.damage = 101; });
    }
    this.audit(ship, 'kill', rest, `killed ${hits.length}: ${hits.map((h) => `${h.username}#${h.shipno}`).join(', ')}`);
    return SysHandlerService.say(...hits.map((h) => `Killed ${h.username ?? h.userid}`));
  }

  /** `sys classlist` — GECMDS.C:4956. */
  private async classList(): Promise<CommandResult> {
    const classes = await this.prisma.shipClass.findMany({
      select: { classNumber: true, typeName: true, cybCanAttack: true, noClaim: true },
      orderBy: { classNumber: 'asc' },
    });
    return SysHandlerService.say(
      'Class Sname                          cybs_can_attk No_to_chase',
      ...classes.map((c) =>
        `${String(c.classNumber).padStart(3)} ${c.typeName.padEnd(30)} ` +
        `${String(c.cybCanAttack ? 1 : 0).padStart(5)} ${String(c.noClaim).padStart(5)}`),
    );
  }

  /** `sys list [nn]` — GECMDS.C:4926. Fifty at a time, skipping AVAIL hulls. */
  private shipList(from: number): CommandResult {
    const all = this.shipState.findAllShips().filter((s) => s.status !== 0);
    const page = all.slice(Math.max(0, from), Math.max(0, from) + 50);
    return SysHandlerService.say(
      'Chn Name                           xsect ysect damage tick cybmine',
      ...page.map((s, i) =>
        `${String(from + i).padStart(3)} ${(s.username ?? s.userid).padEnd(30)} ` +
        `${String(Math.floor(s.xcoord)).padStart(5)} ${String(Math.floor(s.ycoord)).padStart(5)} ` +
        `${String(Math.trunc(s.damage)).padStart(3)} ${String(s.tick).padStart(4)} ${String(s.cybmine).padStart(7)}`),
    );
  }
}
