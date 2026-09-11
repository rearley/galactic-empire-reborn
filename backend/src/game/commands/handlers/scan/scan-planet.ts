import { PrismaService } from '../../../../prisma/prisma.service';
import { UserRepository } from '../../../player/user.repository';
import { PlanetStateService } from '../../../planet/planet-state.service';
import { CommandResult } from '../../command.types';
import { formatMessage, MessageId } from '../../messages';
import { ShipState } from '../../../ship/ship-state.types';
import { ITEM_NAMES, capitaliseItem, I_MEN, I_TROOPS, I_MISSL, I_TORP, I_FLUX, I_FOOD, I_FIGHTER } from '../../../constants/items';
import { planetOwnerLabel, isNeutralZoneOwner, NEUTRAL_ZONE_OWNER_DISPLAY } from '../../../combat/neutral-zone';
import { scanDistanceUnits } from '../helpers/scan-distance';
import {
  fmt,
  populationBand,
  stockpileBand,
  relativeBearing,
  QUALITY,
  SCAN28_POPULATED,
  SCAN29_MISSILES,
  SCAN30_TORPEDOES,
  SCAN31_NO_FIGHTERS,
  SCAN32_FIGHTERS,
  SCAN33_FLUXPODS,
  SCAN34_FOOD,
  SCANWRM,
  SCANWRM1,
} from './scan-strings';

/**
 * Dependencies `scanPl` needs from `ScanHandlerService` — the injected
 * Prisma/PlanetStateService handles, passed through rather than owned here.
 * Neither is mutable state belonging to the scan handler (scantab is; see
 * `ScanHandlerService.getScantab`/`setScantab`), so threading them through as
 * plain parameters keeps this module a pure function of its inputs.
 */
export interface ScanPlanetDeps {
  planetService: PlanetStateService;
  prisma: PrismaService;
  users: UserRepository;
}

/**
 * The wormhole occupying slot `plnum` in this sector, if any.
 *
 * Wormholes share the planet slot space in C (`sector.planets[]` holds both,
 * discriminated by `type`), but our read models split them: GalaxyService's
 * wormhole view carries no slot number and no name, so the row itself is the
 * only place both live. Positions and names are fixed at generation, so a
 * point read on a rare command is cheap.
 *
 * @see GEMAIN.H:467 GALWORM  @see GECMDS.C:2455
 */
async function findSectorWormhole(
  prisma: PrismaService,
  xsect: number,
  ysect: number,
  plnum: number,
): Promise<{ xcoord: number; ycoord: number; name: string } | null> {
  const row = await prisma.wormhole.findFirst({
    where: { xsect, ysect, plnum },
    select: { xcoord: true, ycoord: true, name: true },
  });
  return row ?? null;
}

/**
 * The wormhole readout: class, optional name, bearing and distance — no
 * environment, no resources, no inventory. C prints exactly these four
 * messages between two rules.
 *
 * No `visible` gate: C's scan_pl tests only `plptr->type`, so a slot number
 * that names a wormhole reports one whether or not the map is drawing it.
 *
 * @see GECMDS.C:2455-2468, MBMGEMSG.MSG:3673-3676
 */
function scanWormhole(
  ship: ShipState,
  worm: { xcoord: number; ycoord: number; name: string },
): CommandResult {
  const lines: CommandResult['lines'] = [
    { text: SCANWRM, category: 'info' },
  ];
  if (worm.name) {
    lines.push({ text: fmt(SCANWRM1, worm.name), category: 'info' });
  }
  lines.push({ text: formatMessage(MessageId.SCAN_DASHES), category: 'info' });
  const dist = Math.sqrt(
    Math.pow(worm.xcoord - ship.xcoord, 2) + Math.pow(worm.ycoord - ship.ycoord, 2),
  );
  lines.push({
    text: formatMessage(MessageId.SCAN10, relativeBearing(ship, worm), scanDistanceUnits(dist)),
    category: 'info',
  });
  lines.push({ text: formatMessage(MessageId.SCAN_DASHES), category: 'info' });
  return { lines };
}

/**
 * Text-only planet lookup by name — galaxy-wide named-planet resolution.
 * Deviation from original: original used numeric plnum in current sector.
 * @see GECMDS.C:2295 scan_pl (deviation documented in research.md Decision 8)
 * @see contracts/scan-projection.md §"scan pl"
 */
