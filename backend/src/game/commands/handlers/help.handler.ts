import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { classDetailPage } from '../help/class-detail';
import { HELP_TOPICS, HELP_TOPIC_ALIASES, HELP_TOPIC_IDS, HelpTopicId, canonHelpPage } from '../help/help-topics';
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

      // Canon's own page first. 45 of its 61 entries document ONE command, and
      // that page answers the question a player actually asked — `hel mine`
      // should return the mine page, not the whole combat topic.
      // @see MBMGEHLP.MSG, tools/extract-help.mjs
      // Order matters, and each step earned its place:
      //
      //  1. Our own TOPIC IDS first. Canon matches commands on three characters
      //     (GECMDS.C:249 gesearch) and "ship" truncates to "shi" — canon's
      //     SHIELD page — so canon-first answered `hel ship` with shields.
      //  2. Canon's page next, exact then 3-char. 45 of its 61 entries document
      //     one command, and that is the better answer to `hel mine`.
      //  3. Our aliases last. They were the stopgap BEFORE canon's pages were
      //     wired, and ahead of canon they shadowed the real page: `mine` and
      //     `torpedo` both alias to our combat topic.
      // `hel class <n>` — canon's per-class detail page, before the topic
      // lookup so the number is not swallowed by the summary table.
      //
      //   if (margc == 3) { i = atoi(margv[2])-1;
      //       if (... max_type == CLASSTYPE_USER) prfmsg(shipclass[i].hlpmsg);
      //       else prfmsg(HLPCLS3); }
      //   -- GECMDS.C:438-453
      //
      // HLPCLS2's closing note advertises this command, so the table had been
      // pointing at something that did not exist.
      if (raw === 'class' && args.length > 1) {
        const page = classDetailPage(args[1]);
        if (page) {
          return { lines: page.map((line) => ({ text: line, category: 'info' as const })) };
        }
      }

      const ownTopic = HELP_TOPICS[raw as HelpTopicId] as { body: ReadonlyArray<string> } | undefined;
      if (ownTopic) {
        return { lines: ownTopic.body.map((line) => ({ text: line, category: 'info' as const })) };
      }

      const canon = canonHelpPage(raw);
      if (canon) {
        return { lines: canon.map((line) => ({ text: line, category: 'info' as const })) };
      }

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
