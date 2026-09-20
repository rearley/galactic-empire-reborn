/**
 * Payload interfaces for every event in {@link WIRE_EVENTS}.
 *
 * Each interface below is annotated with where it was moved from. Interfaces
 * marked "authored here" had no prior declaration anywhere in the codebase —
 * they are derived from the emit site(s) named in their comment, not invented.
 *
 * @see docs/superpowers/plans/2026-09-10-restructure-phase-1-wire-contract.md
 */

// ─── event.log ────────────────────────────────────────────────────────────

/**
 * Moved from `frontend/src/types/contracts.ts`, WIDENED to add `'alert'`.
 *
 * `game.gateway.ts`'s `handleEngineShutdown` (the `SHIP_ENGINE_SHUTDOWN`
 * handler) emits `category: 'alert'` for canon's unfilterable engine-shutdown
 * notice (GEFUNCS.C:528 `outprfge(ALWAYS,usrn);`) — deliberately distinct
 * from `'system'` per that handler's own comment. The frontend's
 * `CATEGORY_CLASS` lookup in `EventLog.tsx` falls back to a default style for
 * any key it does not recognise, so an un-widened declaration would not have
 * crashed the client — it would just have silently discarded canon's
 * distinction between an unfilterable alert and an ordinary system line. That
 * is real gameplay information the type should not be hiding.
 */
export type EventLogCategory =
  | 'system'
  | 'info'
  | 'success'
  | 'combat'
  | 'nav'
  | 'chat'
  | 'alert';

/**
 * Moved from `frontend/src/types/contracts.ts`. Payload of `event.log`.
 */
export interface EventLogLine {
  text: string;
  category: EventLogCategory;
}

// ─── deploy.notice ────────────────────────────────────────────────────────

/**
 * A redeploy is coming. Sent alongside the `event.log` line, not instead of it:
 * the log keeps the record, this drives the banner that makes it noticeable.
 *
 * It exists because a log line was not enough. The first production deploy to
 * warn anyone reached two players and ONE of them saw it — the other was not
 * watching the log, which scrolls. @see docs/DECISIONS.md 2026-09-20
 */
export interface DeployNoticePayload {
  /** `inbound` is a 5-10 minute heads-up; `imminent` is the real countdown. */
  phase: 'inbound' | 'imminent';
  /** The same words as the log line, so the two can never disagree. */
  text: string;
  /**
   * Seconds until the server stops, or 0 when there is no honest number to
   * give. `inbound` is always 0: CI cannot know when watchtower will pull.
   */
  seconds: number;
}

// ─── command:result / scan:render ────────────────────────────────────────

/**
 * Moved from `frontend/src/types/contracts.ts`. Object class for a
 * `scanGrid`/`scan:render` cell.
 *
 * `'self'` is the connecting player's own ship at the geometric centre of the
 * range-scan map (`map[MAXY/2][MAXX/2] = '*'` per `GECMDS.C:2721`).
 *
 * @see specs/003-ship-commands/spec.md `Clarifications` 2026-05-02 Q2
 */
export type ScanCellType = 'ship' | 'planet' | 'wormhole' | 'mine' | 'self';

/**
 * Range-scan grid dimensions, taken verbatim from the original game.
 * Moved from `frontend/src/types/contracts.ts`.
 *
 * Source: `reference/ge-source/GEMAIN.H` lines 121-122 — `#define MAXX 30`,
 * `#define MAXY 15`. These are the character dimensions of the ASCII scan
 * map viewport, NOT the size of the galaxy.
 *
 * @see GEMAIN.H:121
 * @see GEMAIN.H:122
 * @see GECMDS.C:2681 (xfactor / yfactor projection)
 * @see GECMDS.C:2721 (player-centre placement)
 */
export const SCAN_GRID_WIDTH = 30 as const;
export const SCAN_GRID_HEIGHT = 15 as const;

/**
 * Moved from `frontend/src/types/contracts.ts`, merged with the `colour`
 * field carried by `backend/src/game/commands/command.types.ts`'s `ScanCell`
 * (used only by the `scan:render` path).
 */
export interface ScanCell {
  /** integer 0..SCAN_GRID_WIDTH-1, range-scan column */
  x: number;
  /** integer 0..SCAN_GRID_HEIGHT-1, range-scan row */
  y: number;
  type: ScanCellType;
  /** The original game's single-ASCII character for this object. */
  char: string;
  /** Omitted for mines / empty. Only populated on the `scan:render` path. */
  colour?: 'self' | 'human' | 'ai' | 'planet';
}

