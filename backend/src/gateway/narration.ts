import type { EventLogCategory } from '@ge/wire';
import { useridOf } from './ship-identity';
import { formatMessage, MessageId } from '../game/commands/messages';
import { showarp } from '../game/ship/showarp';
import { damstr } from '../game/combat/combat-math';
import type { PlanetBeaconEvent } from '../game/ship/beacon-events';
import type { ShipOverspeedEvent } from '../game/ship/overspeed-events';
import type { AttackOwnerAlertPayload } from '../game/planet/planet-attack.service';
import type { CombatDestructBlastEvent, CombatMineWarningEvent } from '../game/combat/combat-events';
import type {
  ShipSystemRepairedEvent,
  ShipPhaserChargeEvent,
  ShipStatusNoticeEvent,
} from '../game/ship/repair-events';
import type { PhysicsUniverseEdgeEvent, PhysicsGravityEvent, PhysicsDestructCancelledEvent } from '../game/physics/physics-events';
import type { ShipShieldChargeEvent } from '../game/ship/shield-events';
import type {
  ShipSpeedReportEvent,
  ShipWarpProgressEvent,
  ShipEngineShutdownEvent,
  ShipMissileShakenEvent,
} from '../game/physics/speed-events';
import type { CloakCollapsedPayload } from '../game/commands/ship-management-tick.service';

/** A single line of narration and the room it belongs to. */
export interface Narration {
  room: string;
  category: EventLogCategory;
  text: string;
}


/**
 * A colony's beacon, to the one captain who rolled it.
 *
 * Routed to `user:` and not the sector room on purpose: canon rolls per ship
 * inside the per-user movement path (GEFUNCS.C:809-813), so two pilots in the
 * same sector hear it on different ticks. A room broadcast would have the
 * colony shout at everyone in unison — a different, worse thing.
 */
export function narratePlanetBeacon(event: PlanetBeaconEvent): Narration {
  return {
    room: `user:${useridOf(event.shipId)}`,
    category: 'info',
    text: `*** Beacon Message from Planet # ${event.plnum} ${event.message}`,
  };
}

/**
 * Overspeed strain and engine failure — routed to the one captain it
 * happened to, as C does (`outprfge(FILTER,usrn)` / `ALWAYS`). These used to
 * be dropped entirely behind a stale TODO, so a pilot's first sign of
 * trouble was a dead warp drive. @see ship/overspeed-events.ts
 */
export function narrateShipOverspeed(event: ShipOverspeedEvent): Narration {
  return {
    room: `user:${useridOf(event.shipId)}`,
    category: 'combat',
    text: event.kind === 'break' ? `** ${event.text} **` : event.text,
  };
}

/** Planet-attack owner alert — emitted from PlanetAttackService.callForHelp. @see GECMDS.C:3952 call_4_help */
export function narrateAttackOwnerAlert(event: AttackOwnerAlertPayload): Narration {
  return {
    room: `user:${event.ownerUserid}`,
    category: 'system',
    text: event.message,
  };
}

/**
 * A ship caught in someone's self-destruct. Two lines, because shields
 * deflecting the blast reads differently from taking it bare, and the figure
 * is a damstr word. Addressed to that victim alone — canon uses
 * `outprfge(ALWAYS,zothusn)` inside the per-ship loop.
 * @see GEFUNCS.C:1878-1891
 */
export function narrateDestructBlast(event: CombatDestructBlastEvent): Narration {
  return {
    room: `user:${useridOf(event.victimId)}`,
    category: 'combat',
    text: formatMessage(
      event.shieldUp ? MessageId.DESTRUCT_BLAST_DEFLECTED : MessageId.DESTRUCT_BLAST_HIT,
      damstr(event.damage),
    ),
  };
}

/**
 * Damage Control reporting a system back online, to that ship alone.
 * @see GEFUNCS.C:1021 PHREPR, :1059 TAREPR, :1070 HLREPR, :1080 FCREPR
 */
