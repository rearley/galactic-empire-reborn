import { Ship, Prisma } from '../../prisma/client';
import { ShipState } from './ship-state.types';

/**
 * Three empty tubes, because GEMAIN.H:125 `#define MAXTORPS 3` and MAXMISSL
 * matches it, and the tick walks fixed slots. So the array is always that
 * length: production carries rows with `{}` and `{0,0}` in these columns, and a
 * short one is a hull with tubes that do not exist rather than fewer of them.
 *
 * Functions, not shared constants: each hydrated ship needs its OWN arrays, and
 * a shared literal would be mutated in place by the first torpedo to land.
 */
const EMPTY_TUBE_CHANNELS = (): number[] => [255, 255, 255];
const EMPTY_TUBE_DISTANCES = (): number[] => [0, 0, 0];

/**
 * Converts a Prisma Ship row to the in-memory ShipState representation.
 * The dirty flag starts false — the row was just loaded from Postgres.
 * @see GEMAIN.H WARSHP struct
 */
export function prismaShipToState(row: Ship): ShipState {
  return {
    userid: row.userid,
    shipno: row.shipno,
    shipname: row.shipname,
    shpclass: row.shpclass,
    heading: row.heading,
    head2b: row.head2b,
    speed: row.speed,
    speed2b: row.speed2b,
    xcoord: row.xcoord,
    ycoord: row.ycoord,
    damage: row.damage,
    energy: row.energy,
    phasr: row.phasr,
    phasrtype: row.phasrtype,
    kills: row.kills,
    lastfired: row.lastfired,
    shieldtype: row.shieldtype,
    shieldstat: row.shieldstat,
    shield: row.shield,
    cloak: row.cloak,
    degrees: row.degrees,
    percent: row.percent,
    tactical: row.tactical,
    helm: row.helm,
    train: row.train,
    where: row.where,
    // DISARMED on the way in, deliberately. These are persisted columns, so a
    // ship that was under fire when the server stopped would otherwise hydrate
    // with the volley still inbound and be hit by it a SECOND time on the first
    // physics tick. When the volley was lethal the row never healed — the ship
    // died before anything flushed the spent tubes, so the same three missiles
    // killed it again on every boot. `Cybrg-216` did exactly that across three
    // restarts with a byte-identical manifest.
    //
    // Canon does not cover a restart — a MajorBBS module did not have one — but
    // it does cover the principle. `cleartm` walks every ship and blanks the
    // tubes belonging to a channel that has left, by channel and not by
    // distance: GEFUNCS.C:1766 `wptr->ltorps[j].channel = 255;`. A restart is
    // that same event for EVERY channel at once, so this is cleartm's rule
    // applied to the only case canon never had to name.
    // @see docs/DECISIONS.md 2026-09-17, issue #53
    ltorpsChannel: EMPTY_TUBE_CHANNELS(),
    ltorpsDistance: EMPTY_TUBE_DISTANCES(),
    lmisslChannel: EMPTY_TUBE_CHANNELS(),
    lmisslDistance: EMPTY_TUBE_DISTANCES(),
    lmisslEnergy: EMPTY_TUBE_DISTANCES(),
    decout: row.decout,
    jammer: row.jammer,
    freq: row.freq,
    items: row.items,
    titem: row.titem,
    hostile: row.hostile,
    cantexit: row.cantexit,
    repair: row.repair,
    hypha: row.hypha,
    firecntl: row.firecntl,
    destruct: row.destruct,
    status: row.status,
    cybmine: row.cybmine,
    cybskill: row.cybskill,
    cybupdate: row.cybupdate,
    tick: row.tick,
    emulate: row.emulate,
    minesnear: row.minesnear,
    lock: row.lock,
    holdcourse: row.holdcourse,
    topspeed: row.topspeed,
    // maxTons intentionally NOT defaulted here — callers must set it from
    // ShipClass.maxTons. Hard-coding 1000 silently overrode per-class caps
    // on the gateway reconnect path. @see specs/022-fidelity-audit-v2/findings.md P-002
    warncntr: row.warncntr,
    scanNames: false,
    scanHome: false,
    scanFull: false,
    msgFilter: false,
    dirty: false,
  };
}

