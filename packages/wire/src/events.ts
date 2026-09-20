/**
 * Every Socket.io event name crossing the wire between the NestJS backend and
 * the React frontend.
 *
 * These strings are FROZEN. Eight of the thirty server-to-client names use a
 * colon (`command:result`, `scan:render`, `auth:logout`, `prompt:ship-name`,
 * `prompt:ship-select`, `sector:ship-left`, `sector:ship-entered`, and inbound
 * `prompt:reply`) and the rest use a dot. This is inconsistent and was left
 * that way on purpose: renaming buys cosmetic consistency and risks a missed
 * call site, and a silently dropped event in a real-time game errors nowhere
 * — the message simply never arrives. Copy each string exactly as it exists
 * in the code, do not normalise it.
 *
 * Gathered by reading the source, not from the plan's table:
 * `backend/src/gateway/game.gateway.ts`, `backend/src/auth/ws-auth.guard.ts`,
 * `backend/src/game/combat/combat-events.ts`,
 * `backend/src/game/cybertron/cybertron-events.ts`,
 * `backend/src/game/droid/droid-events.ts`,
 * `backend/src/gateway/events/beacon.event.ts`.
 *
 * @see docs/superpowers/plans/2026-09-10-restructure-phase-1-wire-contract.md
 */

export const WIRE_EVENTS = {
  SERVER_TO_CLIENT: {
    /** Emitted at ~45 call sites across the gateway. Listened to by the frontend event log. */
    EVENT_LOG: 'event.log',
    /** Emitted by `emitCommandResult` for every command reply. Listened to by the frontend command-result handler. */
    COMMAND_RESULT: 'command:result',
    /** Emitted alongside `command:result` when a command produced a scan render. Listened to by the frontend ScanPanel. */
    SCAN_RENDER: 'scan:render',
    /** Emitted by the gateway and `WsAuthGuard` on a rejected request. Listened to by the frontend error toast/handler. */
    ERROR: 'error',
    /** Emitted when a second connection for the same account bumps this socket. Listened to by the frontend auth flow. */
    AUTH_LOGOUT: 'auth:logout',
    /** Emitted during onboarding to prompt for a ship name. Listened to by the frontend onboarding flow. */
    PROMPT_SHIP_NAME: 'prompt:ship-name',
    /** Emitted when a multi-ship account must choose which hull to board. Listened to by the frontend onboarding flow. */
    PROMPT_SHIP_SELECT: 'prompt:ship-select',
    /** Emitted on connect and on `player.snapshot` broadcasts. Listened to by the frontend player roster. */
    PLAYER_SNAPSHOT: 'player.snapshot',
    /** Emitted when a new player boards. Listened to by the frontend player roster. */
    PLAYER_JOINED: 'player.joined',
    /** Emitted when a player disconnects or their ship is destroyed. Listened to by the frontend player roster. */
    PLAYER_LEFT: 'player.left',
    /** Emitted with scoped position updates for players visible to this client. Listened to by the frontend player roster. */
    PLAYER_SECTOR: 'player.sector',
    /** Emitted whenever a command result carries updated F-key bindings. Listened to by the frontend F-key map. */
    FKEYS_SNAPSHOT: 'fkeys.snapshot',
    /** Emitted to the moving ship's own socket when it crosses a sector boundary. Listened to by the frontend map/HUD. */
    PHYSICS_SECTOR_TRANSITION: 'physics.sector-transition',
    /** Emitted to a sector room when a ship leaves it. Listened to by the frontend sector roster. */
    SECTOR_SHIP_LEFT: 'sector:ship-left',
    /** Emitted to a sector room when a ship enters it. Listened to by the frontend sector roster. */
    SECTOR_SHIP_ENTERED: 'sector:ship-entered',
    /** Emitted to the firer on a phaser discharge. Listened to by the frontend combat log. */
    COMBAT_PHASER_FIRED: 'combat.phaser-fired',
    /** Emitted to the sector room (and the victim directly, cross-sector) on a landed hit. Listened to by the frontend combat log. */
    COMBAT_HIT: 'combat.hit',
    /**
     * Emitted to the sector room on a phaser miss.
     * RECORDED, NOT ENDORSED: the frontend has no listener for this event today.
     * A later phase decides whether that is dead code or an unfinished feature.
     */
    COMBAT_MISS: 'combat.miss',
    /** Emitted to the sector room when a decoy intercepts a torpedo/missile. Listened to by the frontend combat log. */
    COMBAT_DECOY_INTERCEPT: 'combat.decoy-intercept',
    /**
     * Emitted to the sector room on a mine detonation.
     * RECORDED, NOT ENDORSED: the frontend has no listener for this event today.
     * A later phase decides whether that is dead code or an unfinished feature.
     */
    COMBAT_MINE_DETONATION: 'combat.mine-detonation',
    /** Emitted globally when a ship is destroyed. Listened to by the frontend kill feed. */
    COMBAT_SHIP_DESTROYED: 'combat.ship-destroyed',
    /** Emitted to a target's socket and sector room when a Cybertron taunts them. Listened to by the frontend combat/chat log. */
    CYBERTRON_TAUNT: 'cybertron.taunt',
    /**
     * Emitted when a Cybertron's break-off roll succeeds.
     * RECORDED, NOT ENDORSED: the frontend has no listener for this event today.
     * A later phase decides whether that is dead code or an unfinished feature.
     */
    CYBERTRON_BROKE_OFF: 'cybertron.broke-off',
    /** Emitted when a Droid taunts or calls for help. Listened to by the frontend combat/chat log. */
    DROID_ANNOY: 'droid.annoy',
    /** Emitted on Droid spawn. Listened to by the frontend sector roster. */
    DROID_SPAWNED: 'droid.spawned',
    /** Emitted on Droid death. Listened to by the frontend sector roster and kill feed. */
    DROID_KILLED: 'droid.killed',
    /**
     * Emitted to a sector room on a beacon sighting during a sector transition.
     * RECORDED, NOT ENDORSED: the frontend has no listener for this event today.
     * It has a spec contract (`specs/020-source-fidelity-audit/contracts/beacon-event.md`)
     * and a payload interface, so the missing listener may be an unfinished
     * feature rather than dead code. A later phase decides.
     */
    BEACON: 'beacon',
    /**
     * Emitted to a single ship's room via the dynamic broadcast path (e.g. `sca sh`).
     * RECORDED, NOT ENDORSED: the frontend has no listener for this event today.
     * A later phase decides whether that is dead code or an unfinished feature.
     */
    COMMAND_NOTICE: 'command.notice',
    /** Emitted via the dynamic broadcast path when a player sends a message. Listened to by the frontend event log. */
    MESSAGE_SEND: 'message.send',
    /** Emitted via the dynamic broadcast path when a player renames their ship. Listened to by the frontend player roster. */
    SHIP_RENAMED: 'ship.renamed',
    /** Emitted with the event.log line when a redeploy is announced. Listened to by the frontend deploy banner. */
    DEPLOY_NOTICE: 'deploy.notice',
  },
  CLIENT_TO_SERVER: {
    /** `@SubscribeMessage('command')` — free-text command input. */
    COMMAND: 'command',
    /** `@SubscribeMessage('prompt:reply')` — reply to an outstanding onboarding prompt. */
    PROMPT_REPLY: 'prompt:reply',
  },
} as const;

Object.freeze(WIRE_EVENTS.SERVER_TO_CLIENT);
Object.freeze(WIRE_EVENTS.CLIENT_TO_SERVER);
Object.freeze(WIRE_EVENTS);
