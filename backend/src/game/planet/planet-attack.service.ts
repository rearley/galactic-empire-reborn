import { Injectable, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ShipStateService } from '../ship/ship-state.service';
import { RANDOM, Random, gernd, rndm } from '../combat/random.port';
import { PLATTRT1, PLATTRT2, PLATTRF1, PLATTRF2, PLATTRF3, FIRETICKS } from '../commands/attack.config';
import { AttackKind, ITEM_DESTRUCTION_RANGE } from '../commands/_attack-constants';
import { AttackOutcome } from './planet-attack.types';
import { PlanetState } from './planet-state.types';
import { ShipState } from '../ship/ship-state.types';
import { I_TROOPS, I_FIGHTER, ITEM_NAMES } from '../constants/items';
import { MAIL_CLASS_DISTRESS } from '../constants';
import { formatMessage, MessageId } from '../commands/messages';

export const ATTACK_OWNER_ALERT_EVENT = 'planet-attack.owner-alert' as const;

export interface AttackOwnerAlertPayload {
  ownerUserid: string;
  message: string;
}

/**
 * Planet combat math for the `att` command — troop and fighter branches.
 *
 * Both branches run under the per-planet mutex held by AttackHandler.
 * Call-for-help (real-time alert + spy-mail roll) is implemented as a
 * private method here since there are no other callers.
 *
 * @see GECMDS.C:3515 cmd_attack
 * @see GECMDS.C:3580–3750 troop branch (attackTroop)
 * @see GECMDS.C:3788–3950 fighter branch (attackFighter)
 * @see GECMDS.C:3952–3994 call_4_help
 * @see GECMDS.C:3996–4040 wonplnt
 */
@Injectable()
export class PlanetAttackService {
  constructor(
    private readonly ships: ShipStateService,
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Inject(RANDOM) private readonly random: Random,
    @Inject(PLATTRT1) private readonly plattrt1: number,
    @Inject(PLATTRT2) private readonly plattrt2: number,
    @Inject(PLATTRF1) private readonly plattrf1: number,
    @Inject(PLATTRF2) private readonly plattrf2: number,
    @Inject(PLATTRF3) private readonly plattrf3: number,
    @Inject(FIRETICKS) private readonly fireticks: number,
  ) {}

  /**
   * Resolve a troop attack against a planet.
   * Mutates planet and ship in-memory state; persists via caller's flush.
   * @see GECMDS.C:3580–3750 inlined troop branch of cmd_attack
   */
  async attackTroop(num: number, ship: ShipState, planet: PlanetState): Promise<AttackOutcome> {
    const narration: string[] = [];
    const itemsDestroyed: Array<{ itemIndex: number; destroyed: number }> = [];

    let left1 = num;
    let left2 = Number(planet.items[I_TROOPS].qty);
    let kill1 = 0;
    let kill2 = 0;

    // Step 1: defender fighters fire first. @see GECMDS.C:3590–3604
    const fighters = Number(planet.items[I_FIGHTER].qty);
    if (fighters > 1) {
      const fighterKill = (gernd(this.random) % 35 + 9) * fighters;
      kill1 = Math.min(fighterKill, left1);
      narration.push(formatMessage(MessageId.ATT_DEFENDER_FIGHTER_KILL, kill1));
    }

    // Step 2: ground troops engage. @see GECMDS.C:3605–3608
    const groundKills = Math.floor(left2 * (rndm(this.random, this.plattrt1) + 0.25));
    kill1 += groundKills;
    narration.push(formatMessage(MessageId.ATT_GROUND_TROOP_KILL, groundKills));

    // Step 3: ratio-based attacker counter-kill. @see GECMDS.C:3610–3617
    const ratio = left2 > 0 ? Math.floor(left1 / left2) : 0;
    if (ratio > 2) {
      kill2 = Math.floor(left1 * (rndm(this.random, this.plattrt2) + 0.1));
    } else {
      kill2 = 0;
    }

    // Step 4: cap and apply. @see GECMDS.C:3618–3629
    if (kill1 > left1) kill1 = left1;
    if (kill2 > left2) kill2 = left2;
    left1 -= kill1;
    left2 -= kill2;
    narration.push(formatMessage(MessageId.ATT_LOSS_REPORT, kill1, kill2));

    // Step 5: outcome branching. @see GECMDS.C:3631–3700
    let won = 0;
    if (left2 > 0 && left2 < Math.floor(left1 / 4)) {
      won = 1;
      narration.push(formatMessage(MessageId.ATT_WIN_TROOP));
    } else if (left1 > 0 && left1 < Math.floor(left2 / 4)) {
      narration.push(formatMessage(MessageId.ATT_RETREAT));
      planet.items[I_TROOPS].qty += BigInt(left1);
      left1 = 0;
    } else if (left1 > 0 && left2 === 0 && Number(planet.items[I_FIGHTER].qty) === 0) {
      won = 1;
    }

    // Step 6: high-ratio item destruction. @see GECMDS.C:3705–3735
    if (ratio > 2 && left1 > Math.floor(left2 / 2)) {
      for (let i = 0; i < planet.items.length; i++) {
        if (i === I_TROOPS) continue;
        const destroyed = Math.min(gernd(this.random) % ITEM_DESTRUCTION_RANGE, Number(planet.items[i].qty));
        if (destroyed > 0) {
          planet.items[i].qty -= BigInt(destroyed);
          itemsDestroyed.push({ itemIndex: i, destroyed });
          narration.push(formatMessage(MessageId.ATT_ITEM_DESTROYED, destroyed, ITEM_NAMES[i]));
        }
      }
    }

    // Step 7: persist. @see GECMDS.C:3737–3745
    planet.items[I_TROOPS].qty = BigInt(left2);
    this.ships.mutate(ship.userid, ship.shipno, (s) => {
      s.items[I_TROOPS] = (s.items[I_TROOPS] ?? 0n) + BigInt(left1);
    });

    // Step 8: notification + spy roll. @see GECMDS.C:3753–3756
    const ownerAtAttackTime = planet.userid;
    if (ratio > 1 && ownerAtAttackTime) {
      await this.callForHelp(planet, ship, AttackKind.TROOP, num, won, ratio > 5, ownerAtAttackTime);
    }

    // Step 9: mail. @see GECMDS.C:3760–3771
    if (ratio > 1 && ownerAtAttackTime) {
      const mailType = won === 1 ? MessageId.MESG03 : MessageId.MESG02;
      await this.insertDistressMail(ownerAtAttackTime, mailType, planet, num, ship);
    }

    // Step 10: ownership transfer. @see GECMDS.C:3767, 3996
    if (won === 1) {
      planet.userid = ship.userid;
      this.ships.mutate(ship.userid, ship.shipno, (s) => {
        s.hostile = 0;
      });
      await this.prisma.user.update({
        where: { userid: ship.userid },
        data: { planets: { increment: 1 } },
      });
    }

    narration.push(formatMessage(MessageId.ATT_RESOLVED, left1));

    return { left1, left2, kill1, kill2, won, itemsDestroyed, narration };
  }