/**
 * Moved from `backend/src/game/commands/command.types.ts`.
 * One row in the side panel (ship/object legend) of the scan display.
 */
export interface SidePanelRow {
  letter: string;
  distance: number;
  bearing: number;
  heading: number;
  speedDisplay: string;
  /** present iff SCANNAMES on */
  name?: string;
}

/**
 * Moved from `backend/src/game/commands/command.types.ts`. Payload of
 * `scan:render`.
 */
export interface ScanRenderEvent {
  kind: 'ra' | 'se' | 'lo' | 'lo-full';
  mode: 'overwrite' | 'append';
  cells: ScanCell[];
  header: string;
  sidePanel?: SidePanelRow[];
}

/**
 * Moved from `frontend/src/types/contracts.ts`. Payload of `command:result`.
 *
 * This mirrors what the gateway's `emitCommandResult` actually puts on the
 * wire for this event — the handler's `CommandResult` with `scanRender`
 * stripped out (that field is sent separately as `scan:render`). The backend
 * type carries several additional fields (`exitGame`, `fkeys`,
 * `reenterShipEntry`, `expectFollowup`, `broadcasts`) that are consumed
 * server-side before or alongside the emit rather than by this contract; the
 * frontend has never read them off `command:result` and none of that is
 * changed by this phase.
 */
export interface CommandResultPayload {
  lines: EventLogLine[];
  /** present only when the command was `scan` (or an alias), pre-`scan:render` era */
  scanGrid?: ScanCell[];
  /** When true, the frontend should clear the event log. Used by the `cls` command. */
  clearLog?: boolean;
}

// ─── error ────────────────────────────────────────────────────────────────

/**
 * Moved from `backend/src/gateway/game.gateway.ts:128`. Payload of `error`.
 */
export interface GatewayError {
  event?: string;
  code: string;
  message: string;
}

// ─── auth:logout ──────────────────────────────────────────────────────────

/**
 * Authored here from the single emit site,
 * `backend/src/gateway/game.gateway.ts` (`client.emit('auth:logout', { reason })`).
 * No prior interface existed anywhere.
 */
export interface AuthLogoutPayload {
  reason: string;
}

// ─── prompt:ship-name / prompt:ship-select ───────────────────────────────

/**
 * Authored here from the emit sites in `backend/src/gateway/game.gateway.ts`
 * (`prompt:ship-name`, three call sites). No prior interface existed anywhere.
 */
export interface PromptShipNamePayload {
  step: 'NAME';
  rule: string;
  /** Present only on a rejected reply. */
  error?: 'invalid-format' | 'name-taken';
}

/**
 * One fleet entry offered to a multi-ship account choosing which hull to board.
 * Authored here from `backend/src/gateway/game.gateway.ts` (`prompt:ship-select`,
 * two call sites). No prior interface existed anywhere.
 */
export interface ShipSelectEntry {
  index: number;
  shipno: number;
  className: string;
  shipname: string;
  sector: { x: number; y: number };
}

/**
 * Authored here from the emit sites in `backend/src/gateway/game.gateway.ts`
 * (`prompt:ship-select`, two call sites). No prior interface existed anywhere.
 */
export interface PromptShipSelectPayload {
  step: 'SHIP_SELECT';
  ships: ShipSelectEntry[];
  /**
   * Why the last reply was refused, when the menu is a RE-emit.
   *
   * Absent on the first prompt. The gateway re-emits this event on a bad reply,
   * and the client had a banner for it that nothing could ever fill, so a
   * captain who typed 9 of 2 — or picked a hull destroyed between the prompt
   * and the reply — saw the same menu again with no explanation. @see issue #6
   */
  error?: string;
}

// ─── player.* ─────────────────────────────────────────────────────────────

/** Moved from `frontend/src/types/contracts.ts`. Integer sector coordinates. */
export interface Sector {
  x: number;
  y: number;
}

/**
 * Moved from `frontend/src/types/contracts.ts`. A connected player visible to
 * other players in the galaxy.
 */
export interface ConnectedPlayer {
  shipId: string;
  name: string;
  /**
   * Where they are, or `null` when we are not allowed to know.
   * @see backend/src/gateway/player-visibility.ts
   */
  sector: Sector | null;
  shipClass: number;
}

/** Moved from `frontend/src/types/contracts.ts`. */
export interface PlayerSectorUpdate {
  shipId: string;
  sector: Sector | null;
}

/** Moved from `frontend/src/types/contracts.ts`. Payload of `player.sector`. */
export interface PlayerSectorPayload {
  updates: PlayerSectorUpdate[];
}

