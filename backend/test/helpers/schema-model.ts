/**
 * Read model definitions straight out of `prisma/schema.prisma`.
 *
 * These three facts used to come from `Prisma.dmmf`, which Prisma 7 removed.
 * Re-reading the schema file is not merely a replacement — it is the stronger
 * check, and the one this project's own rule asks for: a guard should re-read
 * the ORIGINAL rather than a generated artifact, because a generated artifact
 * can only ever confirm that generation ran.
 *
 * Deliberately small. It understands field lines and nothing else — no
 * attributes, no relations, no enums, no block comments inside a model. That
 * covers what the three consuming specs ask of it, and a parser that quietly
 * half-understands more would be worse than one whose limits are stated.
 *
 * @see docs/DECISIONS.md 2026-09-11
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCHEMA = join(resolve(__dirname, '../..'), 'prisma/schema.prisma');

export interface SchemaField {
  name: string;
  /** The declared type with `?` and `[]` stripped — `Int`, `String`, `Ship`. */
  type: string;
  isList: boolean;
  optional: boolean;
  /** `scalar` for builtin types, `object` for a relation to another model. */
  kind: 'scalar' | 'object';
}

export interface SchemaModel {
  name: string;
  fields: SchemaField[];
}

const SCALARS = new Set([
  'String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal', 'DateTime', 'Json', 'Bytes',
]);

/** Every `model X { ... }` block in the schema, in declaration order. */
export function schemaModels(): SchemaModel[] {
  const text = readFileSync(SCHEMA, 'utf8');
  const models: SchemaModel[] = [];
  const blocks = text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);

  for (const block of blocks) {
    const fields: SchemaField[] = [];
    for (const raw of block[2].split('\n')) {
      const line = raw.trim();
      // Skip blank lines, comments (`//` and the doc form `///`), and the
      // block-level attributes `@@id`, `@@unique`, `@@index`, `@@map`.
      if (line === '' || line.startsWith('//') || line.startsWith('@@')) continue;
      const field = /^(\w+)\s+(\w+)(\[\])?(\?)?/.exec(line);
      if (!field) continue;
      const type = field[2];
      fields.push({
        name: field[1],
        type,
        isList: field[3] === '[]',
        optional: field[4] === '?',
        kind: SCALARS.has(type) ? 'scalar' : 'object',
      });
    }
    models.push({ name: block[1], fields });
  }
  return models;
}

/** One model by name, or undefined. */
export function schemaModel(name: string): SchemaModel | undefined {
  return schemaModels().find((m) => m.name === name);
}
