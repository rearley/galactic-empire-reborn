import { Injectable } from '@nestjs/common';
import { Command, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { MailInboxService } from '../../mail/mail-inbox.service';
import { formatDetail, formatListLine } from '../../mail/mail-render';

/**
 * Handles `rea` — the mailbox.
 *
 *   `rea`      lists your messages, newest first
 *   `rea <n>`  renders the class-specific detail view for message n
 *
 * The mailbox is a port original: there is no mail command anywhere in the
 * original table (GECMDS.C:111-225), and `mai` there is cmd_maint
 * (GECMDS.C:144). `rea` is not a canon keyword, so it is free to carry both
 * halves of the mailbox — which is why the listing moved here off `mai`.
 *
 * Read-only: no MailStat rows are modified (FR-013).
 *
 * @see GEMAIN.H:220 MAIL_CLASS_* — class constants
 * @see specs/017-mail-inbox/contracts/commands.md §rea
 */
@Injectable()
export class ReaHandlerService {
  constructor(private readonly inbox: MailInboxService) {}

  readonly command: Command = {
    keyword: 'rea',
    aliases: [],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, args: string[]): Promise<CommandResult> =>
      this.handle(ship, args),
  };

  private async handle(ship: ShipState, args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      return this.list(ship);
    }

    const index = Number(args[0]);
    const entry = await this.inbox.resolveIndex(ship.userid, index);

    if (!entry) {
      return { lines: [{ text: 'Invalid message.', category: 'system' }] };
    }

    return { lines: formatDetail(entry).map((text) => ({ text, category: 'info' as const })) };
  }

  /** Bare `rea` — numbered listing, newest first. */
  private async list(ship: ShipState): Promise<CommandResult> {
    const listing = await this.inbox.list(ship.userid);

    if (listing.empty) {
      return { lines: [{ text: 'You have no mail.', category: 'system' }] };
    }

    const count = listing.entries.length;
    const lines: CommandResult['lines'] = [
      {
        text: `You have ${count} message${count === 1 ? '' : 's'}.  (rea <n> to read, del <n> to delete)`,
        category: 'system',
      },
    ];

    for (const entry of listing.entries) {
      lines.push({ text: formatListLine(entry), category: 'info' });
    }

    return { lines };
  }
}