/** Moved from `frontend/src/types/contracts.ts`. Payload of `player.snapshot`. */
export interface PlayerSnapshotPayload {
  players: ConnectedPlayer[];
  /** The connecting client's own shipId — set by the server so the client can self-identify. */
  selfShipId?: string;
}

/** Moved from `frontend/src/types/contracts.ts`. Payload of `player.joined`. */
export type PlayerJoinedPayload = ConnectedPlayer;

/** Moved from `frontend/src/types/contracts.ts`. Payload of `player.left`. */
export interface PlayerLeftPayload {
  shipId: string;
}

// ─── fkeys.snapshot ───────────────────────────────────────────────────────

/**
 * Authored here from the emit sites in `backend/src/gateway/game.gateway.ts`
 * (`fkeys.snapshot`, three call sites). No prior interface existed anywhere.
 */
export interface FkeysSnapshotPayload {
  fkeys: string[];
}

// ─── physics.sector-transition ───────────────────────────────────────────

/** Moved from `frontend/src/types/contracts.ts`. A single ship's sector transition within one physics tick. */
export interface SectorTransition {
  shipId: string;
  fromSector: Sector;
  toSector: Sector;
}

/**
 * Moved from `frontend/src/types/contracts.ts`. Payload of
 * `physics.sector-transition`.
 */
export interface PhysicsSectorTransitionPayload {
  shipId: string;
  fromSector: Sector;
  toSector: Sector;
  x: number;
  y: number;
}

// ─── sector:ship-left / sector:ship-entered ──────────────────────────────

/**
 * Authored here from the emit sites in `backend/src/gateway/game.gateway.ts`
 * (`sector:ship-left`, `sector:ship-entered`). No prior interface existed
 * anywhere; both events share this shape.
 */
export interface SectorShipTransitPayload {
  shipId: string;
  shipName: string;
}

// ─── combat.* ─────────────────────────────────────────────────────────────
// Moved from `backend/src/game/combat/combat-events.ts`.

/** Composite ship key: "userid:shipno" — mirrors ShipState identity. */
export type ShipKey = string;

export interface CombatPhaserFiredEvent {
  /**
   * The firing ship's NAME, resolved by the gateway. AI are absent from the
   * client's roster, so without it the event renders as a userid — and canon
   * names an AI by its hull. @see GEFUNCS.C:2596 username
   */
  shipName?: string | null;
  shipId: string;
  bearing: number;
  percent: number;
  hyper: boolean;
  sector: { x: number; y: number };
  tickAt: Date;
}

export interface CombatHitEvent {
  attackerId: string;
  /**
   * The attacking SHIP's name — the identifier `sca sh` accepts. Filled in by
   * the gateway; absent if the attacker has since left the world.
   */
  attackerName?: string;
  victimId: string;
  /** The victim SHIP's name, for the same reason as `attackerName`. */
  victimName?: string;
  /**
   * `hyper-phaser` is a distinct weapon, not a phaser variant: it is the only
   * thing that can reach a ship at warp (HPHITM/HPHITU, GECMDS.C:1074-1076).
   */
  weapon: 'phaser' | 'hyper-phaser' | 'torpedo' | 'missile' | 'mine';
  damageHull: number;
  damageShield: number;
  sector: { x: number; y: number };
  tickAt: Date;
}

/**
 * Payload actually put on the wire for `combat.phaser-fired`, built field by
 * field in `backend/src/gateway/game.gateway.ts` — NOT spread from the event.
 *
 * Narrower than `CombatPhaserFiredEvent` above, which is the internal domain
 * event. It goes to the firer's own user room, so the fields here are that
 * pilot's own instrument readings; `sector` and `tickAt` are engine internals
 * the client never reads. @see issue #4
 */
export interface CombatPhaserFiredPayload {
  shipId: string;
  shipName?: string | null;
  bearing: number;
  percent: number;
  hyper: boolean;
}

/**
 * What ended a ship: a weapon, or one of the causes that has no attacker at
 * all. Split in two on the backend (`ShipDestroyedWeapon` / `ShipDeathCause`)
 * and flattened here, because the client only ever asks "what does the manifest
 * say" — @see backend/src/game/combat/combat-events.ts, issue #54
 */
export type ShipDestroyedCause =
  | 'phaser' | 'torpedo' | 'missile' | 'mine' | 'ion'
  | 'gravity' | 'teleport' | 'wormhole' | 'overspeed' | 'neutral-zone';

