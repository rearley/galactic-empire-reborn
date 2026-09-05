import { Injectable } from '@nestjs/common';
import { ScanHandlerService } from './scan.handler';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState, shipKey } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { findShip, NOLOCK_SENTINEL } from '../helpers/find-ship';

/**
 * Handles `loc <target>` — sets `ship.lock = target.shipno` for later
 * `@`-resolution by combat commands (torpedo, missile, etc.).
 *
 * Validations (per GECMDS.C:1441-1471 cmd_lock):
 *   1. ship.jammer === 0           → else JAMMER4 (FR-017, GECMDS.C:1354-1358)
 *   2. target found in scan range  → else surface findShip message
 *   3. target !== self             → else LOC_SELF
 *
 * Side effect: mutates `ship.lock` to the target's `shipno` channel.
 * If `findShip` indicates the lock was lazily cleared (stale @-target),
 * persists `lock = NOLOCK_SENTINEL` on the context ship.
 *
 * @see GECMDS.C:1441-1471 cmd_lock
 * @see GECMDS.C:1354-1358 JAMMER4 reject
 */
@Injectable()
export class LockHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly shipClassCache: ShipClassCacheService,
    // Canon resolves a target by SCAN LETTER (GECMDS.C:1473-1487), so this
    // needs the table `sca` builds. @see ScanHandlerService.lettersFor
    private readonly scanHandler: ScanHandlerService,
  ) {}

  readonly command: Command = {
    keyword: 'loc',
    aliases: ['lock'],
    minArgs: 1,
    argMissingMessage: formatMessage(MessageId.LOC_FMT),
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult => {
      return this.handle(ship, args);
    },
  };

  private handle(ship: ShipState, args: string[]): CommandResult {
    // 1. Fire control damaged — GECMDS.C:1346-1351 lockon first check (C-010, Fix 1)
    if (ship.firecntl > 0) {
      return { lines: [{ text: formatMessage(MessageId.FCBROKE), category: 'system' }] };
    }

    // 2. Jammer reject — cannot acquire locks while jammed.
    if (ship.jammer > 0) {
      return { lines: [{ text: formatMessage(MessageId.JAMMER4), category: 'system' }] };
    }

    const query = args[0] ?? '';

    // 2a. Self-name reject — if the query (case-insensitive prefix) matches
    // our own shipname, surface LOC_SELF rather than findShip's
    // generic "no such ship" (findShip silently excludes self).
    const trimmed = query.trim();
    if (
      trimmed.length > 0 && trimmed !== '@' &&
      ship.shipname.toLowerCase().startsWith(trimmed.toLowerCase())
    ) {
      return { lines: [{ text: formatMessage(MessageId.LOC_SELF), category: 'system' }] };
    }

    let scanRange = 0;
    try {
      scanRange = this.shipClassCache.getScanRange(ship.shpclass);
    } catch {
      scanRange = 0;
    }

    const allShips = this.shipState.findAllShips();
    const result = findShip(query, ship, allShips, scanRange, this.scanHandler.lettersFor(ship.userid, ship.shipno));
    if (!result.ok) {
      // Lazy clear semantics — if findShip flagged the lock as stale, persist clear.
      if (result.clearedLock) {
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.lock = NOLOCK_SENTINEL;
          s.lockKey = null;
        });
      }
      return { lines: [{ text: result.message, category: 'system' }] };
    }

    const target = result.ship;
    // 3. Self-lock guard. (findShip already excludes self for plain queries,
    // but '@'-resolved lookups validate against shipno only — defence in depth.)
    if (shipKey(target.userid, target.shipno) === shipKey(ship.userid, ship.shipno)) {
      return { lines: [{ text: formatMessage(MessageId.LOC_SELF), category: 'system' }] };
    }

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.lock = target.shipno;
      s.lockKey = `${target.userid}:${target.shipno}`;
    });

    // LOCK02: show full ship name so player knows which ship matched the partial name.
    return { lines: [{ text: `Target locked: ${target.shipname} (class ${target.shpclass}).`, category: 'success' }] };
  }
}
