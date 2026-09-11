import { Injectable, OnModuleInit, Logger, Optional } from '@nestjs/common';
import { showarp } from '../../ship/showarp';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserRepository } from '../../player/user.repository';
import { ShipStateService } from '../../ship/ship-state.service';
import { GalaxyService } from '../../galaxy/galaxy.service';
import { PlanetStateService } from '../../planet/planet-state.service';
import { MineRegistry } from '../../combat/mine.registry';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { cbearing } from '../../physics/physics-math';
import { UNIVMAX } from '../../constants';
import { buildScantab, Scantab } from './helpers/scantab';
import { findShip } from '../helpers/find-ship';
import { displayName } from '../../ship/display-name';
import { resolveScanSubcommand } from './helpers/scan-subcommand';
import { decideScanAnnouncement } from '../scan-announce';
import { inScanRange, damstr } from '../../combat/combat-math';
import { relativeBearing } from './scan/scan-strings';
import { renderLoScan, renderLoFullScan, renderRangeScan, renderSectorScan } from './scan/scan-render';
import { scanPl } from './scan/scan-planet';

/**
 * Handles the `scan` / `sc` command family.
 * `scan lo` (and bare `scan`) produce both text lines and a scanGrid payload.
 * `scan sh` and `scan pl` produce text-only responses.
 *
 * @see GECMDS.C:2138 cmd_scan
 * @see GECMDS.C:2640 scan_lo (range-centred tactical projection)
 * @see GECMDS.C:2190 scan_sh
 * @see GECMDS.C:2295 scan_pl (deviation: named lookup — research.md Decision 8)
 */

@Injectable()
export class ScanHandlerService implements OnModuleInit {
  private readonly logger = new Logger(ScanHandlerService.name);
  private readonly classCache = new Map<number, { scanRange: number; typeName: string; maxTons: number }>();

  /**
   * Per-player scantab state — keyed by `${userid}#${shipno}`.
   * Populated on `scan ra`/`scan se`; cleared on disconnect, death, or dock.
   * @see contracts/scan-render.md §3
   */
  private readonly scantabMap = new Map<string, Scantab>();

  constructor(
    private readonly shipService: ShipStateService,
    private readonly prisma: PrismaService,
    private readonly galaxyService: GalaxyService,
    private readonly planetService: PlanetStateService,
    /**
     * Deliberately NOT `@Optional()`. An optional dependency that nothing
     * provides resolves to undefined and the feature silently does nothing —
     * which is exactly how the physics tick's RANDOM went missing and the
     * missile shake never fired once in the live game.
     */
    private readonly mineRegistry: MineRegistry,
    /**
     * The `User` repository. `@Optional()` with a default built over the same
     * client this class already holds, so the suite's direct
     * `new ScanHandlerService(...)` sites keep compiling — and keep asserting
     * on the very same `prisma.user.*` calls, which is what proves the queries
     * did not change when they moved behind it. Nest injects the shared
     * provider in production. Safe ONLY because `UserRepository` is stateless
     * and constructible from `(prisma)` alone — see the statelessness note on
     * that class before adding a field or a constructor parameter to it.
     */
    @Optional()
    private readonly users: UserRepository = new UserRepository(prisma),
  ) {}

  /**
   * Remove the scantab entry for a player — idempotent (no-op for missing keys).
   * Call on disconnect, ship destruction, or dock.
   * @see contracts/scan-render.md §3
   */
  clearScantab(userid: string, shipno: number): void {
    this.scantabMap.delete(`${userid}#${shipno}`);
  }

  /**
   * The letter assignments a pilot last saw, for `loc`/`tor`/`mis`.
   *
   * Canon addresses ships by scan LETTER (GECMDS.C:1473-1487 findshp), so the
   * weapon and lock commands need the same table `sca` builds. Public because
   * they live in other handlers.
   */
  lettersFor(userid: string, shipno: number): ReadonlyArray<{ shipKey: string; letter: string }> {
    return (this.getScantab(userid, shipno) ?? []).map((e) => ({
      shipKey: e.shipKey,
      letter: e.letter,
    }));
  }

  private getScantab(userid: string, shipno: number): Scantab | null {
    return this.scantabMap.get(`${userid}#${shipno}`) ?? null;
  }

  private setScantab(userid: string, shipno: number, tab: Scantab): void {
    this.scantabMap.set(`${userid}#${shipno}`, tab);
  }

