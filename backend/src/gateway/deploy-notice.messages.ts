import type { EventLogCategory } from '@ge/wire';

/** Which moment of a redeploy a notice describes. */
export enum DeployPhase {
  /** CI published an image. Watchtower polls every 5 minutes, so this is a RANGE. */
  INBOUND = 'inbound',
  /** Watchtower's pre-update hook — the container really is about to stop. */
  IMMINENT = 'imminent',
  /** SIGTERM. Best-effort: it races the socket close. */
  DOWN = 'down',
}

/**
 * PORT-ORIGINAL. Canon has no player-facing shutdown or sysop-broadcast text.
 *
 * The only shutdown path writes to the BBS log and nothing to a player — in
 * `clswara()`, GEMAIN.C:1475 `logthis("***GALACTIC EMPIRE SHUTDOWN***")` — and
 * `cmd_sysop` has no broadcast subcommand. A modem game never needed either:
 * the carrier just dropped, and there was no such thing as a redeploy.
 *
 * These imitate the REGISTER of canon's in-fiction shutdown reports — clipped,
 * addressed to "Sir", e.g. `Shields shut down, Sir.` (MBMGEMSG.MSG:2648) — so
 * they sound like the game without quoting anything that is in it.
 *
 * Kept OUT of game/commands/messages.ts deliberately: that table is canon's
 * message file, keyed by canon's own message ids. Nothing here has an ancestor
 * there to be keyed by.
 *
 * Byte-locked by test/gateway/deploy-notice-messages.spec.ts.
 * @see docs/DECISIONS.md 2026-09-20 — deploy warning broadcast
 */
export const DEPLOY_NOTICE_TEXT: Record<DeployPhase, string> = {
  // Deliberately vague. CI knows an image shipped; it does NOT know when
  // watchtower will pull it, so a precise countdown here would be a lie.
  [DeployPhase.INBOUND]:
    'Sensors read a Fleet Command carrier wave, Sir. Systems refit in 5 to 10 minutes. Nothing aboard will be lost.',
  // 45 seconds is REAL: watchtower blocks on the pre-update hook that sends this.
  [DeployPhase.IMMINENT]:
    'Fleet-wide systems shutdown in 45 seconds, Sir. Your ship holds station. Re-establish contact when comms return.',
  // A RESTART, not an ending. "Shutdown" belongs in the line above, where a
  // countdown gives it context; as the LAST thing before the socket closes it
  // reads like the game is over. "Stand by to resume" is what stops a player
  // closing the tab.
  [DeployPhase.DOWN]: 'Comms lost. Refit in progress — stand by to resume.',
};

/**
 * The imminent line is the only one asking the player to do anything, so it is
 * the only alert. `alert` already exists for exactly this: an unfilterable
 * line, as distinct from ordinary system chatter. @see packages/wire payloads
 */
export const DEPLOY_NOTICE_CATEGORY: Record<DeployPhase, EventLogCategory> = {
  [DeployPhase.INBOUND]: 'system',
  [DeployPhase.IMMINENT]: 'alert',
  [DeployPhase.DOWN]: 'system',
};

/**
 * How long the pre-update hook holds the deploy open, matching the wording of
 * the IMMINENT line above. Change one and change the other.
 * @see scripts/deploy-warn.mjs
 */
export const IMMINENT_COUNTDOWN_SECONDS = 45;
