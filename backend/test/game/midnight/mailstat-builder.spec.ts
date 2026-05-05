/**
 * T011 — Pure-unit tests for buildProductionMailStat helper.
 *
 * Every field of the MailStat row is verified against the field map in
 * specs/009-midnight-job/data-model.md and the original C source.
 *
 * @see GEMAIN.C:1138-1167 — tmpstat field assignments
 * @see specs/009-midnight-job/data-model.md — MailStat field table
 */

import { buildProductionMailStat, ProductionPlanet } from '../../../src/game/midnight/mailstat-builder';
import { MAIL_CLASS_PRODRPT, MESG20 } from '../../../src/game/midnight/midnight.constants';
import { NUMITEMS } from '../../../src/game/constants/items';

function makePlanet(overrides: Partial<ProductionPlanet> = {}): ProductionPlanet {
  return {
    userid: 'owner1',
    name: 'TestPlanet',
    xsect: 10,
    ysect: 7,
    cash: 1000n,
    debt: 200n,
    tax: 50n,
    itemsQty: Array<bigint>(NUMITEMS).fill(0n),
    ...overrides,
  };
}

describe('buildProductionMailStat — field mapping (GEMAIN.C:1138-1167)', () => {
  it('sets userid to planet owner', () => {
    const row = buildProductionMailStat(makePlanet({ userid: 'alice' }), 1n);
    expect(row.userid).toBe('alice');
  });

  it('sets class = MAIL_CLASS_PRODRPT (3)', () => {
    const row = buildProductionMailStat(makePlanet(), 1n);
    expect(row.class).toBe(MAIL_CLASS_PRODRPT);
    expect(row.class).toBe(3);
  });

  it('sets type = MESG20 (20)', () => {
    const row = buildProductionMailStat(makePlanet(), 1n);
    expect(row.type).toBe(MESG20);
    expect(row.type).toBe(20);
  });

  it('sets msgno to the supplied value', () => {
    const row = buildProductionMailStat(makePlanet(), 42n);
    expect(row.msgno).toBe(42n);
  });

  it('truncates name1 to 25 characters', () => {
    const longName = 'A'.repeat(40);
    const row = buildProductionMailStat(makePlanet({ name: longName }), 1n);
    expect(row.name1.length).toBe(25);
    expect(row.name1).toBe('A'.repeat(25));
  });

  it('preserves short names unchanged', () => {
    const row = buildProductionMailStat(makePlanet({ name: 'Alpha' }), 1n);
    expect(row.name1).toBe('Alpha');
  });

  it('sets int1 = xsect, int2 = ysect', () => {
    const row = buildProductionMailStat(makePlanet({ xsect: 15, ysect: 9 }), 1n);
    expect(row.int1).toBe(15);
    expect(row.int2).toBe(9);
  });

  it('sets cash, debt, tax from planet', () => {
    const row = buildProductionMailStat(makePlanet({ cash: 9999n, debt: 111n, tax: 55n }), 1n);
    expect(row.cash).toBe(9999n);
    expect(row.debt).toBe(111n);
    expect(row.tax).toBe(55n);
  });

  it('copies all 14 itemqty entries', () => {
    const qty = Array.from({ length: NUMITEMS }, (_, i) => BigInt(i * 10));
    const row = buildProductionMailStat(makePlanet({ itemsQty: qty }), 1n);
    expect(row.itemqty).toHaveLength(NUMITEMS);
    expect(row.itemqty).toEqual(qty);
  });

  it('sets stamp to a current seconds-epoch value', () => {
    const before = Math.floor(Date.now() / 1000) - 1;
    const row = buildProductionMailStat(makePlanet(), 1n);
    const after = Math.floor(Date.now() / 1000) + 1;
    expect(row.stamp).toBeGreaterThanOrEqual(before);
    expect(row.stamp).toBeLessThanOrEqual(after);
  });

  it('sets topic to empty string (C source does not set it)', () => {
    const row = buildProductionMailStat(makePlanet(), 1n);
    expect(row.topic).toBe('');
  });
});
