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
  /**
   * Present on scan lo / bare scan, scan ra, scan se, scan lo full.
   * Replaces the old `scanGrid` field.
   * @see GECMDS.C:2640 scan_lo
   * @see specs/015-scan-modes/data-model.md §3
   * @see specs/015-scan-modes/contracts/scan-render.md §1
   */
  scanRender?: ScanRenderEvent;
  /** Scaffolded for feature 006 sector-room broadcasts; no in-scope command emits any. */
  broadcasts?: Array<{ room: string; event: string; payload: unknown }>;
  /** When true, the frontend should clear the event log AFTER appending lines.
   *  Used exclusively by the `cls` command. @see specs/016-navigation-spy/research.md D4 */
  clearLog?: boolean;
}

export interface CommandResultLine {
  text: string;
  category: 'system' | 'info' | 'success' | 'combat';
}

/**
 * A single cell on the scan grid.
 * @see specs/015-scan-modes/data-model.md §3
 */
export interface ScanCell {
  x: number;                                              // 0..29
  y: number;                                              // 0..14
  type: 'ship' | 'planet' | 'mine' | 'self' | 'wormhole';
  char: string;                                           // 'A'..'Z' | '1'..'9' | '.' | '*' | 'W'
  colour?: 'self' | 'human' | 'ai' | 'planet';           // omitted for mines / empty
}

/**
 * A single row in the side panel (ship/object legend) of the scan display.
 * @see specs/015-scan-modes/data-model.md §3
 */
export interface SidePanelRow {
  letter: string;       // 'A'..'Z'
  distance: number;     // integer parsecs
  bearing: number;      // 0..359
  heading: number;      // 0..359
  speedDisplay: string; // 'Warp 4.5' | 'Impulse' | 'Stopped'
  name?: string;        // present iff SCANNAMES on
}

/**
 * Structured scan render event emitted by scan command handlers.
 * @see specs/015-scan-modes/data-model.md §3
 * @see specs/015-scan-modes/contracts/scan-render.md §1
 */
export interface ScanRenderEvent {
  kind: 'ra' | 'se' | 'lo' | 'lo-full';
  mode: 'overwrite' | 'append';
  cells: ScanCell[];
  header: string;
  sidePanel?: SidePanelRow[];
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