  /**
   * Resolve a fighter attack against a planet.
   * The ratio quirk (left2==0 → ratio=0, skipping most gates) is intentionally
   * preserved per FR-014-019 / SC-008.
   * @see GECMDS.C:3788–3950 attack_fig
   */
  async attackFighter(num: number, ship: ShipState, planet: PlanetState): Promise<AttackOutcome> {
    const narration: string[] = [];
    const itemsDestroyed: Array<{ itemIndex: number; destroyed: number }> = [];

    let left1 = num;
    let left2 = Number(planet.items[I_FIGHTER].qty);
    let kill1 = 0;
    let kill2 = 0;

    // Step 1: ratio compute (FLOATING POINT — the bug: left2==0 → ratio=0). @see GECMDS.C:~3800
    // This is intentional fidelity — do NOT add a zero-guard. SC-008.
    const ratio = left2 > 0 ? (left1 / left2) * 100 : 0;

    // Step 2: ground anti-air (only if >500 troops AND random gate). @see GECMDS.C:~3820
    if (left1 > 0 && Number(planet.items[I_TROOPS].qty) > 500 && (gernd(this.random) % 5 - 1) > 0) {
      const groundShootdown = Math.floor(left1 * (rndm(this.random, this.plattrf1) + 0.05));
      kill1 += groundShootdown;
      narration.push(formatMessage(MessageId.ATT_GROUND_AA, groundShootdown));
    }

    // Step 3: defender fighters return-fire. @see GECMDS.C:~3830
    if (left2 > 0) {
      const returnFire = Math.floor(left2 * (rndm(this.random, this.plattrf2) + 0.2));
      kill1 += returnFire;
      narration.push(formatMessage(MessageId.ATT_DEFENDER_FIGHTER_KILL, returnFire));
    }

    // Step 4: attacker counter-kill (gated by ratio > 1). @see GECMDS.C:~3850
    if (left2 > 0 && ratio > 1) {
      kill2 = Math.floor(left1 * (rndm(this.random, this.plattrf3) + 0.2));
    } else {
      kill2 = 0;
    }

    // Step 5: cap and apply. @see GECMDS.C:~3860
    if (kill1 > left1) kill1 = left1;
    if (kill2 > left2) kill2 = left2;
    left1 -= kill1;
    left2 -= kill2;
    narration.push(formatMessage(MessageId.ATT_LOSS_REPORT, kill1, kill2));

    // Step 6: outcome. @see GECMDS.C:~3890
    let won = 0;
    if (left1 > 0 && left2 === 0 && Number(planet.items[I_TROOPS].qty) < 5) {
      won = 1;
      narration.push(formatMessage(MessageId.ATT_WIN_FIGHTER));
    }

    // Step 7: high-ratio item destruction (NOT REACHED when left2==0 — the bug). @see GECMDS.C:~3870
    if (ratio > 5) {
      for (let i = 0; i < planet.items.length; i++) {
        if (i === I_FIGHTER) continue;
        const destroyed = Math.min(gernd(this.random) % ITEM_DESTRUCTION_RANGE, Number(planet.items[i].qty));
        if (destroyed > 0) {
          planet.items[i].qty -= BigInt(destroyed);
          itemsDestroyed.push({ itemIndex: i, destroyed });
          narration.push(formatMessage(MessageId.ATT_ITEM_DESTROYED, destroyed, ITEM_NAMES[i]));
        }
      }
    }

    // Step 8: persist and return. @see GECMDS.C:~3910
    planet.items[I_FIGHTER].qty = BigInt(left2);
    this.ships.mutate(ship.userid, ship.shipno, (s) => {
      s.items[I_FIGHTER] = (s.items[I_FIGHTER] ?? 0n) + BigInt(left1);
    });

    // Step 9: notification + spy roll. @see GECMDS.C:3916–3919
    const ownerAtAttackTime = planet.userid;
    if ((ratio > 1 || won === 1) && ownerAtAttackTime) {
      await this.callForHelp(planet, ship, AttackKind.FIGHTER, num, won, ratio > 5, ownerAtAttackTime);
    }

    // Step 10: mail. @see GECMDS.C:3924–3936
    if ((ratio > 2 || won === 1) && ownerAtAttackTime) {
      const mailType = won === 1 ? MessageId.MESG05 : MessageId.MESG04;
      await this.insertDistressMail(ownerAtAttackTime, mailType, planet, num, ship);
    }

    // Step 11: ownership transfer.
    if (won === 1) {
      planet.userid = ship.userid;
      this.ships.mutate(ship.userid, ship.shipno, (s) => {
        s.hostile = 0;
      });
      await this.prisma.user.update({
        where: { userid: ship.userid },
        data: { planets: { increment: 1 } },
      });
    }

    narration.push(formatMessage(MessageId.ATT_RESOLVED, left1));

    return { left1, left2, kill1, kill2, won, itemsDestroyed, narration };
  }

