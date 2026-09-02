import { Ship, Prisma } from '@prisma/client';
import { ShipState } from './ship-state.types';

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
    ltorpsChannel: row.ltorpsChannel,
    ltorpsDistance: row.ltorpsDistance,
    lmisslChannel: row.lmisslChannel,
    lmisslDistance: row.lmisslDistance,
    lmisslEnergy: row.lmisslEnergy,
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
    autoShield: row.autoShield,
    autoRepair: row.autoRepair,
    navTargetX: row.navTargetX ?? null,
    navTargetY: row.navTargetY ?? null,
    scanNames: false,
    scanHome: false,
    scanFull: false,
    msgFilter: false,
    dirty: false,
  };
}

/**
 * Converts a live ShipState back to a Prisma update payload.
 * Strips the dirty flag and in-memory-only fields that have no DB column.
 * @see ShipState.dirty
 */
export function stateToPrismaUpdate(state: ShipState): Prisma.ShipUpdateInput {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {
    dirty, isEphemeral, teamcode, scanNames, scanHome, scanFull, msgFilter,
    // status: set at creation/death only, never via tick flush
    status,
    // userid/shipno: part of the where key, not updatable data
    userid, shipno,
    // in-memory only flags — no DB columns
    recentlyWarpedExit,
    recentlySelfFiredTorp,
    maxTons,
    maxWarp,
    // Resolved lock target, written by `loc`. The DB column is `lock` (the
    // target's channel); this is the "userid:shipno" key used to re-find the
    // ship in memory. Leaving it in scope made every flush for any pilot who
    // had locked a target throw `Unknown argument 'lockKey'` — silently, so
    // their ship simply stopped being saved. @see test/unit/ship-flush-columns.spec.ts
    lockKey,
    // channel: assigned on entry to the world and released on exit, so it has
    // no DB column. This function returns `...rest` straight to Prisma, so any
    // in-memory-only field left in scope makes EVERY flush throw — and the
    // caller logs and swallows it, so the only symptom is that nothing is ever
    // persisted again. @see ship-channel.registry.ts
    channel,
    ...rest
  } = state;
  return rest;
}
