/**
 * The MESG08+i notice has to survive the trip back out of MailStat.
 *
 * It carries class MAIL_CLASS_PRODRPT (GEPLANET.C:317), the same class as the
 * nightly production report, so the inbox cannot route on class alone — it did,
 * and a cap notice came out as a production report with an empty item table and
 * no message body at all.
 *
 * @see GEPLANET.C:313-326
 * @see GE/REL/MBMGEMSG.MSG:4079-4176
 */

import { MailStat } from '../../src/prisma/client';
import { MailInboxService } from '../../src/game/mail/mail-inbox.service';
import { MailInboxRepository } from '../../src/game/mail/mail-inbox.repository';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { formatDetail } from '../../src/game/mail/mail-render';
import { ProductionCapPayload } from '../../src/game/mail/mail.types';
import { PRODUCTION_CAP_MAIL_TYPES } from '../../src/game/mail/production-cap';
import { MAIL_CLASS_PRODRPT, MESG20 } from '../../src/game/midnight/midnight.constants';
import { I_ION, I_MEN, I_SPY } from '../../src/game/constants/items';

function makeRow(overrides: Partial<MailStat> = {}): MailStat {
  return {
    userid: 'alice', class: MAIL_CLASS_PRODRPT, msgno: 1n, type: MESG20,
    stamp: 1_746_576_000, dtime: '', topic: 'Status Message', name1: 'Vega',
    int1: 3, int2: 5, cash: 0n, debt: 0n, tax: 0n, itemqty: Array(14).fill(0n),
    ...overrides,
  };
}

function makeService(rows: MailStat[]) {
  const repo = { findByUserid: vi.fn().mockResolvedValue(rows) } as unknown as MailInboxRepository;
  const ships = { findByUserid: vi.fn().mockReturnValue([]) } as unknown as ShipStateService;
  return new MailInboxService(repo, ships, {} as unknown as PrismaService);
}

describe('cap notice routing', () => {
  it('is a production_cap payload, not a production_report', async () => {
    const svc = makeService([
      makeRow({ type: PRODUCTION_CAP_MAIL_TYPES[I_ION], cash: 500n }),
    ]);
    const listing = await svc.list('alice');
    const payload = listing.entries[0].payload as ProductionCapPayload;

    expect(payload.kind).toBe('production_cap');
    expect(payload.itemIndex).toBe(I_ION);
    expect(payload.cap).toBe(500n);
    expect(payload.planetName).toBe('Vega');
    expect(payload.sectorX).toBe(3);
    expect(payload.sectorY).toBe(5);
  });

  it('leaves the nightly MESG20 report alone', async () => {
    const svc = makeService([makeRow({ type: MESG20 })]);
    const listing = await svc.list('alice');
    expect(listing.entries[0].payload.kind).toBe('production_report');
  });

  it('renders the canon body for the slot', () => {
    const lines = formatDetail({
      index: 1, userid: 'alice', class: MAIL_CLASS_PRODRPT, msgno: 1n,
      classLabel: 'Production Report', sender: '(system)', topic: 'Status Message',
      date: '2025-05-07', stamp: 0,
      payload: {
        kind: 'production_cap', itemIndex: I_SPY, planetName: 'Vega',
        sectorX: 3, sectorY: 5, cap: 5n,
      },
    });

    expect(lines.join('\n')).toContain('PIA (Planetary Intelligence Agency) has closed enrollment');
    expect(lines.join('\n')).toContain('5 agents');
  });

  it('renders the population body for slot 0, which is not a storage message', () => {
    const lines = formatDetail({
      index: 1, userid: 'alice', class: MAIL_CLASS_PRODRPT, msgno: 1n,
      classLabel: 'Production Report', sender: '(system)', topic: 'Status Message',
      date: '2025-05-07', stamp: 0,
      payload: {
        kind: 'production_cap', itemIndex: I_MEN, planetName: 'Vega',
        sectorX: 3, sectorY: 5, cap: 1234n,
      },
    });

    expect(lines.join('\n')).toContain('Implementing birth control procedures');
    expect(lines.join('\n')).toContain('1,234');
  });
});