  private scanHelp(): CommandResult {
    return {
      lines: [
        { text: 'Usage: scan <mode>', category: 'system' },
        // `sh` needs a target — it reports one ship in detail. `pl` lists, then
        // takes a number for detail. Saying "ships in sector" implied `sca sh`
        // would list them, and it answers with this help instead.
        { text: '  sh <name|letter> — detail on one ship', category: 'system' },
        { text: '  pl [number]      — planets here, or detail on one', category: 'system' },
        { text: '  ra      — range scan (tactical grid)', category: 'system' },
        { text: '  se      — sector scan (wider view)', category: 'system' },
        { text: '  lo      — local scan', category: 'system' },
        { text: '  lo full — local scan, full detail', category: 'system' },
      ],
    };
  }

  async onModuleInit(): Promise<void> {
    const classes = await this.prisma.shipClass.findMany({
      select: { classNumber: true, scanRange: true, typeName: true, maxTons: true },
    });
    for (const cls of classes) {
      this.classCache.set(cls.classNumber, {
        scanRange: cls.scanRange,
        typeName: cls.typeName,
        maxTons: cls.maxTons,
      });
    }
    this.logger.log(`Cached ${this.classCache.size} ship class scan ranges`);
  }

  get command(): Command {
    return {
      keyword: 'scan',
      // 'sca' is the canonical verb in the original command table
      // (GECMDS.C:158). The router matches on the first 3 characters, so both
      // 'sca' and 'scan' resolve. The 2-char 'sc' is deliberately NOT an alias:
      // strncmp("sc","sca",3) compares '\0' against 'a', so the original
      // rejected it.
      aliases: ['sca'],
      minArgs: 0,
      argMissingMessage: formatMessage(MessageId.SCANFMT),
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    // @see GECMDS.C:2143 — tactical-computer gate (TABROKE)
    if (ship.tactical !== 0) {
      return { lines: [{ text: formatMessage(MessageId.TABROKE), category: 'system' }] };
    }
    // @see GECMDS.C:2150 — jammer gate (JAMMER4)
    if (ship.jammer > 0) {
      return { lines: [{ text: formatMessage(MessageId.JAMMER4), category: 'system' }] };
    }

    // C matches sub-commands with `genearas`, so `sca ship` and `sca planets`
    // work, and prints SCANFMT for a bare `sca` rather than defaulting to a
    // full local scan. @see GECMDS.C:2154, 2157-2172
    const sub = resolveScanSubcommand(args[0]);
    if (sub === null) return this.scanHelp();

    // NO not-in-flight guard. It cited three spec documents and no C line, and
    // the C contradicts it: scan_ra (GECMDS.C:2484), scan_se (:2580) and
    // scan_lo (:2640) test `where` nowhere. The only scan-side `where` test in
    // the file is scan_hy at :2737, inside `#ifdef NOTHING` — dead code.
    //
    // reference/README.md puts the C source above spec documents, so the spec
    // is wrong rather than the source. It mattered: orbit is exactly where a
    // pilot parks for minutes running `pri`, `new ship` and `buy`, and this
    // blinded them for the whole visit.

    if (sub === 'lo') {
      if (args[1]?.toLowerCase() === 'full') {
        return this.scanLoFull(ship);
      }
      return this.scanLo(ship);
    }

    if (sub === 'sh') {
      return this.scanSh(ship, args.slice(1));
    }

    if (sub === 'pl') {
      return await scanPl(ship, args.slice(1), { planetService: this.planetService, prisma: this.prisma, users: this.users });
    }

    if (sub === 'ra') {
      return this.handleRangeScan(ship, args.slice(1));
    }

    if (sub === 'se') {
      return this.handleSectorScan(ship);
    }

    return this.scanHelp();
  }

  /**
   * Range-centred tactical scan producing a scanGrid payload. Builds/updates
   * the scantab (owned here — see getScantab/setScantab) and delegates the
   * grid + header assembly to the pure renderer in `./scan/scan-render.ts`,
   * which carries the citation for this behaviour.
   */
  private scanLo(ship: ShipState): CommandResult {
    const classInfo = this.classCache.get(ship.shpclass);
    const scanRange = classInfo?.scanRange ?? 0;

    const prevScantab = this.getScantab(ship.userid, ship.shipno);
    const allShips = this.shipService.findAllShips();
    const newScantab = buildScantab(ship, allShips, prevScantab, scanRange);
    this.setScantab(ship.userid, ship.shipno, newScantab);

    return renderLoScan(ship, scanRange, allShips, newScantab);
  }

  /**
   * Full-detail tactical scan — same grid as `sca lo` but with a side-panel
   * legend. Scantab handling as `scanLo`; grid + panel assembly delegated to
   * the pure renderer in `./scan/scan-render.ts`, which carries the citation.
   */
  private scanLoFull(ship: ShipState): CommandResult {
    const classInfo = this.classCache.get(ship.shpclass);
    const scanRange = classInfo?.scanRange ?? 0;

    const prevScantab = this.getScantab(ship.userid, ship.shipno);
    const allShips = this.shipService.findAllShips();
    const newScantab = buildScantab(ship, allShips, prevScantab, scanRange);
    this.setScantab(ship.userid, ship.shipno, newScantab);

    return renderLoFullScan(ship, scanRange, allShips, newScantab);
  }

  /**
   * Range-radar scan — the only scan mode with an adjustable zoom level.
   * Builds/updates the scantab (owned here — see getScantab/setScantab) and
   * delegates grid + header assembly to the pure renderer in
   * `./scan/scan-render.ts`, which carries the citation.
   *
   * Not-in-flight guard is enforced centrally in handle() (spec 015 FR-011/SC-006).
   */
  private handleRangeScan(ship: ShipState, args: string[]): CommandResult {
    // Parse and coerce level: 0 | >9 | non-numeric | missing → 1
    let level = parseInt(args[0] ?? '', 10);
    if (isNaN(level) || level < 1 || level > 9) {
      level = 1;
    }

    const scanRange = this.classCache.get(ship.shpclass)?.scanRange ?? 0;

    // Build/update the scantab using the full scanRange for in-range detection
    const prevScantab = this.getScantab(ship.userid, ship.shipno);
    const allShips = this.shipService.findAllShips();
    const newScantab = buildScantab(ship, allShips, prevScantab, scanRange);
    this.setScantab(ship.userid, ship.shipno, newScantab);

    return renderRangeScan(ship, level, scanRange, allShips, newScantab, this.mineRegistry.getAll());
  }

  /**
   * Sector scan — projects all objects in the player's current 1×1 sector onto
   * a 30×15 grid at high resolution. Builds/updates the shared scantab (same
   * slot as `sca ra`) and resolves live mines/wormholes/planets, then
   * delegates grid assembly to the pure renderer in `./scan/scan-render.ts`,
   * which carries the citation. The `inGalaxy` guard stays here because
   * `GalaxyService.getSector*` throws outside `-UNIVMAX..+UNIVMAX`.
   */
  private handleSectorScan(ship: ShipState): CommandResult {
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);

    const scanRange = this.classCache.get(ship.shpclass)?.scanRange ?? 0;

    // Build / update the shared scantab (same slot as sca ra)
    const prevScantab = this.getScantab(ship.userid, ship.shipno);
    const allShips = this.shipService.findAllShips();
    const newScantab = buildScantab(ship, allShips, prevScantab, scanRange);
    this.setScantab(ship.userid, ship.shipno, newScantab);

    // The galaxy now covers the whole universe — sectors -UNIVMAX..+UNIVMAX on
    // both axes, matching where Cybertrons spawn (GECYBS.C:158
    // `rndm(univmax*2.0) - univmax`). It used to be generated only for
    // 0..MAXX-1 x 0..MAXY-1, so negative sectors had no terrain and the lookups
    // had to be skipped. The bound is the universe, and getSectorPlanets /
    // getSectorWormholes throw outside it, so keep guarding — a ship that has
    // wrapped mid-tick can momentarily sit on the boundary.
    const inGalaxy =
      xsect >= -UNIVMAX && xsect <= UNIVMAX && ysect >= -UNIVMAX && ysect <= UNIVMAX;

    const wormholes = inGalaxy ? this.galaxyService.getSectorWormholes(xsect, ysect) : [];
    const planets = inGalaxy ? this.galaxyService.getSectorPlanets(xsect, ysect) : [];

    return renderSectorScan(ship, allShips, newScantab, this.mineRegistry.getAll(), wormholes, planets);
  }

