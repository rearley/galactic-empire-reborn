import type {
  EventLogLine,
  CommandResultPayload,
  ScanRenderEvent,
  GatewayError,
  AuthLogoutPayload,
  PromptShipNamePayload,
  PromptShipSelectPayload,
  PlayerSnapshotPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PlayerSectorPayload,
  FkeysSnapshotPayload,
  PhysicsSectorTransitionPayload,
  SectorShipTransitPayload,
  CombatPhaserFiredEvent,
  CombatHitEvent,
  CombatMissEvent,
  CombatDecoyInterceptEvent,
  CombatMineDetonationEvent,
  CombatShipDestroyedPayload,
  CybertronTauntPayload,
  CybertronBrokeOffPayload,
  DroidAnnoyEvent,
  DroidSpawnedEvent,
  DroidKilledEvent,
  BeaconEvent,
  CommandNoticePayload,
  MessageSendPayload,
  ShipRenamedPayload,
  CommandRequest,
  PromptReplyPayload,
} from './payloads';

/**
 * Socket.io's typed-events generic, one entry per name in
 * `WIRE_EVENTS.SERVER_TO_CLIENT`, keyed by the exact wire string (not the
 * `WIRE_EVENTS` property name) so this type can be handed directly to
 * `Server<ClientToServerEvents, ServerToClientEvents>`.
 *
 * @see docs/superpowers/plans/2026-09-10-restructure-phase-1-wire-contract.md
 */
export interface ServerToClientEvents {
  'event.log': (payload: EventLogLine) => void;
  'command:result': (payload: CommandResultPayload) => void;
  'scan:render': (payload: ScanRenderEvent) => void;
  error: (payload: GatewayError) => void;
  'auth:logout': (payload: AuthLogoutPayload) => void;
  'prompt:ship-name': (payload: PromptShipNamePayload) => void;
  'prompt:ship-select': (payload: PromptShipSelectPayload) => void;
  'player.snapshot': (payload: PlayerSnapshotPayload) => void;
  'player.joined': (payload: PlayerJoinedPayload) => void;
  'player.left': (payload: PlayerLeftPayload) => void;
  'player.sector': (payload: PlayerSectorPayload) => void;
  'fkeys.snapshot': (payload: FkeysSnapshotPayload) => void;
  'physics.sector-transition': (payload: PhysicsSectorTransitionPayload) => void;
  'sector:ship-left': (payload: SectorShipTransitPayload) => void;
  'sector:ship-entered': (payload: SectorShipTransitPayload) => void;
  'combat.phaser-fired': (payload: CombatPhaserFiredEvent) => void;
  'combat.hit': (payload: CombatHitEvent) => void;
  'combat.miss': (payload: CombatMissEvent) => void;
  'combat.decoy-intercept': (payload: CombatDecoyInterceptEvent) => void;
  'combat.mine-detonation': (payload: CombatMineDetonationEvent) => void;
  'combat.ship-destroyed': (payload: CombatShipDestroyedPayload) => void;
  'cybertron.taunt': (payload: CybertronTauntPayload) => void;
  'cybertron.broke-off': (payload: CybertronBrokeOffPayload) => void;
  'droid.annoy': (payload: DroidAnnoyEvent) => void;
  'droid.spawned': (payload: DroidSpawnedEvent) => void;
  'droid.killed': (payload: DroidKilledEvent) => void;
  beacon: (payload: BeaconEvent) => void;
  'command.notice': (payload: CommandNoticePayload) => void;
  'message.send': (payload: MessageSendPayload) => void;
  'ship.renamed': (payload: ShipRenamedPayload) => void;
}

/**
 * Socket.io's typed-events generic for the two inbound events.
 */
export interface ClientToServerEvents {
  command: (payload: CommandRequest) => void;
  'prompt:reply': (payload: PromptReplyPayload) => void;
}