export function narrateSystemRepaired(event: ShipSystemRepairedEvent): Narration {
  const messageId = {
    phaser: MessageId.REPAIR_PHASER,
    tactical: MessageId.REPAIR_TACTICAL,
    helm: MessageId.REPAIR_HELM,
    firecntl: MessageId.REPAIR_FIRECNTL,
  }[event.system];
  return {
    room: `user:${useridOf(event.shipId)}`,
    category: 'system',
    text: formatMessage(messageId),
  };
}

/**
 * The bank reporting it can fire, or that it is full.
 * @see GEFUNCS.C:1037 PHSRUP, :1046 PHSRMAX
 */
export function narratePhaserCharge(event: ShipPhaserChargeEvent): Narration {
  return {
    room: `user:${useridOf(event.shipId)}`,
    category: 'system',
    text: formatMessage(
      event.level === 'minimum' ? MessageId.PHASER_MIN_POWER : MessageId.PHASER_FULL_POWER,
    ),
  };
}

/**
 * State transitions the captain is told about but does not initiate.
 * @see GEFUNCS.C:1345, :2486, :1724, :1392, :422, :399
 */
export function narrateStatusNotice(event: ShipStatusNoticeEvent): Narration {
  const messageId = {
    'shields-no-power': MessageId.SHIELDS_NO_POWER,
    'shields-repaired': MessageId.SHIELDS_REPAIRED,
    'cloak-full': MessageId.CLOAK_FULL,
    'cloak-repaired': MessageId.CLOAK_REPAIRED,
    'maint-complete': MessageId.MAINT_COMPLETE,
    'maint-interrupted': MessageId.MAINT_INTERRUPTED,
  }[event.notice];
  return {
    room: `user:${useridOf(event.shipId)}`,
    category: 'system',
    text: formatMessage(messageId),
  };
}

/**
 * Mine proximity warning.
 *
 * C prints MINE6 with bearing and distance for a mine in range that has not
 * armed yet, and suppresses it while the ship is jammed (GEFUNCS.C:1472-1478).
 * The port emitted the event and nothing listened, so mines gave NO warning
 * at all — and a mine does up to MNDAMMAX to a hull that dies at 100.
 */
export function narrateCombatMineWarning(event: CombatMineWarningEvent): Narration {
  return {
    room: `user:${useridOf(event.victimId)}`,
    category: 'combat',
    text: formatMessage(MessageId.MINE6, event.bearing, event.distance),
  };
}

/**
 * Striking the galactic perimeter.
 *
 * telezip zeroes speed and speed2b and applies TELEDAM, then prints TELEPORT
 * (GEFUNCS.C:819-833). Emitted without a listener when UNIVWRAP was
 * implemented, which would have left a pilot stopped dead and damaged with no
 * explanation — the same silence this commit removes elsewhere.
 */
export function narrateUniverseEdge(event: PhysicsUniverseEdgeEvent): Narration {
  return {
    room: `user:${useridOf(event.shipId)}`,
    category: 'combat',
    text: `** You strike the galactic perimeter. All way comes off and the hull takes ${event.damage} damage. **`,
  };
}

/**
 * Shield charge narration — SHLDAT each tick while charging, SHLDUP at full
 * (GEFUNCS.C:2515-2523). Captain's own socket only; C uses
 * `outprfge(FILTER,usrn)`, not a sector broadcast.
 */
export function narrateShieldCharge(event: ShipShieldChargeEvent): Narration {
  return {
    room: `user:${useridOf(event.shipId)}`,
    category: 'system',
    text: event.kind === 'full'
      ? formatMessage(MessageId.SHLDUP)
      : formatMessage(MessageId.SHLDAT, event.percent),
  };
}

/**
 * The helm answering the throttle — SPEEDIS, or SPEED0 on a dead stop.
 *
 * `showarp` renders speed as "%.2f" warp factors (GEFUNCS.C:2681), so the
 * fraction is hundredths and is zero-padded; SPEEDIS's own "%d point %d"
 * cannot be taken literally because canon feeds it showarp's STRING, which is
 * a varargs bug. @see src/game/physics/speed-events.ts
 */
