/**
 * T027 — Unit spec for handleCommandResult.
 * Verifies clearLog behaviour: clears when true, preserves log when undefined/false.
 * @see specs/016-navigation-spy/tasks.md T027
 */
import { describe, it, expect, vi } from 'vitest';
import { handleCommandResult } from '../command-result-handlers';
import type { CommandResultPayload, EventLogLine } from '../../types/contracts';

function makeLine(text: string): EventLogLine {
  return { text, category: 'info' };
}

describe('handleCommandResult', () => {
  it('clearLog: true → calls clearLines instead of appendLines', () => {
    const appendLines = vi.fn();
    const clearLines = vi.fn();
    const payload: CommandResultPayload = { lines: [], clearLog: true };

    handleCommandResult(payload, appendLines, clearLines);

    expect(clearLines).toHaveBeenCalledTimes(1);
    expect(appendLines).not.toHaveBeenCalled();
  });

  it('clearLog: true with lines → clears first then does NOT append (log is cleared)', () => {
    const appendLines = vi.fn();
    const clearLines = vi.fn();
    const payload: CommandResultPayload = {
      lines: [makeLine('leftover')],
      clearLog: true,
    };

    handleCommandResult(payload, appendLines, clearLines);

    expect(clearLines).toHaveBeenCalledTimes(1);
    expect(appendLines).not.toHaveBeenCalled();
  });

  it('clearLog: undefined → appendLines called, clearLines NOT called', () => {
    const appendLines = vi.fn();
    const clearLines = vi.fn();
    const payload: CommandResultPayload = {
      lines: [makeLine('hello'), makeLine('world')],
    };

    handleCommandResult(payload, appendLines, clearLines);

    expect(appendLines).toHaveBeenCalledWith([makeLine('hello'), makeLine('world')]);
    expect(clearLines).not.toHaveBeenCalled();
  });

  it('clearLog: false → appendLines called, clearLines NOT called', () => {
    const appendLines = vi.fn();
    const clearLines = vi.fn();
    const payload: CommandResultPayload = {
      lines: [makeLine('hi')],
      clearLog: false,
    };

    handleCommandResult(payload, appendLines, clearLines);

    expect(appendLines).toHaveBeenCalledWith([makeLine('hi')]);
    expect(clearLines).not.toHaveBeenCalled();
  });

  it('no lines, no clearLog → appendLines NOT called (empty array no-op)', () => {
    const appendLines = vi.fn();
    const clearLines = vi.fn();
    const payload: CommandResultPayload = { lines: [] };

    handleCommandResult(payload, appendLines, clearLines);

    expect(appendLines).not.toHaveBeenCalled();
    expect(clearLines).not.toHaveBeenCalled();
  });
});
