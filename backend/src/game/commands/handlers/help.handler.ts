import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { HELP_TOPICS, HELP_TOPIC_IDS, HelpTopicId } from '../help/help-topics';
import { ShipState } from '../../ship/ship-state.types';

/**
 * Handles `hel` / `?` — topic-group help.
 * No-arg form lists the five topic IDs.
 * Single-arg form returns the topic body lines.
 * Unknown topic returns HEL_UNKNOWN.
 *
 * @see GECMDS.C cmd_help
 */
@Injectable()
export class HelpHandlerService {
  readonly command: Command = {
    keyword: 'hel',
    aliases: ['?', 'help'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult => {
      if (args.length === 0) {
        return {
          lines: [{ text: formatMessage(MessageId.HELFMT), category: 'info' }],
        };
      }
      const topicKey = args[0].toLowerCase() as HelpTopicId;
      const topic = HELP_TOPICS[topicKey];
      if (!topic) {
        return {
          lines: [{ text: formatMessage(MessageId.HEL_UNKNOWN, args[0]), category: 'system' }],
        };
      }
      return {
        lines: topic.body.map((line) => ({ text: line, category: 'info' as const })),
      };
    },
  };
}
