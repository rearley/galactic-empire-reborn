# Contract — GalaxyService (read interface)

**Feature**: 004-galaxy-generator
**Consumers (in scope)**: `ScanHandlerService` (feature 003 stubs).
**Consumers (future)**: `CombatService` (006), `PlanetService` (005),
`CybertronService` (007), `DroidService` (008).

This contract defines the public read surface other services may rely on for
the lifetime of feature 004. Mutating methods are NOT in this contract — the
generator is the sole writer, and it writes only at boot.

## Service shape

```ts
@Injectable()
export class GalaxyService implements OnModuleInit {
  /** Boot lifecycle:
   *  1. Resolve and validate GalaxyConfig from env.
   *  2. Open a single Postgres transaction.
   *  3. If GalaxyMeta exists → no-op; else run full generation, ending with
   *     INSERT INTO GalaxyMeta as the last write of the transaction.
   *  4. Hydrate the in-memory read model from the (now-guaranteed) tables.
   *  5. Emit the FR-013 summary log line.
   *
   *  Throws if config is out of range. Aborts module init on transaction
   *  failure. Subsequent boots are idempotent (FR-002).
   */
  async onModuleInit(): Promise<void>;

  /** All planets in the given sector. Empty array if none. O(1). */
  getSectorPlanets(xsect: number, ysect: number): readonly Planet[];

  /** All wormholes in the given sector. Empty array if none. O(1). */
  getSectorWormholes(xsect: number, ysect: number): readonly Wormhole[];

  /** Resolve a named planet (case-insensitive) — only neutral-zone planets
   *  are addressable by name in feature 004. Returns null otherwise.
   *  Name matching is case-insensitive.
   *  @see GECMDS.C:2295 (numeric form, deviation in research.md Decision 8) */
  findPlanetByName(name: string): Planet | null;

  /** Provenance: the GalaxyMeta row in effect for the live world.
   *  Stable for the lifetime of the process. */
  getMeta(): GalaxyMeta;
}
```

`Planet`, `Wormhole`, `GalaxyMeta` are the Prisma types from `@prisma/client`.
No bespoke DTO is introduced — feature 004 has no shape mismatch between
storage and consumer needs, and adding a layer would be premature.

## Behavioural guarantees (test-enforced)

| ID | Guarantee | Test location |
|---|---|---|
| G1 | After `onModuleInit`, `Sector` rowcount == 450, `GalaxyMeta` rowcount == 1. | `test/integration/galaxy-bootstrap.spec.ts` |
| G2 | Two boots with the same seed against fresh DBs produce identical (planet name, x, y, plnum, type, env, res) tuples. | `test/integration/galaxy-determinism.spec.ts` |
| G3 | Two boots with different seeds against fresh DBs produce different planet coordinate sets. | same file |
| G4 | A second boot against a populated DB performs zero `INSERT`/`UPDATE`/`DELETE` against `Sector`/`Planet`/`Wormhole`/`GalaxyMeta`. | `test/integration/galaxy-idempotent.spec.ts` |
| G5 | Crashing the generation transaction (simulated via a mid-transaction `throw`) leaves `Sector`, `Planet`, `Wormhole`, and `GalaxyMeta` all empty. | same file |
| G6 | Out-of-range config (`plodds=0`, `wormodds=200`, `maxplanets=10`) throws on init with a message naming the bad field. | `test/unit/galaxy-config.spec.ts` |
| G7 | At default seed and tunables, `planet count ∈ [100, 300]` and `wormhole count ∈ [10, 40]`. | `test/integration/galaxy-balance.spec.ts` |
| G8 | Every wormhole has `destXsect ∈ 0..MAXX-1`, `destYsect ∈ 0..MAXY-1`, and `(destXsect, destYsect) ≠ (xsect, ysect)`. | same file |
| G9 | `findPlanetByName('Zygor-3')` returns the canonical neutral-zone planet; `findPlanetByName('NOTAPLANET')` returns `null`. | `test/unit/galaxy-service.spec.ts` |
| G10 | `getSectorPlanets(0,0)` returns the s00 fixture (5 entries, in fixture order). | same file |

## Read-model semantics

- All getters return `readonly` arrays / immutable objects from the cache.
  Callers MUST NOT mutate. (TypeScript `readonly` is the sole guard; we do
  not deep-freeze for the perf cost.)
- `getSectorPlanets` / `getSectorWormholes` for an out-of-range sector
  (`x ∉ 0..MAXX-1` or `y ∉ 0..MAXY-1`) throws — this is a programmer error,
  not a runtime condition. Callers are expected to clamp before calling.
- `findPlanetByName` is case-insensitive on input; the canonical case from
  the fixture is preserved in the returned object.
- `getMeta()` returns a structurally-cloned snapshot (cheap — six fields).

## Mutation policy (out of scope for 004)

This service exposes NO write methods in feature 004. Feature 005 will add
the colonization mutation surface (`assignPlanetToOwner`, name registration
on first claim) and the read-model invalidation hooks. The signatures
above will not change at that point — they will be augmented, not redefined.
