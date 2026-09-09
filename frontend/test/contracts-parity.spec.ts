import { describe, it, expect } from 'vitest';
import type {
  EventLogCategory,
  EventLogLine,
  ScanCellType,
  ScanCell,
  CommandRequest,
  CommandResultPayload,
  Sector,
  ConnectedPlayer,
  PlayerSnapshotPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  SectorTransition,
  PhysicsSectorTransitionPayload,
} from '../src/types/contracts';
import {
  SCAN_GRID_WIDTH,
  SCAN_GRID_HEIGHT,
  PLAYER_SNAPSHOT,
  PLAYER_JOINED,
  PLAYER_LEFT,
  PHYSICS_SECTOR_TRANSITION,
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

// ─── T004: New 010 wire types — exported and structurally correct ─────────────

describe('player presence & sector-transition types', () => {
  it('PLAYER_SNAPSHOT constant equals "player.snapshot"', () => {
    expect(PLAYER_SNAPSHOT).toBe('player.snapshot');
  });

  it('PLAYER_JOINED constant equals "player.joined"', () => {
    expect(PLAYER_JOINED).toBe('player.joined');
  });

  it('PLAYER_LEFT constant equals "player.left"', () => {
    expect(PLAYER_LEFT).toBe('player.left');
  });

  it('PHYSICS_SECTOR_TRANSITION constant equals "physics.sector-transition"', () => {
    expect(PHYSICS_SECTOR_TRANSITION).toBe('physics.sector-transition');
  });

  it('PlayerSnapshotPayload accepts a correctly-shaped value', () => {
    const sector: Sector = { x: 3, y: 7 };
    const player: ConnectedPlayer = { shipId: 'abc', name: 'Test', sector, shipClass: 2 };
    const payload: PlayerSnapshotPayload = { players: [player] };
    expect(payload.players).toHaveLength(1);
    expect(payload.players[0].shipId).toBe('abc');
  });

  it('PlayerJoinedPayload accepts a correctly-shaped value', () => {
    const joined: PlayerJoinedPayload = {
      shipId: 'xyz',
      name: 'Pilot',
      sector: { x: 0, y: 0 },
      shipClass: 5,
    };
    expect(joined.shipId).toBe('xyz');
    expect(joined.sector?.x).toBe(0);
  });

  it('PlayerLeftPayload accepts a correctly-shaped value', () => {
    const left: PlayerLeftPayload = { shipId: 'gone' };
    expect(left.shipId).toBe('gone');
  });

  it('PhysicsSectorTransitionPayload accepts a correctly-shaped value', () => {
    const transition: SectorTransition = {
      shipId: 'ship1',
      fromSector: { x: 1, y: 2 },
      toSector: { x: 1, y: 3 },
    };
    const payload: PhysicsSectorTransitionPayload = { ...transition, x: 1.5, y: 3.5 };
    expect(payload.shipId).toBe('ship1');
    expect(payload.fromSector.y).toBe(2);
    expect(payload.toSector.y).toBe(3);
  });
});

// TypeScript structural checks for the new 010 types.
// These are no-op at runtime; the compile-time check is the gate.
type _Sector = Sector extends { x: number; y: number } ? true : never;
type _ConnectedPlayer = ConnectedPlayer extends {
  // `sector` is nullable on the wire: the server sends null rather than a
  // position the viewer is not allowed to see.
  // @see backend/src/gateway/player-visibility.ts
  shipId: string; name: string; sector: Sector | null; shipClass: number;
} ? true : never;
type _PlayerSnapshotPayload = PlayerSnapshotPayload extends { players: ConnectedPlayer[] } ? true : never;
type _PlayerJoinedPayloadFwd = PlayerJoinedPayload extends ConnectedPlayer ? true : never;
type _PlayerJoinedPayloadBwd = ConnectedPlayer extends PlayerJoinedPayload ? true : never;
type _PlayerLeftPayload = PlayerLeftPayload extends { shipId: string } ? true : never;
type _SectorTransition = SectorTransition extends {
  shipId: string; fromSector: Sector; toSector: Sector;
} ? true : never;
type _PhysicsSectorTransitionPayload = PhysicsSectorTransitionPayload extends {
  shipId: string; fromSector: Sector; toSector: Sector; x: number; y: number;
} ? true : never;

const _newChecks: [_Sector, _ConnectedPlayer, _PlayerSnapshotPayload, _PlayerJoinedPayloadFwd, _PlayerJoinedPayloadBwd, _PlayerLeftPayload, _SectorTransition, _PhysicsSectorTransitionPayload] = [true, true, true, true, true, true, true, true];
void _newChecks;
