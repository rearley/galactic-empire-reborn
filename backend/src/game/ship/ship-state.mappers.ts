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
    warncntr: row.warncntr,
    autoShield: row.autoShield,
    autoRepair: row.autoRepair,
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
  const { dirty, isEphemeral, teamcode, ...rest } = state;
  return rest;
}
