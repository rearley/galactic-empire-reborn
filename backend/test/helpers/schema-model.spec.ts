/**
 * The schema reader is what three drift guards now depend on, so it gets its
 * own test — including the case that matters most: that it finds anything at
 * all. A parser that silently returns an empty list would make every guard
 * built on it pass vacuously.
 *
 * @see ./schema-model.ts
 */
import { schemaModel, schemaModels } from './schema-model';

describe('schemaModels', () => {
  it('finds the models in prisma/schema.prisma at all', () => {
    // Guard the guard. Without this, a regex that stopped matching would make
    // every drift assertion below pass against an empty list.
    const names = schemaModels().map((m) => m.name);
    expect(names.length).toBeGreaterThan(5);
    expect(names).toContain('User');
    expect(names).toContain('Ship');
    expect(names).toContain('MailStat');
  });

  it('reads a scalar field with its declared type', () => {
    const shipno = schemaModel('Ship')?.fields.find((f) => f.name === 'shipno');
    expect(shipno).toEqual({
      name: 'shipno',
      type: 'Int',
      isList: false,
      optional: false,
      kind: 'scalar',
    });
  });

  it('marks an optional field optional without changing its type', () => {
    const username = schemaModel('User')?.fields.find((f) => f.name === 'username');
    expect(username?.type).toBe('String');
    expect(username?.optional).toBe(true);
  });

  it('separates a relation from a scalar', () => {
    const ship = schemaModel('Ship');
    const relations = ship?.fields.filter((f) => f.kind === 'object') ?? [];
    expect(relations.length).toBeGreaterThan(0);
    for (const r of relations) {
      expect(['String', 'Int', 'Boolean', 'Float', 'DateTime', 'BigInt']).not.toContain(r.type);
    }
  });

  it('skips comments and block attributes rather than reading them as fields', () => {
    const names = schemaModel('User')?.fields.map((f) => f.name) ?? [];
    expect(names.some((n) => n.startsWith('@'))).toBe(false);
    expect(names.some((n) => n.startsWith('/'))).toBe(false);
  });
});
