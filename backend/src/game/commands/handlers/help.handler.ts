import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { HELP_TOPICS, HELP_TOPIC_ALIASES, HELP_TOPIC_IDS, HelpTopicId } from '../help/help-topics';
import { ShipState } from '../../ship/ship-state.types';

/**
 * Handles `hel` / `?` — topic-group help.
 * No-arg form lists every topic ID.
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
      const topicList = HELP_TOPIC_IDS.join(', ');
      if (args.length === 0) {
        return {
          lines: [{ text: formatMessage(MessageId.HELFMT, topicList), category: 'info' }],
        };
      }
      // A pilot looking for repair types `hel mai`, not `hel maintenance`.
      // Answering "Unknown help topic" there is what kept maintenance hidden.
      const raw = args[0].toLowerCase();
      const topicKey = (HELP_TOPIC_ALIASES[raw] ?? raw) as HelpTopicId;
      const topic = HELP_TOPICS[topicKey];
      if (!topic) {
        return {
          lines: [{ text: formatMessage(MessageId.HEL_UNKNOWN, args[0], topicList), category: 'system' }],
        };
      }
      return {
        lines: topic.body.map((line) => ({ text: line, category: 'info' as const })),
      };
    },
  };
}
