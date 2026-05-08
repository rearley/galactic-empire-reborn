/**
 * T029 — Schema drift guard for MailStat.
 * Asserts no readAt or deletedAt fields exist on the MailStat model (FR-014, SC-003).
 */

import { Prisma } from '@prisma/client';

describe('MailStat schema drift guard (T029)', () => {
  it('has no readAt field (FR-014: no per-message read state)', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'MailStat');
    expect(model).toBeDefined();
    const fieldNames = model!.fields.map((f) => f.name);
    expect(fieldNames).not.toContain('readAt');
  });

  it('has no deletedAt field (SC-003: no soft-delete state)', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'MailStat');
    const fieldNames = model!.fields.map((f) => f.name);
    expect(fieldNames).not.toContain('deletedAt');
  });

  it('snapshot: expected field names match schema', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'MailStat');
    const fieldNames = model!.fields.map((f) => f.name).sort();
    expect(fieldNames).toEqual(
      ['cash', 'class', 'debt', 'dtime', 'int1', 'int2', 'itemqty', 'msgno', 'name1', 'stamp', 'tax', 'topic', 'type', 'user', 'userid'].sort(),
    );
  });
});
