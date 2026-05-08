import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { MaintenanceService } from '../../ship/maintenance.service';

/**
 * Handles `maint` — repairs the ship at an inhabited friendly planet in orbit.
 * Delegates gate logic (including password gate), cash debit, and repair-queue
 * mutation to MaintenanceService. This handler owns message formatting only.
 *
 * @see GECMDS.C:4452 cmd_maint
 * @see backend/src/game/ship/maintenance.service.ts MaintenanceService
 */
@Injectable()
export class MaintHandlerService {
  constructor(
    private readonly maintenanceService: MaintenanceService,
  ) {}

  readonly command: Command = {
    keyword: 'maint',
    aliases: [],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> =>
      this.handle(ship, args),
  };

  private async handle(ship: ShipState, args: string[] = []): Promise<CommandResult> {
    // Pass args[0] as passwordArg — MaintenanceService owns the password gate.
    // Tick-layer callers pass undefined, skipping the password check entirely.
    // @see GECMDS.C:4471 MAINT2, :4479 MAINT3
    const result = await this.maintenanceService.runMaintenance(ship, args[0]);

    if (!result.ok) {
      switch (result.reason) {
        case 'not-in-orbit':
          return { lines: [{ text: formatMessage(MessageId.MAINT_NOT_ORBIT), category: 'system' }] };
        case 'no-facility':
          return { lines: [{ text: formatMessage(MessageId.MAINT_NO_FACILITY), category: 'system' }] };
        case 'combat-locked':
          return { lines: [{ text: formatMessage(MessageId.MAINT_COMBAT), category: 'system' }] };
        case 'nz-not-zygor':
          return { lines: [{ text: formatMessage(MessageId.MAINT_NZ), category: 'system' }] };
        case 'password-required':
          return { lines: [{ text: formatMessage(MessageId.MAINT2), category: 'system' }] };
        case 'wrong-password':
          return { lines: [{ text: formatMessage(MessageId.MAINT3), category: 'system' }] };
        case 'no-damage':
          return { lines: [{ text: formatMessage(MessageId.MAINT_NO_DAMAGE), category: 'system' }] };
        case 'insufficient-cash':
          return { lines: [{ text: formatMessage(MessageId.MAINT_NO_CASH), category: 'system' }] };
        default:
          return { lines: [{ text: formatMessage(MessageId.MAINT_NO_FACILITY), category: 'system' }] };
      }
    }

    return {
      lines: [{ text: formatMessage(MessageId.MAINT_OK, result.repairAmt), category: 'success' }],
    };
  }
}
