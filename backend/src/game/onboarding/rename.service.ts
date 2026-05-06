import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ShipStateService } from '../ship/ship-state.service';
import { isValidShipName } from './name-validator';
import { shipKey } from '../ship/ship-state.types';

export type RenameResult =
  | { ok: true; oldName: string; newName: string; shipId: string }
  | { ok: false; reason: 'INVALID_FORMAT' | 'NAME_TAKEN' | 'SHIP_NOT_FOUND' };

/**
 * Validates and atomically renames a ship in DB and in-memory state.
 * @see GECMDS.C:5002 cmd_rename
 */
@Injectable()
export class RenameService {
  private readonly logger = new Logger(RenameService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shipStateService: ShipStateService,
  ) {}

  /**
   * Renames a ship, checking format validity and global name uniqueness first.
   * Excludes the ship's own current name from the uniqueness check so a
   * casing-only change (e.g. "falcon" → "Falcon") is always permitted.
   *
   * Returns ok:true with oldName === newName when the requested name is
   * byte-for-byte identical to the current name (no-op; no DB write).
   *
   * @see GECMDS.C:5002 cmd_rename
   */
  async rename(userid: string, shipno: number, newName: string): Promise<RenameResult> {
    if (!isValidShipName(newName)) {
      return { ok: false, reason: 'INVALID_FORMAT' };
    }

    const sid = shipKey(userid, shipno);

    // Resolve current in-memory state first
    const ship = this.shipStateService.get(userid, shipno);
    if (!ship) {
      return { ok: false, reason: 'SHIP_NOT_FOUND' };
    }

    const oldName = ship.shipname;

    // Byte-identical rename — no-op, skip DB write
    if (oldName === newName) {
      return { ok: true, oldName, newName, shipId: sid };
    }

    // Check uniqueness (case-insensitive), excluding own ship
    const conflict = await this.prisma.ship.findFirst({
      where: {
        shipname: { equals: newName, mode: 'insensitive' },
        NOT: { AND: [{ userid }, { shipno }] },
      },
    });

    if (conflict) {
      return { ok: false, reason: 'NAME_TAKEN' };
    }

    // Update DB row
    await this.prisma.ship.update({
      where: { userid_shipno: { userid, shipno } },
      data: { shipname: newName },
    });

    // Update in-memory state after successful DB write
    this.shipStateService.mutate(userid, shipno, (s) => {
      s.shipname = newName;
    });

    this.logger.log(`Renamed ${sid}: "${oldName}" → "${newName}"`);
    return { ok: true, oldName, newName, shipId: sid };
  }
}
