/**
 * A spy's report is written in the SPY's voice, not the owner's.
 *
 *   prfmsg(SPYM3,plptr->name,xsect,ysect,warsptr->userid);   // repelled
 *   prfmsg(SPYM4,plptr->name,xsect,ysect,warsptr->userid);   // taken
 *   strcpy(mail.userid,plptr->spyowner);
 *   strcpy(mail.topic,"Intelligence Report");
 *
 * @see GECMDS.C:3972-3992 call_4_help
 * @see MBMGEMSG.MSG SPYM3 / SPYM4 — "Classification: TOP SECRET / Our operative
 *      on %s in sector %d %d reports..."
 *
 * The port put MESG02/MESG04 in these rows — the OWNER's distress bodies,
 * which read "they successfully defended the planet". A player who planted a
 * spy on someone else's world and watched it invaded got a letter phrased as
 * though the planet were his own.
 *
 * MailStat has no body column, so `type` picks the text: 33 and 34, chosen
 * clear of MESG02-07, the revolt's 30 and the ship-loss 40/41. Canon assigns
 * no type on this path at all — its spy arms set only userid and topic — so
 * the numbering is this port's, and must stay stable once written.
 */
import { MailInboxService } from '../../src/game/mail/mail-inbox.service';
import { formatDetail } from '../../src/game/mail/mail-render';
import type { MailListEntry } from '../../src/game/mail/mail.types';
import { MAIL_CLASS_DISTRESS } from '../../src/game/constants';

function row(type: number) {
  return {
    userid: 'spook', class: MAIL_CLASS_DISTRESS, type,
    msgno: 1n, stamp: 0, dtime: 'raider_bob', topic: 'Intelligence Report',
    name1: 'Aurora', int1: 12, int2: 7,
    cash: 0n, debt: 0n, tax: 0n, itemqty: [],
  };
}

const payloadOf = (type: number) =>
  (MailInboxService.prototype as unknown as {
    buildPayload: (r: unknown) => { kind: string; outcome?: string; attackerUserid?: string };
  }).buildPayload.call({}, row(type));

describe('spy intelligence reports are their own kind (GECMDS.C:3972)', () => {
  it('reads a repelled attack as an operative report, not a distress signal', () => {
    expect(payloadOf(33)).toMatchObject({ kind: 'spy_report', outcome: 'held' });
  });

  it('reads a captured planet as an operative report', () => {
    expect(payloadOf(34)).toMatchObject({ kind: 'spy_report', outcome: 'taken' });
  });

  it('names the commander, which is what the operative actually saw', () => {
    // SPYM3/SPYM4's fourth slot is `warsptr->userid` — the attacker.
    expect(payloadOf(34)).toMatchObject({ attackerUserid: 'raider_bob' });
  });

  it('leaves the owner distress rows alone', () => {
    expect(payloadOf(2).kind).toBe('distress_signal');
  });
});

describe('the rendered body reads as an operative report', () => {
  const entry = (outcome: 'held' | 'taken'): MailListEntry => ({
    index: 1, class: MAIL_CLASS_DISTRESS, topic: 'Intelligence Report',
    dtime: '2026-09-06', sender: '(system)',
    payload: {
      kind: 'spy_report', outcome,
      planetName: 'Aurora', sectorX: 12, sectorY: 7, attackerUserid: 'raider_bob',
    },
  } as unknown as MailListEntry);

  it('says the planet was taken, and by whom', () => {
    const text = formatDetail(entry('taken')).join('\n');
    expect(text).toContain('Aurora');
    expect(text).toContain('raider_bob');
    expect(text.toLowerCase()).toContain('taken over');
  });

  it('distinguishes an unresolved attack from a capture', () => {
    const held = formatDetail(entry('held')).join('\n');
    expect(held).not.toContain('taken over');
  });

  it('never claims the reader owns the planet', () => {
    // The MESG02/MESG04 bodies this replaces say "they successfully defended
    // the planet" — addressed to an owner. A spy owns nothing here.
    const text = formatDetail(entry('held')).join('\n').toLowerCase();
    expect(text).not.toContain('your planet');
  });
});
