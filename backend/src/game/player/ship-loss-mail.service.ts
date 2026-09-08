import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { COMBAT_SHIP_DESTROYED, CombatShipDestroyedEvent } from '../combat/combat-events';
import { MAIL_CLASS_DISTRESS } from '../constants';
import { isAiUserid } from '../commands/helpers/ai-userid';

/**
 * Mail type for a ship lost while its captain was away.
 *
 * PORT-ORIGINAL, and deliberately numbered outside canon's MESG02-MESG20 and
 * MESG30 so it can never collide with one. There is no canon ship-loss message
 * because canon never needs one: `warhupa` sets `status = GESTAT_AVAIL` on
 * hangup (GEMAIN.C:1398-1440), so a logged-off ship is not in the universe and
 * cannot be shot. Our 24/7 persistent world is the deviation that creates the
 * event.
 *
 * What canon DOES establish is what mail is FOR. Every shipped distress
 * message has the same shape — "Distress message from %s in Sector %d %d,
 * <what happened>" — covering a planet attacked (MESG02), starving (MESG06/07)
 * or in revolt (MESG30). All of them report something that happened to your
 * property on the server's clock rather than yours. A ship destroyed while you
 * were logged off is exactly that, so this follows the established pattern
 * rather than inventing a mechanism.
 *
 * @see docs/DECISIONS.md — ship-loss mail
 */
export const MESG_SHIPLOSS = 40 as const;
/**
 * A ship lost to a collision rather than to an enemy. A distinct message type
 * because MailStat has no field for a cause and `type` is the one that is free
 * — the inbox maps it back when it renders. @see mail-inbox.service.ts
 */
export const MESG_SHIPLOSS_GRAVITY = 41 as const;

/**
 * Mails a player when one of their ships is destroyed.
 *
 * Sent whether or not they were online, matching the planet distress mails,
 * which C queues without regard to the owner's session. A player who WAS
 * online also sees YOURDEAD live (GEFUNCS.C:978-987); the mail is the durable
 * record, and the only trace at all for someone who was away.
 */
@Injectable()
export class ShipLossMailService implements OnModuleInit {
  private readonly logger = new Logger(ShipLossMailService.name);
  private lastMsgno = 0;

  constructor(
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.events.on(COMBAT_SHIP_DESTROYED, (payload: CombatShipDestroyedEvent) => {
      // Returned, not voided: `emit` on a live tick discards this, but the
      // shutdown drain uses `emitAsync` and awaits it, so a kill settled on the
      // way out still transfers the loss mail.
      // @see game/combat/combat-tick.service.ts beforeApplicationShutdown
      return this.handle(payload);
    });
  }

  private async handle(event: CombatShipDestroyedEvent): Promise<void> {
    // Automatons have no inbox.
    if (isAiUserid(event.victimUserid)) return;

    const attacker = event.attackerName
      ?? (event.attackerUserid && !isAiUserid(event.attackerUserid) ? event.attackerUserid : null)
      ?? 'an unknown assailant';

    try {
      await this.prisma.mailStat.create({
        data: {
          userid: event.victimUserid,
          class: MAIL_CLASS_DISTRESS,
          msgno: this.nextMsgno(),
          type: event.weapon === 'gravity' ? MESG_SHIPLOSS_GRAVITY : MESG_SHIPLOSS,
          stamp: Math.floor(Date.now() / 1000),
          topic: 'SHIP LOST',
          // A planet distress puts the PLANET in name1; this puts the killer
          // there, because that is the fact the pilot needs on returning. The
          // sector is already carried by int1/int2, and the ship they lost is
          // implied by the notice itself.
          name1: attacker.slice(0, 25),
          int1: event.sector.x,
          int2: event.sector.y,
          cash: 0n,
          itemqty: [],
        },
      });
    } catch (err) {
      // Fire-and-forget: a failed insert must never stall the combat tick.
      const stack = err instanceof Error ? err.stack : String(err);
      this.logger.error(`Ship-loss mail failed for ${event.victimUserid}: ${stack}`);
    }
  }

  /** Monotonic within the (userid, class, msgno) key — two losses can share a millisecond. */
  private nextMsgno(): number {
    const now = Date.now();
    this.lastMsgno = now > this.lastMsgno ? now : this.lastMsgno + 1;
    return this.lastMsgno;
  }
}