export async function scanPl(
  ship: ShipState,
  args: string[],
  deps: ScanPlanetDeps,
): Promise<CommandResult> {
  const { planetService, prisma, users } = deps;
  const xsect = Math.floor(ship.xcoord);
  const ysect = Math.floor(ship.ycoord);

  // No arg → list planets in current sector (@see GECMDS.C:2295 plnum loop)
  //
  // Read the LIVE planet state, not GalaxyService's read-model: that one
  // hydrates once at boot and is never updated, so a planet claimed since
  // startup still listed as "(unnamed)" with no owner. Players scanned a
  // sector, picked what looked like a free planet, flew to it and only found
  // out it was taken when the landing was refused.
  if (args.length === 0) {
    const sectorPlanets = planetService.bySector(xsect, ysect);
    if (sectorPlanets.length === 0) {
      return { lines: [{ text: 'No planets in this sector.', category: 'system' }] };
    }
    const lines: CommandResult['lines'] = [
      { text: `Planets in sector (${xsect}, ${ysect}):`, category: 'system' },
    ];
    for (const p of sectorPlanets) {
      const label = p.name ? `${p.plnum}. ${p.name}` : `${p.plnum}. (unnamed)`;
      const owner = planetOwnerLabel(p.userid);
      lines.push({ text: `  ${label}${owner}`, category: 'info' });
    }
    // Wormholes share the planet slot space, so their numbers belong in the
    // same list -- otherwise `sca pl 3` on a wormhole slot looks like a bug.
    // Only VISIBLE ones: the listing is our addition (C's `sca pl` demands an
    // argument, GECMDS.C:2303-2309), and a hidden wormhole is hidden.
    const worms = await prisma.wormhole.findMany({
      where: { xsect, ysect, visible: 1 },
      select: { plnum: true, name: true },
    });
    for (const w of worms) {
      lines.push({
        text: `  ${w.plnum}. ${w.name || '(unnamed)'} — wormhole`,
        category: 'info',
      });
    }
    lines.push({ text: 'Use "sca pl <number>" to scan a planet.', category: 'system' });
    return { lines };
  }

  // Numeric arg → plnum lookup in current sector (original GECMDS.C:2295)
  const num = parseInt(args[0], 10);
  let planet = !isNaN(num) && String(num) === args[0]
    ? planetService.bySector(xsect, ysect).find((p) => p.plnum === num) ?? null
    : null;

  // Name arg → cross-sector lookup (deviation D8)
  if (!planet) {
    planet = planetService.byName(args.join(' ')) ?? null;
  }

  // A wormhole occupies a planet slot in the sector, so `sca pl <n>` can name
  // one. C falls through to `plptr->type == PLTYPE_WORM` after the planet
  // branch and prints class, name, bearing and distance.
  // @see GECMDS.C:2455-2468
  if (!planet && !isNaN(num) && String(num) === args[0]) {
    const worm = await findSectorWormhole(prisma, xsect, ysect, num);
    if (worm) return scanWormhole(ship, worm);
  }

  if (!planet) {
    return {
      lines: [{ text: formatMessage(MessageId.NO_SUCH_PLANET), category: 'system' }],
    };
  }

  const lines: CommandResult['lines'] = [];

  // GECMDS.C:2326 — Planet #<plnum>: <name>
  lines.push({
    text: formatMessage(MessageId.SCAN08, planet.plnum, planet.name),
    category: 'info',
  });

  // GECMDS.C:2327 — dashes
  lines.push({ text: formatMessage(MessageId.SCAN_DASHES), category: 'info' });

  // GECMDS.C:2330 — ownership (optional)
  if (planet.userid) {
    // The neutral sentinel has no User row; resolving it through Prisma is
    // both a wasted query and how `**neutral**` reached the player's screen.
    const ownerUsername = isNeutralZoneOwner(planet.userid)
      ? null
      : await users.getUsername(planet.userid);
    const ownerName = isNeutralZoneOwner(planet.userid)
      ? NEUTRAL_ZONE_OWNER_DISPLAY
      : ownerUsername ?? planet.userid;
    lines.push({
      text: formatMessage(MessageId.SCAN09, ownerName),
      category: 'info',
    });
  }

  // GECMDS.C:2332 — bearing/distance only when planet is in player's sector
  // Omitted for cross-sector lookups (research.md Decision 8)
  if (planet.xsect === xsect && planet.ysect === ysect) {
    const dist = Math.sqrt(
      Math.pow(planet.xcoord - ship.xcoord, 2) +
      Math.pow(planet.ycoord - ship.ycoord, 2),
    );
    // C uses the same cbearing(from, to, heading) call here as for ships
    // (GECMDS.C:2324 vs :2222). This was a literal 0 behind a TODO, so every
    // planet in a sector reported bearing 0 and there was no way to steer to
    // the one worth claiming.
    lines.push({
      text: formatMessage(MessageId.SCAN10, relativeBearing(ship, planet), scanDistanceUnits(dist)),
      category: 'info',
    });
  }

  // GECMDS.C:2337-2349 — environment
  const envIdx = Math.max(0, Math.min(3, planet.enviorn));
  const envStr = formatMessage(QUALITY[envIdx]);
  lines.push({
    text: formatMessage(MessageId.SCAN11) + envStr,
    category: 'info',
  });

  // GECMDS.C:2350-2356 — resources (table-driven like env)
  const resIdx = Math.max(0, Math.min(3, planet.resource));
  const resStr = formatMessage(QUALITY[resIdx]);
  lines.push({
    text: formatMessage(MessageId.SCAN16) + resStr,
    category: 'info',
  });

  // Cross-sector location line
  if (planet.xsect !== xsect || planet.ysect !== ysect) {
    lines.push({
      text: formatMessage(MessageId.SCAN_LOCATED_IN, planet.xsect, planet.ysect),
      category: 'info',
    });
  }

  // Beacon visibility — research Decision 10
  const planetState = planetService.get(planet.xsect, planet.ysect, planet.plnum);
  if (planetState?.beacon) {
    lines.push({
      text: formatMessage(MessageId.SCAN_BEACON, planet.name || `planet ${planet.plnum}`, planetState.beacon),
      category: 'info',
    });
  }

  // Owner vs. everyone else. C branches on `sameas(plptr->userid,
  // warsptr->userid)`: the owner gets the exact per-item inventory, and a
  // stranger gets the reconnaissance summary — bands, not numbers. The port
  // implemented neither half for the owner and none at all for the stranger,
  // which is what made scouting pointless: nothing in `sca pl` told you
  // whether a colony was defended.
  // @see GECMDS.C:2365-2448
  //
  // The spy-owner reveal is our documented deviation (D3): a planted spy buys
  // the owner's view.
  const viewer = ship.userid.toLowerCase();
  const isOwner = !!planetState?.userid && planetState.userid.toLowerCase() === viewer;
  const isSpy = !!planetState?.spyowner && planetState.spyowner.toLowerCase() === viewer;

  if (planetState && (isOwner || isSpy)) {
    if (!isOwner) lines.push({ text: 'Spy intel — Planet Inventory:', category: 'info' });
    for (let i = 0; i < planetState.items.length; i++) {
      const it = planetState.items[i];
      if (it && it.qty > 0n) {
        const selling = it.sell ? ' (selling)' : '';
        lines.push({
          // `gechrbuf[0] = toupper(gechrbuf[0])` on the owner's item list.
          // @see GECMDS.C:2371-2372
          text: `  ${capitaliseItem(ITEM_NAMES[i])}:  ${it.qty}${selling}`,
          category: 'info',
        });
      }
    }
  } else if (planetState) {
    const qty = (i: number): bigint => planetState.items[i]?.qty ?? 0n;

    lines.push({
      text: fmt(SCAN28_POPULATED, populationBand(qty(I_MEN) + qty(I_TROOPS))),
      category: 'info',
    });
    lines.push({ text: fmt(SCAN29_MISSILES, stockpileBand(qty(I_MISSL))), category: 'info' });
    lines.push({ text: fmt(SCAN30_TORPEDOES, stockpileBand(qty(I_TORP))), category: 'info' });
    lines.push({ text: fmt(SCAN33_FLUXPODS, stockpileBand(qty(I_FLUX))), category: 'info' });
    lines.push({ text: fmt(SCAN34_FOOD, stockpileBand(qty(I_FOOD))), category: 'info' });
    lines.push({
      text: qty(I_FIGHTER) === 0n ? SCAN31_NO_FIGHTERS : SCAN32_FIGHTERS,
      category: 'info',
    });
  } else {
    // Neither branch is reachable without live planet state — ownership
    // itself is read from it — so say so rather than returning a header with
    // nothing under it. In practice both lookup paths now come from
    // PlanetStateService, so this is a "should not happen" that reports
    // itself instead of looking like an undefended colony.
    lines.push({
      text: 'Sensors cannot resolve that planet right now, Sir!',
      category: 'system',
    });
  }

  return { lines };
}