  /**
   * Call-for-help: real-time owner alert + spy-mail roll.
   * @see GECMDS.C:3952–3994 call_4_help
   */
  private async callForHelp(
    planet: PlanetState,
    ship: ShipState,
    kind: AttackKind,
    num: number,
    won: number,
    sendSpyMail: boolean,
    ownerUserid: string,
  ): Promise<void> {
    // Owner real-time alert — emit to user:${ownerUserid} room via EventEmitter.
    // If owner is offline the room is empty and the emit silently drops.
    const alertMsg = formatMessage(
      MessageId.ATT_OWNER_ALERT,
      planet.name,
      planet.xsect,
      planet.ysect,
      ship.shipname,
      ship.userid,
    );
    this.events.emit(ATTACK_OWNER_ALERT_EVENT, { ownerUserid, message: alertMsg } as AttackOwnerAlertPayload);

    // Spy intel mail roll. @see research.md D4
    if (sendSpyMail && planet.spyowner) {
      if (won === 1 || gernd(this.random) % 6 === 0) {
        const spyMailType = kind === AttackKind.TROOP ? MessageId.MESG02 : MessageId.MESG04;
        await this.insertDistressMail(planet.spyowner, spyMailType, planet, num, ship);
      }
    }
  }

  private async insertDistressMail(
    recipientUserid: string,
    mailType: MessageId,
    planet: PlanetState,
    num: number,
    ship: ShipState,
  ): Promise<void> {
    await this.prisma.mailStat.create({
      data: {
        userid: recipientUserid,
        class: MAIL_CLASS_DISTRESS,
        msgno: BigInt(Date.now()),
        type: MAIL_TYPE_MAP[mailType] ?? 0,
        stamp: Math.floor(Date.now() / 1000),
        dtime: ship.userid,
        topic: ship.shipname.slice(0, 30),
        name1: planet.name.slice(0, 25),
        int1: planet.xsect,
        int2: planet.ysect,
        cash: BigInt(num),
        itemqty: [],
      },
    });
  }
}

/** Map MessageId to the integer type constant stored in MailStat.type. */
const MAIL_TYPE_MAP: Partial<Record<MessageId, number>> = {
  [MessageId.MESG02]: 2,
  [MessageId.MESG03]: 3,
  [MessageId.MESG04]: 4,
  [MessageId.MESG05]: 5,
};
