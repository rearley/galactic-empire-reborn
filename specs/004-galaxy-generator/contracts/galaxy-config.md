# Contract — GalaxyConfig (env surface)

**Feature**: 004-galaxy-generator

The galaxy generator is configured via process environment. All variables
are optional; documented defaults are applied when unset. Values that fall
outside the legal `numopt` ranges (taken from the original game's command
parser) cause `GalaxyService.onModuleInit` to throw, aborting Nest startup.

| Env var | Type | Default | Legal range | Description |
|---|---|---|---|---|
| `GALAXY_SEED` | uint | `12648430` (`0xC0FFEE`) | any uint32 | Seed for the deterministic PRNG. |
| `GALAXY_PLODDS` | int | `4` | `1..20` | `gernd() % plodds == 0` triggers planet placement in a sector — lower → more sectors get planets. |
| `GALAXY_WORMODDS` | int | `10` | `1..100` | When placing an object in a sector, `gernd() % wormodds == 0` makes it a wormhole instead. |
| `GALAXY_MAXPLANETS` | int | `5` | `1..9` | Per-sector cap on the number of placement slots; `gernd() % maxplanets` decides actual count. |
| `GALAXY_LOG_S00` | bool | `false` | — | Dev aid: log each `s00` fixture entry as it is inserted. |

## Validation rules (FR-006a)

```ts
function loadGalaxyConfig(env: NodeJS.ProcessEnv): GalaxyConfig {
  const seed       = parseUint32(env.GALAXY_SEED,       0xC0FFEE,    'GALAXY_SEED');
  const plodds     = parseRange (env.GALAXY_PLODDS,     4,  1, 20,   'GALAXY_PLODDS');
  const wormodds   = parseRange (env.GALAXY_WORMODDS,   10, 1, 100,  'GALAXY_WORMODDS');
  const maxplanets = parseRange (env.GALAXY_MAXPLANETS, 5,  1, 9,    'GALAXY_MAXPLANETS');
  return { seed, plodds, wormodds, maxplanets };
}
```

`parseUint32` accepts `0x...` hex literals, plain decimals, and decimal-prefixed
underscores (`12_648_430`). `parseRange` enforces the inclusive legal bounds and
throws `GalaxyConfigError` with a message naming the bad field and offending
value. No silent clamping. No fallback-to-default on invalid input.

## Operator workflow

```
# Default seed and tunables
$ docker compose up backend
GalaxyService: galaxy ready — seed=12648430 plodds=4 wormodds=10 maxplanets=5 \
  sectors=450 planets=187 wormholes=23 generated=true ms=412

# Reseed by dropping the DB and rebooting with an explicit seed
$ docker compose exec backend npx prisma migrate reset --force
$ GALAXY_SEED=42 docker compose up backend
GalaxyService: galaxy ready — seed=42 plodds=4 wormodds=10 maxplanets=5 \
  sectors=450 planets=204 wormholes=27 generated=true ms=391

# Idempotent reboot — generation skipped, counts come from DB hydration
$ docker compose restart backend
GalaxyService: galaxy ready — seed=42 plodds=4 wormodds=10 maxplanets=5 \
  sectors=450 planets=204 wormholes=27 generated=false ms=38
```

The `seed` and tunable values reported on the `generated=false` line are read
back from `GalaxyMeta`, not from the current env. This is deliberate: it
documents the world that's actually loaded, regardless of any subsequent env
tweaks — those would only matter on a fresh DB. If `GALAXY_*` env values
disagree with `GalaxyMeta` on an idempotent boot, the generator emits a
WARN-level line noting the divergence and proceeds with the persisted values.

## Test parity

- `test/unit/galaxy-config.spec.ts` covers the parser, default fallbacks, and
  the error message wording for each out-of-range field.
- `test/integration/galaxy-bootstrap.spec.ts` boots with explicit env values
  and asserts the resulting `GalaxyMeta` row matches.
- `test/integration/galaxy-config-divergence.spec.ts` boots first with seed A,
  then restarts with `GALAXY_SEED=B` against the same DB, and asserts
  (a) the live galaxy still uses A, (b) the WARN-level divergence line is
  emitted.
