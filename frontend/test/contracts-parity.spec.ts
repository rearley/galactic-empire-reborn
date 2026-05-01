import { describe, it, expect } from 'vitest';
import type {
  EventLogCategory,
  EventLogLine,
  ScanCellType,
  ScanCell,
  CommandRequest,
  CommandResultPayload,
} from '../src/types/contracts';
import {
  SCAN_GRID_WIDTH,
  SCAN_GRID_HEIGHT,
} from '../src/types/contracts';
import type {
  EventLogCategory as CanonicalEventLogCategory,
  EventLogLine as CanonicalEventLogLine,
  ScanCellType as CanonicalScanCellType,
  ScanCell as CanonicalScanCell,
  CommandRequest as CanonicalCommandRequest,
  CommandResultPayload as CanonicalCommandResultPayload,
} from '../../specs/003-ship-commands/contracts/shared-types';
import {
  SCAN_GRID_WIDTH as CanonicalScanGridWidth,
  SCAN_GRID_HEIGHT as CanonicalScanGridHeight,
} from '../../specs/003-ship-commands/contracts/shared-types';

describe('contracts parity', () => {
  it('SCAN_GRID_WIDTH matches canonical', () => {
    expect(SCAN_GRID_WIDTH).toBe(CanonicalScanGridWidth);
  });

  it('SCAN_GRID_HEIGHT matches canonical', () => {
    expect(SCAN_GRID_HEIGHT).toBe(CanonicalScanGridHeight);
  });

  it('SCAN_GRID_WIDTH is 30 per GEMAIN.H:121', () => {
    expect(SCAN_GRID_WIDTH).toBe(30);
  });

  it('SCAN_GRID_HEIGHT is 15 per GEMAIN.H:122', () => {
    expect(SCAN_GRID_HEIGHT).toBe(15);
  });
});

// TypeScript structural checks — these fail at compile time if shapes diverge.
// They are no-op at runtime; the compile-time check is the gate.
type AssertEqualCategory = EventLogCategory extends CanonicalEventLogCategory
  ? CanonicalEventLogCategory extends EventLogCategory
    ? true
    : never
  : never;
type AssertEqualLine = EventLogLine extends CanonicalEventLogLine
  ? CanonicalEventLogLine extends EventLogLine
    ? true
    : never
  : never;
type AssertEqualCellType = ScanCellType extends CanonicalScanCellType
  ? CanonicalScanCellType extends ScanCellType
    ? true
    : never
  : never;
type AssertEqualCell = ScanCell extends CanonicalScanCell
  ? CanonicalScanCell extends ScanCell
    ? true
    : never
  : never;
type AssertEqualReq = CommandRequest extends CanonicalCommandRequest
  ? CanonicalCommandRequest extends CommandRequest
    ? true
    : never
  : never;
type AssertEqualPayload = CommandResultPayload extends CanonicalCommandResultPayload
  ? CanonicalCommandResultPayload extends CommandResultPayload
    ? true
    : never
  : never;

const _checks: [AssertEqualCategory, AssertEqualLine, AssertEqualCellType, AssertEqualCell, AssertEqualReq, AssertEqualPayload] = [true, true, true, true, true, true];
void _checks;
