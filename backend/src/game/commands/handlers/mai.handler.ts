import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { MailInboxService } from '../../mail/mail-inbox.service';
import { MaintHandlerService } from './maint.handler';
import { formatListLine } from '../../mail/mail-render';

/**
 * Handles `mai` — dispatches to inbox listing (no args) or maintenance gate (args present).
 *
 * No-arg: queries MailStat for the player, renders a numbered list ordered newest-first.
 * With-arg: delegates unchanged to MaintHandlerService (feature 014 FR-210 gate).
 *
 * @see GEMAIN.H:531 MAILSTAT
 * @see GEMAIN.H:220 MAIL_CLASS_* — class constants used by mail-render
 * @see specs/017-mail-inbox/contracts/commands.md §mai
 */
@Injectable()
export class MaiHandlerService {
  constructor(
    private readonly inbox: MailInboxService,
    private readonly maint: MaintHandlerService,
  ) {}

  readonly command: Command = {
    keyword: 'mai',
    aliases: [],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
      this.handle(ship, args, ctx),
  };

  async handle(ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> {
    if (args.length >= 1) {
      return this.maint.command.handler(ship, args, ctx);
    }

    const listing = await this.inbox.list(ship.userid);

    if (listing.empty) {
      return { lines: [{ text: 'You have no mail.', category: 'system' }] };
    }

    const lines: CommandResult['lines'] = [
      { text: `You have ${listing.entries.length} message${listing.entries.length === 1 ? '' : 's'}.`, category: 'system' },
    ];

    for (const entry of listing.entries) {
      lines.push({ text: formatListLine(entry), category: 'info' });
    }

    return { lines };
  }
}
