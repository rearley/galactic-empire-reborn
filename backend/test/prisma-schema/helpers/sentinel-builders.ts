/**
 * Builds non-default-value fixtures for every entity.
 * Every numeric field is set to a value ≠ 0/false/"" so round-trip tests
 * can catch a column that silently defaults or drops.
 *
 * These return plain objects compatible with Prisma CreateInput types.
 * The types are inlined to avoid needing generated client at write-time.
 */
import { BEACONMSGSZ, MAXDECOY, MAXMISSL, MAXTORPS, NUMITEMS, UIDSIZ } from "./constants";

// ─── helpers ───────────────────────────────────────────────────────────────

const bigVal = BigInt("9999999999"); // > 2^31 − 1; exercises BigInt columns
const str = (len: number, char = "x") => char.repeat(len);

// ─── User ──────────────────────────────────────────────────────────────────

export function buildUserSentinel(userid = str(UIDSIZ)) {
  return {
    userid,
    score: bigVal,
    noships: 3,
    topshipno: 7,
    kills: 42,
    rospos: 5,
    planets: 2,
    cash: bigVal,
    debt: bigVal,
    plscore: bigVal,
    klscore: bigVal,
    population: bigVal,
    options: Array.from({ length: 30 }, (_, i) => i + 1),
    teamcode: bigVal,
  };
}

// ─── Ship ──────────────────────────────────────────────────────────────────

export function buildShipSentinel(userid = str(UIDSIZ), shipno = 1) {
  return {
    userid,
    shipno,
    shipname: str(35),
    shpclass: 5,
    heading: 270.5,
    head2b: 90.0,
    speed: 8.5,
    speed2b: 10.0,
    xcoord: 14.75,
    ycoord: 7.25,
    damage: 33.3,
    energy: 88.8,
    phasr: 75.0,
    phasrtype: 2,
    kills: 11,
    lastfired: 3,
    shieldtype: 1,
    shieldstat: 1,
    shield: 19,
    cloak: -1,
    degrees: 180,
    percent: 50,
    tactical: 1,
    helm: 1,
    train: 0,
    where: 0,
    ltorpsChannel: Array.from({ length: MAXTORPS }, (_, i) => i + 1),
    ltorpsDistance: Array.from({ length: MAXTORPS }, (_, i) => (i + 1) * 100),
    lmisslChannel: Array.from({ length: MAXMISSL }, (_, i) => i + 1),
    lmisslDistance: Array.from({ length: MAXMISSL }, (_, i) => (i + 1) * 200),
    lmisslEnergy: Array.from({ length: MAXMISSL }, (_, i) => (i + 1) * 50),
    decout: Array.from({ length: MAXDECOY }, (_, i) => i + 1),
    jammer: 1,
    freq: [10, 20, 30],
    items: Array.from({ length: NUMITEMS }, (_, i) => BigInt(i + 1) * bigVal),
    titem: 3,
    hostile: 1,
    cantexit: 0,
    repair: 1,
    hypha: 0,
    firecntl: 1,
    destruct: 0,
    status: 1,
    cybmine: 0,
    cybskill: 3,
    cybupdate: 1,
    tick: 4,
    emulate: 0,
    minesnear: 1,
    lock: 2,
    holdcourse: 1,
    topspeed: 25,
    warncntr: 3,
  };
}

// ─── Sector ────────────────────────────────────────────────────────────────

export function buildSectorSentinel(xsect = 5, ysect = 7) {
  return {
    xsect,
    ysect,
    plnum: 0,
    type: 3,
    numplan: 2,
  };
}

// ─── Planet ────────────────────────────────────────────────────────────────

export function buildPlanetSentinel(xsect = 3, ysect = 4, plnum = 1) {
  return {
    xsect,
    ysect,
    plnum,
    type: 2,
    xcoord: 3.5,
    ycoord: 4.5,
    userid: str(UIDSIZ),
    name: str(20),
    enviorn: 3,
    resource: 5,
    cash: bigVal,
    debt: bigVal,
    tax: bigVal,
    taxrate: 15,
    warnings: 2,
    password: str(10),
    lastattack: str(UIDSIZ),
    beacon: str(BEACONMSGSZ),
    spyowner: str(UIDSIZ),
    technology: 7,
    teamcode: bigVal,
    itemsQty: Array.from({ length: NUMITEMS }, (_, i) => BigInt(i + 1) * bigVal),
    itemsRate: Array.from({ length: NUMITEMS }, (_, i) => (i + 1) * 10),
    itemsSell: Array.from({ length: NUMITEMS }, (_, i) => i % 2),
    itemsReserve: Array.from({ length: NUMITEMS }, (_, i) => (i + 1) * 5),
    itemsMarkup2a: Array.from({ length: NUMITEMS }, (_, i) => (i + 1) * 3),
    itemsSold2a: Array.from({ length: NUMITEMS }, (_, i) => BigInt(i + 2) * bigVal),
  };
}

// ─── Wormhole ──────────────────────────────────────────────────────────────

export function buildWormholeSentinel(xsect = 10, ysect = 5, plnum = 1) {
  return {
    xsect,
    ysect,
    plnum,
    type: 4,
    xcoord: 10.25,
    ycoord: 5.75,
    visible: 1,
    destXcoord: 25.0,
    destYcoord: 12.5,
    name: str(20),
  };
}

// ─── Team ──────────────────────────────────────────────────────────────────

export function buildTeamSentinel(teamcode = bigVal) {
  return {
    teamcode,
    teamname: str(31),
    teamcount: 5,
    teamscore: bigVal,
    password: str(11),
    secret: str(11),
    flag: 1,
  };
}

// ─── Mail ──────────────────────────────────────────────────────────────────

export function buildMailSentinel(
  userid = str(UIDSIZ),
  mailClass = 1,
  msgno = BigInt(1)
) {
  return {
    userid,
    class: mailClass,
    msgno,
    type: 2,
    stamp: 100,
    dtime: str(20),
    topic: str(30),
    string1: str(80),
    name1: str(25),
    name2: str(25),
    int1: 11,
    int2: 22,
    int3: 33,
    long1: bigVal,
    long2: bigVal,
    long3: bigVal,
  };
}

// ─── MailStat ──────────────────────────────────────────────────────────────

export function buildMailStatSentinel(
  userid = str(UIDSIZ),
  mailClass = 3,
  msgno = BigInt(1)
) {
  return {
    userid,
    class: mailClass,
    msgno,
    type: 1,
    stamp: 200,
    dtime: str(20),
    topic: str(30),
    name1: str(25),
    int1: 7,
    int2: 8,
    cash: bigVal,
    debt: bigVal,
    tax: bigVal,
    itemqty: Array.from({ length: NUMITEMS }, (_, i) => BigInt(i + 1) * bigVal),
  };
}

// ─── Mine ──────────────────────────────────────────────────────────────────

export function buildMineSentinel(deployedBy = str(UIDSIZ)) {
  return {
    channel: 3,
    timer: 120,
    xcoord: 14.5,
    ycoord: 6.25,
    deployedBy,
    deployedAt: new Date("2026-05-01T00:00:00Z"),
  };
}
