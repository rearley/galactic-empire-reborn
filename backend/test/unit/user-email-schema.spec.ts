/**
 * The email column is nullable at the DB level because the 24 Cybertron rows
 * can never have one, and uniqueness is therefore partial and case-insensitive.
 * Prisma's `@unique` can express neither `lower()` nor `WHERE`, so the index is
 * raw SQL in the migration — and a raw index is exactly the kind of thing that
 * silently fails to ship. This reads the migration file back.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '../../prisma/migrations');

function migrationSql(nameFragment: string): string {
  const dir = readdirSync(MIGRATIONS).find((d) => d.includes(nameFragment));
  if (!dir) throw new Error(`no migration matching "${nameFragment}"`);
  return readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8');
}

describe('add_user_email migration', () => {
  const sql = migrationSql('add_user_email');
  // The raw index ships as its own migration — editing an applied one would
  // force a reset, and there is a live playtest in this database.
  const indexSql = migrationSql('user_email_lower_index');

  it('creates a partial, case-insensitive unique index on email', () => {
    const normalised = indexSql.replace(/\s+/g, ' ').toLowerCase();
    expect(normalised).toContain('create unique index');
    expect(normalised).toContain('user_email_lower_key');
    expect(normalised).toContain('lower(email)');
    expect(normalised).toContain('where email is not null');
  });

  it('makes username nullable rather than dropping it', () => {
    const normalised = sql.replace(/\s+/g, ' ').toLowerCase();
    expect(normalised).toContain('alter column "username" drop not null');
    expect(normalised).not.toContain('drop column "username"');
  });
});

describe('schema.prisma', () => {
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const userModel = /model User \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? '';

  it('declares email and emailVerifiedAt as optional', () => {
    expect(userModel).toMatch(/email\s+String\?/);
    expect(userModel).toMatch(/emailVerifiedAt\s+DateTime\?/);
  });

  it('declares username as optional', () => {
    expect(userModel).toMatch(/username\s+String\?/);
  });
});