/**
 * Payload actually put on the wire for `combat.hit`, built field by field in
 * `backend/src/gateway/game.gateway.ts` — NOT spread from the event.
 *
 * Narrower than `CombatHitEvent` above for the reason
 * `CombatShipDestroyedPayload` is narrower than its event: this one goes to a
 * whole sector room, and to an out-of-sector victim directly, so spreading it
 * published the firing ship's exact sector to anyone who fights — and to a
 * pilot who had no other way to learn where the shot came from. The client
 * renders seven fields; this is the seven it receives.
 *
 * @see backend/test/gateway/hit-payload-scoping.spec.ts
 * @see frontend/src/features/combat/combatNarration.ts
 */
export interface CombatHitPayload {
  attackerId: string;
  attackerName?: string;
  victimId: string;
  victimName?: string;
  weapon: 'phaser' | 'hyper-phaser' | 'torpedo' | 'missile' | 'mine';
  damageHull: number;
  damageShield: number;
}

export interface CombatMissEvent {
  attackerId: string;
  weapon: 'phaser';
  sector: { x: number; y: number };
  tickAt: Date;
}

export interface CombatDecoyInterceptEvent {
  defenderId: string;
  attackerId: string;
  weapon: 'torpedo' | 'missile';
  sector: { x: number; y: number };
  tickAt: Date;
}

export interface CombatMineDetonationEvent {
  mineId: number;
  channel: number;
  sector: { x: number; y: number };
  tickAt: Date;
}

export interface CombatShipDestroyedEvent {
  victimId: string;
  attackerId: string | null;
  /** Ship key "userid:shipno" — required by CybertronTickService gold transfer (T012, FR-005a). */
  victimShipKey: string;
  /** Ship key "userid:shipno" or null — required by CybertronTickService gold transfer (T012). */
  attackerShipKey: string | null;
  /** Plain userid — allows /^Cybrg-/ regex match without parsing the ship key (T012, R-4). */
  victimUserid: string;
  /** Plain userid or null — required by gold-transfer attacker lookup (T012). */
  attackerUserid: string | null;
  attackerChannel: number;
  /**
   * `'ion'` means a planet's cannons made the kill — there is no attacking
   * ship. @see planet-kill.ts, GEFUNCS.C:1797 fireion
   */
  cause: ShipDestroyedCause | null;
  /** Who or WHAT to name when no attacking SHIP resolves — the planet, for an ion kill or a collision. */
  attackerName?: string | null;
  sector: { x: number; y: number };
  tickAt: Date;
  /**
   * Why the victim's socket closed, when the death came from the disconnect
   * path — Socket.io's own reason string, verbatim. Absent for every other
   * cause of death.
   */
  victimDisconnectReason?: string;
  /** Items looted from victim — GEFUNCS.C:killem (1122-1136). Empty when no attacker or no transfer. */
  loot: Array<{ itemIndex: number; amount: bigint }>;
  /**
   * The victim's ship name and class, for the killer's salvage report.
   * @see GEFUNCS.C:1120, :1187
   */
  victimShipname?: string;
  victimClass?: number;
  /** Points awarded on this kill — shipClass.points for victim's class. 0 if class unknown. @see GEFUNCS.C:killem (1145) */
  scoreAwarded: number;
}

/**
 * Payload actually put on the wire for `combat.ship-destroyed` by
 * `backend/src/gateway/game.gateway.ts` (search "Built field by field, NOT
 * spread from the event"). Deliberately narrower than the internal
 * `CombatShipDestroyedEvent` above, which drives score transfer, loot, the
 * ship-loss mail and the forensics log server-side: spreading it onto a
 * galaxy-wide emit would publish the kill's exact sector, the internal
 * account keys `displayName()` exists to hide, the destroyed hull's cargo,
 * and `victimDisconnectReason`. The client renders four fields; this is the
 * four it receives.
 *
 * @see docs/audits/2026-09-09-security-review.md
 * @see backend/test/gateway/destroyed-payload-scoping.spec.ts
 */
export interface CombatShipDestroyedPayload {
  victimId: string;
  attackerId: string | null;
  cause: ShipDestroyedCause | null;
  attackerName: string | null;
}

// ─── cybertron.* ──────────────────────────────────────────────────────────
// Moved from `backend/src/game/cybertron/cybertron-events.ts`.

/**
 * Fired by cyb_annoy when a Cybertron taunts a player.
 * Gateway delivers to target's socket AND broadcasts to target's sector room.
 * @see GECYBS.C:379 cyb_annoy
 */
export interface CybertronTauntPayload {
  attackerShipKey: ShipKey;
  targetShipKey: ShipKey;
  message: string;
  /**
   * Which of the four 3.2e message bands this line came from — APPROACH,
   * BRAKE, DECLINE or ATTACK. @see GECYBS.C:295, 300, 769, 782, 801
   */
  band?: 'APPROACH' | 'BRAKE' | 'DECLINE' | 'ATTACK';
  sector: { x: number; y: number };
  tickAt: number;
}