/**
 * ShipState keys that Prisma would reject, derived from the schema itself.
 *
 * `stateToPrismaUpdate` returns its object straight to Prisma, so ONE
 * in-memory-only field left in the payload makes EVERY flush throw — and the
 * caller logs and swallows it, so the only symptom is that ships silently stop
 * being saved. This has now bitten the port six times (maxTons, maxWarp,
 * channel, lockKey, then lastfiredBy / deathCause / userKills together), each
 * time because the strip-list was hand-maintained and the guarding test used a
 * hand-written fixture that simply omitted the new field.
 *
 * So the list is no longer trusted to be complete — it is CHECKED. Add a field
 * to ShipState that has no Ship column and leave it out of IN_MEMORY_ONLY, and
 * `_everyInMemoryFieldIsListed` below fails to compile, naming the field.
 */
type ShipColumnName = keyof typeof Prisma.ShipScalarFieldEnum;
type InMemoryOnlyKey = Exclude<keyof ShipState, ShipColumnName>;

const IN_MEMORY_ONLY = [
  'dirty',
  'isEphemeral',
  'teamcode',
  'scanNames',
  'scanHome',
  'scanFull',
  'msgFilter',
  'maxTons',
  'maxWarp',
  // Resolved lock target written by `loc`; the DB column `lock` holds the
  // target's channel, this is the "userid:shipno" key used to re-find it.
  'lockKey',
  // Assigned on entry to the world, released on exit.
  'channel',
  // Who last damaged this ship, so the loss mail can name them.
  'lastfiredBy',
  // Set by a gravity collision so the mail names the body, not a person.
  'deathCause',
  // The weapon that last damaged this hull, so the destruction manifest can
  // name it. In-memory only, for the same reason as `lastfiredBy`. @see issue #52
  'lastWeapon',
  // Function-key bindings, cached from User.fkeys. They belong to the CAPTAIN,
  // not the hull, so they follow them across ships and have no Ship column.
  // @see src/game/commands/fkeys.ts
  'fkeys',
  // The player's display handle, cached from User.username so public messages
  // can name a captain without leaking the account key. @see display-name.ts
  'username',
  // The pilot's CUMULATIVE kills, read from User at board time to drive
  // Cybertron escalation. Ship.kills is per-hull and is a real column.
  'userKills',
] as const satisfies readonly InMemoryOnlyKey[];

/**
 * Compile-time exhaustiveness guard. If this line errors, the type in the
 * message names a ShipState field with no Ship column that is missing from
 * IN_MEMORY_ONLY above — add it there, or add a migration giving it a column.
 */
type UnlistedInMemoryKey = Exclude<InMemoryOnlyKey, (typeof IN_MEMORY_ONLY)[number]>;
const _everyInMemoryFieldIsListed: [UnlistedInMemoryKey] extends [never]
  ? true
  : ['ShipState field missing from IN_MEMORY_ONLY:', UnlistedInMemoryKey] = true;
void _everyInMemoryFieldIsListed;

/**
 * Real Ship columns that are nonetheless never written by a tick flush.
 * These DO have columns, so the guard above cannot catch them; they are
 * excluded deliberately and each needs its reason.
 */
const NOT_FLUSHED = [
  // Set at creation and at death only, never by a tick flush.
  'status',
  // Part of the where-key, not updatable data.
  'userid',
  'shipno',
] as const satisfies readonly ShipColumnName[];

const EXCLUDED_FROM_FLUSH = new Set<string>([...IN_MEMORY_ONLY, ...NOT_FLUSHED]);

/**
 * The in-memory-only ShipState fields, exported so tests can assert that a
 * state carrying every one of them still flushes clean. @see test/unit/ship-flush-columns.spec.ts
 */
export const IN_MEMORY_ONLY_SHIP_FIELDS: readonly string[] = IN_MEMORY_ONLY;

/**
 * Converts a live ShipState back to a Prisma update payload.
 * Strips the dirty flag and in-memory-only fields that have no DB column.
 * @see ShipState.dirty
 */
export function stateToPrismaUpdate(state: ShipState): Prisma.ShipUpdateInput {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (!EXCLUDED_FROM_FLUSH.has(key)) update[key] = value;
  }
  return update as Prisma.ShipUpdateInput;
}
