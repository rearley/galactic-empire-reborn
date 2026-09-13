import type { CommandResultPayload, EventLogLine } from '@ge/wire';

/**
 * Handles a `command:result` payload by either appending lines to the log
 * or clearing the log entirely (when `clearLog` is true).
 *
 * Extracted from App.tsx useEffect so it can be unit-tested independently.
 * Called by App.tsx's `useEffect([lastResult])`.
 *
 * When `clearLog` is true, the log is cleared regardless of any lines in the
 * payload — the `cls` command sends an empty lines array so this is moot in
 * practice, but the contract is: clearLog wins.
 *
 * @see GECMDS.C:117 cmd_cls
 * @see specs/016-navigation-spy/tasks.md T031
 */
export function handleCommandResult(
  result: CommandResultPayload,
  appendLines: (lines: EventLogLine[]) => void,
  clearLines: () => void,
): void {
  if (result.clearLog === true) {
    clearLines();
    return;
  }
  if (result.lines.length > 0) {
    appendLines(result.lines);
  }
}