export function narrateSpeedReport(event: ShipSpeedReportEvent): Narration {
  // SPEEDIS {***\nHelm reports speed is now Warp %s, Sir!} takes ONE arg —
  // canon's showarp figure. The port split the number and printed "warp 10
  // point 00", a form nothing else in the game uses. @see GEFUNCS.C:2674
  const text = event.speed <= 0
    ? formatMessage(MessageId.SPEED0)
    : formatMessage(MessageId.SPEEDIS, showarp(event.speed));
  return { room: `user:${event.userid}`, category: 'system', text };
}

/**
 * The WARP ladder — one rung per integer warp factor crossed, both ways.
 * `outprfge(FILTER, usrn)`: the captain's own socket. @see GEFUNCS.C:498
 */
export function narrateWarpProgress(event: ShipWarpProgressEvent): Narration {
  return {
    room: `user:${event.userid}`,
    category: 'system',
    text: formatMessage(MessageId.HELM_WARP, event.warp),
  };
}

/**
 * The engines quitting. `outprfge(ALWAYS, usrn)` in canon — this one cannot
 * be filtered away, which is why it is 'alert' rather than 'system'.
 *
 * NOACCEL interpolates `(int)ptr->speed`, the RAW speed, so the line reads
 * "engine shutdown at warp 3000". That is canon's own varargs quirk and it is
 * reproduced rather than quietly corrected. @see GEFUNCS.C:528
 */
export function narrateEngineShutdown(event: ShipEngineShutdownEvent): Narration {
  return {
    room: `user:${event.userid}`,
    category: 'alert',
    text: formatMessage(MessageId.HELM_NOACCEL, event.speed),
  };
}

/**
 * A warp jump shook the missiles off. Canon prints MISSL2 once, however many
 * were tracking, to the captain's own socket — `outprfge(FILTER, usrn)`.
 * @see GEFUNCS.C:517-520
 */
export function narrateMissileShaken(event: ShipMissileShakenEvent): Narration {
  return {
    room: `user:${event.userid}`,
    category: 'combat',
    text: formatMessage(MessageId.MISSL2),
  };
}

/**
 * Gravity-well proximity. C prints GRAVITY1/2/3 for a planet and
 * GRAVWRM1/2/3 for a wormhole as you close on it (GEFUNCS.C:855-885); the
 * innermost band is where the physics tick writes the hull off or throws you
 * through. Without this the effect happened silently.
 */
export function narrateGravity(event: PhysicsGravityEvent): Narration {
  const userid = event.shipId.split(':')[0];
  const body = event.isWormhole ? `wormhole ${event.plnum}` : `planet ${event.plnum}`;
  const text =
    event.band === 1
      ? `You feel the pull of ${body}.`
      : event.band === 2
        ? `WARNING: ${body} is dragging you in — break away now.`
        : event.isWormhole
          ? `The wormhole takes you.`
          : `You have flown into ${body}.`;

  return {
    room: `user:${userid}`,
    category: event.band === 3 ? 'combat' : 'system',
    text,
  };
}

/** SELFD4 — reaching neutral space cancels an armed countdown. @see GEFUNCS.C:725-730 */
export function narrateDestructCancelled(event: PhysicsDestructCancelledEvent): Narration {
  const userid = event.shipId.split(':')[0];
  return {
    room: `user:${userid}`,
    category: 'system',
    text: 'Entering neutral space — the self-destruct sequence has been cancelled.',
  };
}

/** Per-captain cloak-collapsed notification (energy starvation). @see GEFUNCS.C:1374 */
export function narrateCloakCollapsed(event: CloakCollapsedPayload): Narration {
  return {
    room: `user:${event.userid}`,
    category: 'system',
    text: event.message,
  };
}
