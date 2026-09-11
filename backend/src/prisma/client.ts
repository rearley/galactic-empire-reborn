/**
 * The one place that names where the Prisma client is generated.
 *
 * Prisma 7 generates the client as TypeScript source at a path the schema
 * chooses, so every importer would otherwise carry a relative path into a build
 * artifact — 36 of them, each of which breaks if that output ever moves. They
 * import from here instead, and the path is written down once.
 *
 * It also keeps the generated tree out of the guards. Two citation guards and
 * the user-repository boundary invariant walk `backend/src` for `.ts` files;
 * generating into `src/` would put thousands of generated files inside all
 * three.
 *
 * @see ../../prisma/schema.prisma — the `output` this mirrors
 */
export * from '../../generated/prisma/client';