/**
 * Fired when the 1-in-CYB_BREAKOFF roll succeeds for a non-quad Cybertron.
 * Gateway delivers "lucky day" message to former target.
 * @see GECYBS.C:255 cyb_lives — CYB_BREAKOFF roll
 * @see GEMAIN.H CYB_BREAKOFF=500
 */
export interface CybertronBrokeOffPayload {
  attackerShipKey: ShipKey;
  targetShipKey: ShipKey;
  sector: { x: number; y: number };
  tickAt: number;
}

// ─── droid.* ──────────────────────────────────────────────────────────────
// Moved from `backend/src/game/droid/droid-events.ts`.

/**
 * Fired when a Droid scans an in-range player and the annoy roll succeeds,
 * or when a Droid emits a call-for-help message to its attacker.
 * @see GEDROIDS.C:237 droid_annoy — gernd()%4 == 1
 */
export interface DroidAnnoyEvent {
  fromShipKey: ShipKey;
  fromShipname: string;
  toUserid: string;
  toShipno: number;
  message: string;
  sector: { x: number; y: number };
  tickAt: number;
  /** 31 = Garbage Scow, 32 = Murdonian Transport, 33 = Vakory Survey Drone */
  classNumber: number;
  /** 'passive' = scan-range annoy; 'help' = fight-back call-for-help */
  variant: 'passive' | 'help';
}

/**
 * Fired on each successful Droid spawn. Bridged by GameGateway to the sector room.
 * @see GEDROIDS.C:98 droid_init
 */
export interface DroidSpawnedEvent {
  /** Droid userid, e.g. '@Droid-7'. */
  shipId: string;
  shipname: string;
  /** Ship class: 31 (Scow), 32 (Murdonian Transport), 33 (Vakory Survey Drone). */
  shpclass: number;
  sector: { x: number; y: number };
  /** Literal constant — droids are never persisted. */
  ephemeral: true;
  spawnedAt: number;
}

/**
 * Fired on each Droid death. Bridged by GameGateway to the sector room and
 * the global 'kills' channel.
 * @see GEDROIDS.C:534 droid_died
 */
export interface DroidKilledEvent {
  shipId: string;
  shipname: string;
  shpclass: number;
  sector: { x: number; y: number };
  /** Attacker userid, or null for mine kills. */
  killedBy: string | null;
  killedAt: number;
}

// ─── beacon ───────────────────────────────────────────────────────────────

/**
 * Moved from `backend/src/gateway/events/beacon.event.ts`.
 * @see GEFUNCS.C:808-816 — beacon-on-move logic
 * @see specs/020-source-fidelity-audit/contracts/beacon-event.md
 */
export interface BeaconEvent {
  shipId: string;
  shipName: string;
  fromSector: number;
  toSector: number;
}

// ─── command.notice ───────────────────────────────────────────────────────

/**
 * Authored here from the sole emit site,
 * `backend/src/game/commands/handlers/scan.handler.ts`, delivered via the
 * dynamic broadcast path (`room: 'ship:<userid>:<shipno>'`). No prior
 * interface existed anywhere.
 */
export interface CommandNoticePayload {
  lines: EventLogLine[];
}

// ─── message.send ─────────────────────────────────────────────────────────

/**
 * Authored here from the sole emit site,
 * `backend/src/game/commands/handlers/sen.handler.ts`, delivered via the
 * dynamic broadcast path. No prior interface existed anywhere.
 */
export interface MessageSendPayload {
  from: string;
  channel: string;
  text: string;
}

// ─── ship.renamed ─────────────────────────────────────────────────────────

/**
 * Moved from `frontend/src/types/contracts.ts`. Delivered via the dynamic
 * broadcast path from `backend/src/game/commands/handlers/rename.handler.ts`.
 */
export interface ShipRenamedPayload {
  shipId: string;
  oldName: string;
  newName: string;
}

// ─── command (client-to-server) ──────────────────────────────────────────

/** Moved from `frontend/src/types/contracts.ts`. Inbound: client → server `command`. */
export interface CommandRequest {
  input: string;
}

// ─── prompt:reply (client-to-server) ─────────────────────────────────────

/**
 * Authored here from `backend/src/gateway/game.gateway.ts`'s
 * `PromptReplyPayload` (`{ value: unknown }`). No prior EXPORTED interface
 * existed — the backend's version was file-local.
 */
export interface PromptReplyPayload {
  value: unknown;
}
