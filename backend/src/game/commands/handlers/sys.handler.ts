import { Injectable, Logger, Optional } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserRepository } from '../../player/user.repository';
import { CybertronControlService } from '../../cybertron/cybertron-control.service';
import { UNIVMAX } from '../../constants';
import { ITEM_KEYWORDS, ITEM_NAMES } from '../../constants/items';
import {
  parseSysArgs, SYS_HELP_LINES, sysClassIsValid, sysTypeIsValid, sysGotoIsValid,
} from './sys-commands';

/**
 * Handles `sys <subcommand>` — canon's sysop toolkit, behind the gate below.
 *
 * All THIRTEEN reachable canon subcommands are implemented:
 *
 *   help        list the toolkit                          GECMDS.C:4762
 *   get         create items on this ship                          :4782
 *   kill        destroy the ship commanded by a username           :4801
 *   cash        create credits                                     :4823
 *   goto        teleport to a sector                               :4830
 *   class       change this ship's class                           :4880
 *   shieldtype  change this ship's shields                         :4892
 *   phasertype  change this ship's phasers                         :4903
 *   maint       start fast maintenance                             :4913
 *   unjam       clear the jammer counter                           :4922
 *   list        list 50 ships from an offset                       :4929
 *   classlist   index of ship classes                              :4956
 *   cybpause    pause the Cybertrons for n seconds                 :4973
 *
 * `SYS_HELP_LINES` is canon's own help text, verbatim from the `prf` calls at
 * GECMDS.C:4762-4776, so `sys help` prints what the original printed.
 *
 * **Canon's own header comment (GECMDS.C:4728-4738) is stale — do not work
 * from it.** It advertises five subcommands that a player could never reach:
 *
 *   - `cyborg`, `cyborgoff`, `cybmine` are dispatched at :4852-:4877, but the
 *     whole block sits inside `#ifdef NOTHING` and `NOTHING` is never defined.
 *     Dead in the shipped build, like DEADSTOP. @see docs/audits/2026-09-05-canon-gaps.md
 *   - `cybhalt` and `cybstart` appear in that comment and nowhere else in the
 *     source. `cybpause` is what actually shipped.
 *
 * So this port is complete against canon, not thirteen-of-eighteen. Verified by
 * listing every `sameas("…",margv[1])` between :4742 and the end of cmd_sysop.
 *
 * **There is no sysop broadcast, in canon or here.** Nothing in this toolkit
 * sends a message. The only galaxy-wide send is an ordinary open hail — `sen`
 * on a channel whose frequency is 0, which reaches every ship via
 * `outwar(FILTER,usrnum,0)` (GEMAIN.C:1517) and which any player can silence
 * with `set filter on`. Adding an unfilterable announcement would be
 * port-original and needs a DECISIONS.md entry first.
 *
 * @see GECMDS.C:4742 cmd_sysop
 * @see test/game/commands/sys-commands.spec.ts
 * @see test/game/commands/handlers/sys-authorization.spec.ts
 */
@Injectable()
export class SysHandlerService {
  private readonly logger = new Logger(SysHandlerService.name);

  constructor(
    private readonly shipState: ShipStateService,
    private readonly prisma: PrismaService,
    private readonly cybControl: CybertronControlService,
    /**
     * The `User` repository. `@Optional()` with a default built over the same
     * client this class already holds, so the suite's direct
     * `new SysHandlerService(...)` sites keep compiling — and keep asserting
     * on the very same `prisma.user.*` calls, which is what proves the queries
     * did not change when they moved behind it. Nest injects the shared
     * provider in production. Safe ONLY because `UserRepository` is stateless
     * and constructible from `(prisma)` alone — see the statelessness note on
     * that class before adding a field or a constructor parameter to it.
     */
    @Optional()
    private readonly users: UserRepository = new UserRepository(prisma),
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
    await this.users.addCash(ship.userid, BigInt(amt));
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
    if (!target || !sysClassIsValid(n, classes.map((c) => c.classNumber))) {
      return SysHandlerService.huh();
    }

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

    // Canon matches the ship record's USERID, not a display name:
    //   if (genearas(margv[2], warshpoff(othusn)->userid))   -- GECMDS.C:4807
    //
    // In canon those are the same string. Here they are not: this port mints
    // `usr_<hex>` as the login id and keeps the handle separately, so a player
    // can only be named by their handle and an AI hull can only be named by
    // its userid — nothing boards an automaton, so `username` is never
    // hydrated on one. Matching EITHER is what restores canon's single
    // behaviour. Before this, `sys kill Cybrg-223` answered "Not found" for a
    // ship `sys list` was printing.
    //
    // `genearas` is a PREFIX match and that is kept, so `sys kill Cybrg-2`
    // kills every automaton in the galaxy. @see test/…/sys-kill.spec.ts
    const hits = this.shipState
      .findAllShips()
      .filter((s) =>
        (s.username ?? '').toLowerCase().startsWith(target)
        || s.userid.toLowerCase().startsWith(target));

    if (hits.length === 0) return SysHandlerService.say('Not found');

    for (const victim of hits) {
      this.shipState.mutate(victim.userid, victim.shipno, (s) => { s.damage = 101; });
    }
    this.audit(ship, 'kill', rest, `killed ${hits.length}: ${hits.map((h) => `${h.username ?? h.userid}#${h.shipno}`).join(', ')}`);
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