  /**
   * Text-only scan of a named ship — no scanGrid field.
   * Single-letter args do a scantab lookup (A..Z assigned by sca lo/ra/se) so that
   * `sca sh a` finds the ship the player scanned as 'A', not a name substring match.
   * Falls back to name search when arg is multi-char or the scantab has no such entry.
   * @see GECMDS.C:2190 scan_sh
   */
  private scanSh(ship: ShipState, args: string[]): CommandResult {
    if (args.length === 0) {
      return this.scanHelp();
    }
    const arg = args.join(' ');

    let target: ShipState | undefined;

    // `@` → whatever you are locked onto.
    //
    // Canon resolves a target argument through `findshp`, and `scan_sh` is one
    // of its four callers (GECMDS.C:2207) alongside cmd_torp, cmd_missl and
    // cmd_lock. The port's findShip helper already implements `@` — with the
    // stale-lock clearing and NOLOCK answer canon does at GECMDS.C:1461-1465 —
    // but `sca sh` parsed its argument by hand and had no `@` branch.
    //
    // It matters because the scan LETTERS shuffle while a lock holds a ship
    // identity: the letter you locked with may since belong to someone else,
    // and `sca sh @` is the only way to re-read your actual target without
    // guessing which letter it wears now.
    if (arg.trim() === '@') {
      const scanRange = this.classCache.get(ship.shpclass)?.scanRange ?? 0;
      const found = findShip(
        '@',
        ship,
        this.shipService.findAllShips(),
        scanRange,
        this.getScantab(ship.userid, ship.shipno) ?? undefined,
      );
      if (!found.ok) {
        return { lines: [{ text: found.message, category: 'system' }] };
      }
      target = found.ship;
    } else if (arg.length === 1 && /^[a-zA-Z]$/.test(arg)) {
      // Single alpha char → scantab lookup (letter-based targeting, as canon has it)
      const letter = arg.toUpperCase();
      const scantab = this.getScantab(ship.userid, ship.shipno);
      if (!scantab || scantab.length === 0) {
        return {
          lines: [{ text: 'No scan data. Run "sca lo" first to assign ship letters.', category: 'system' }],
        };
      }
      const entry = scantab.find((e) => e.letter === letter);
      if (!entry) {
        return {
          lines: [{ text: `No ship assigned letter ${letter}. Run "sca lo" to update scan.`, category: 'system' }],
        };
      }
      const hashIdx = entry.shipKey.lastIndexOf('#');
      const entryUserid = entry.shipKey.slice(0, hashIdx);
      const entryShipno = parseInt(entry.shipKey.slice(hashIdx + 1), 10);
      target = this.shipService.get(entryUserid, entryShipno);
      if (!target) {
        return {
          lines: [{ text: `Ship ${letter} is no longer active.`, category: 'system' }],
        };
      }
    } else {
      // Multi-char arg → name search
      target = this.shipService.findByName(arg);
      if (!target) {
        return {
          lines: [{ text: `No ship named "${arg}" found.`, category: 'system' }],
        };
      }
      // S-004: fully-cloaked targets are unscannable — mirrors C `findshp(name,1)`
      // which returns -1 for `wptr->cloak >= 10`. @see GECMDS.C:1511
      if (target.cloak >= 10) {
        return {
          lines: [{ text: `No ship named "${arg}" found.`, category: 'system' }],
        };
      }
    }
    // Block scanning self — GECMDS.C:2209 (prints FOOLISH)
    if (target.userid === ship.userid && target.shipno === ship.shipno) {
      return {
        lines: [{ text: 'You look in a mirror.', category: 'system' }],
      };
    }
    const classInfo = this.classCache.get(ship.shpclass);
    const scanRange = classInfo?.scanRange ?? 0;
    const dist = Math.sqrt(
      Math.pow(target.xcoord - ship.xcoord, 2) + Math.pow(target.ycoord - ship.ycoord, 2),
    );
    // Out of range — GECMDS.C:2220
    if (!inScanRange(ship, target, scanRange)) {
      return {
        lines: [{ text: `${target.shipname} is out of scanner range.`, category: 'system' }],
      };
    }
    const bearing = relativeBearing(ship, target);
    // SCAN03's second field is the RECIPROCAL bearing — where I am from HIM,
    // using HIS heading (GECMDS.C:2223). Near zero means his nose is on you.
    const reciprocal = Math.round(cbearing(target, ship, target.heading));
    const targetClass = this.classCache.get(target.shpclass);
    const maxTons = targetClass?.maxTons ?? 0;

    // C tells the scanned ship it was looked at, every time — reconnaissance
    // is never silent. @see GECMDS.C:2261-2280
    const announcement = this.buildScanAnnouncement(ship, target);

    // Canon's report, in canon's order. @see GECMDS.C:2226-2258
    const lines: CommandResult['lines'] = [
      { text: formatMessage(MessageId.SCAN01, target.shipname), category: 'info' },
      { text: formatMessage(MessageId.SCAN01A, targetClass?.typeName ?? `class ${target.shpclass}`), category: 'info' },
      // canon `prfmsg(SCAN02,username(wptr))` — the pilot's HANDLE, or the hull
      // name for AI. Printing `target.userid` put our synthetic account key on
      // a friend's scan report. @see GECMDS.C:2229, ship/display-name.ts
      { text: formatMessage(MessageId.SCAN02, displayName(target)), category: 'info' },
    ];
    // `if (warusroff(shpnum)->teamcode > 0)` — omitted entirely for a loner.
    if ((target.teamcode ?? 0n) > 0n) {
      lines.push({ text: formatMessage(MessageId.SCAN02A, String(target.teamcode)), category: 'info' });
    }
    lines.push(
      { text: formatMessage(MessageId.SCAN03, bearing, reciprocal, Math.round(dist * 10000)), category: 'info' },
      {
        text: formatMessage(
          MessageId.SCAN03A, Math.round(target.heading),
          Math.floor(target.xcoord), Math.floor(target.ycoord),
        ),
        category: 'info',
      },
      // The field that decides whether a fight is possible at all: above 999 a
      // torpedo cannot lock, and a target in hyperspace needs a Mark-PHATOWRP
      // phaser to touch. The port omitted it, and a pilot burned several
      // minutes shooting at a drone doing warp 5 with no way to know.
      { text: formatMessage(MessageId.SCAN04, showarp(target.speed)), category: 'info' },
      // `len = tons/32, wid = tons/96` — GECMDS.C:2240-2242
      {
        text: formatMessage(MessageId.SCAN04A, Math.trunc(maxTons / 32), Math.trunc(maxTons / 96)),
        category: 'info',
      },
    );

    // S-008: damage/shields/kills only when NEITHER ship is in hyperspace.
    // @see GECMDS.C:2244-2256 `warsptr->where != 1 && wptr->where != 1`
    if (ship.where !== 1 && target.where !== 1) {
      lines.push(
        { text: formatMessage(MessageId.SCAN05, damstr(target.damage)), category: 'info' },
        {
          text: formatMessage(target.shieldstat === 1 ? MessageId.SCAN06 : MessageId.SCAN07),
          category: 'info',
        },
        { text: formatMessage(MessageId.SCAN07A, target.kills), category: 'info' },
      );
    }

    return { lines, broadcasts: announcement };
  }

