import { ShipState } from '../ship/ship-state.types';

/**
 * Context available to every command handler — injected services, socket client.
 */
export interface CommandContext {
  /** Raw Socket.io client for emitting side-effects (sector broadcasts etc.). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any;
}

/**
 * Wire result returned by a command handler to the gateway.
 * @see specs/003-ship-commands/contracts/websocket-events.md
 */
export interface CommandResult {
  lines: CommandResultLine[];
  /** Present only on scan lo / bare scan. @see GECMDS.C:2640 scan_lo */
  scanGrid?: ScanCell[];
  /** Scaffolded for feature 006 sector-room broadcasts; no in-scope command emits any. */
  broadcasts?: Array<{ room: string; event: string; payload: unknown }>;
}

export interface CommandResultLine {
  text: string;
  category: 'system' | 'info' | 'success' | 'combat';
}

export interface ScanCell {
  x: number;
  y: number;
  type: 'ship' | 'planet' | 'wormhole' | 'self';
  char: string;
}

/**
 * A registered command with its keyword, aliases, and handler.
 * @see GECMDS.C:111-225 command table
 */
export interface Command {
  /** Canonical lower-case keyword (e.g. 'impulse'). */
  keyword: string;
  /** Recognised short forms (e.g. ['imp']). @see GECMDS.C command table aliases */
  aliases: string[];
  /** Minimum positional args after the keyword. */
  minArgs: number;
  /** Message id string to return when minArgs not met. */
  argMissingMessage: string;
  /** Pure handler — mutates ship state in-place, returns result lines. */
  handler: CommandHandler;
}

/**
 * @param ship  The active ship state (may be mutated in-place).
 * @param args  Tokenised args, post-split, post-trim (keyword already consumed).
 * @param ctx   Injected context (socket client, etc.).
 */
export type CommandHandler = (
  ship: ShipState,
  args: string[],
  ctx: CommandContext,
) => CommandResult | Promise<CommandResult>;