  /**
   * The message the scanned ship receives. C always sends one of SCAN1/2/3 via
   * `outprfge(FILTER, shpnum)`, so being looked at is information the other
   * pilot gets. The port sent nothing and the three messages existed nowhere.
   *
   * Delivered to a `ship:<userid>:<shipno>` room so it reaches exactly that
   * pilot, the way C addresses a single terminal.
   *
   * @see GECMDS.C:2261-2280
   */
  private buildScanAnnouncement(
    scanner: ShipState,
    target: ShipState,
  ): CommandResult['broadcasts'] {
    const targetRange = this.classCache.get(target.shpclass)?.scanRange ?? 0;
    // `ltr == '?'` — has the scanned ship ever scanned the scanner?
    const targetTab = this.getScantab(target.userid, target.shipno);
    const scannerKey = `${scanner.userid}#${scanner.shipno}`;
    const knows =
      targetTab?.some((e) => e.shipKey === scannerKey && e.letter !== '?') ?? false;

    const a = decideScanAnnouncement(
      { shipname: scanner.shipname, xcoord: scanner.xcoord, ycoord: scanner.ycoord },
      { xcoord: target.xcoord, ycoord: target.ycoord, heading: target.heading, scanRange: targetRange },
      knows,
    );

    const text =
      a.kind === 'SCAN1'
        ? formatMessage(MessageId.SCAN1, a.scannerName ?? '?')
        : a.kind === 'SCAN2'
          ? formatMessage(MessageId.SCAN2, a.bearing)
          : formatMessage(MessageId.SCAN3, a.bearing);

    return [
      {
        room: `ship:${target.userid}:${target.shipno}`,
        event: 'command.notice',
        payload: { lines: [{ text, category: 'combat' }] },
      },
    ];
  }

}
