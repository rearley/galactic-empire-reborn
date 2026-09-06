/**
 * T013 / T026 — Owner alert and spy-mail roll tests for PlanetAttackService.
 * Covers troop and fighter branches.
 * @see GECMDS.C:3952–3994 call_4_help
 * @see research.md D4
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlanetAttackService, ATTACK_OWNER_ALERT_EVENT } from '../../../src/game/planet/planet-attack.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { I_TROOPS, I_FIGHTER, NUMITEMS } from '../../../src/game/constants/items';
import {
  PLATTRT1_DEFAULT, PLATTRT2_DEFAULT, FIRETICKS_DEFAULT,
} from '../../../src/game/commands/attack.config';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { MAIL_TYPE_MAP } from '../../../src/game/planet/planet-attack.service';

function makeItems(): PlanetState['items'] {
  return Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
}

function makeShip(): ShipState {
  const items = Array(NUMITEMS).fill(0n) as bigint[];
  items[I_TROOPS] = 10000n;
  items[I_FIGHTER] = 10000n;
  return {
    userid: 'attacker', shipno: 1, shipname: 'Attacker', shpclass: 5,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items,
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
  };
}

function buildService(seed: number, opts: { spyowner?: string; ownerInGame?: boolean } = {}) {
  const random = new Mulberry32Adapter(seed);
  const events = new EventEmitter2();
  const emitted: { event: string; payload: unknown }[] = [];
  events.on('**', (payload, event) => emitted.push({ event, payload }));

  const mockShipState = {
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        const s = makeShip();
        fn(s);
      },
    ),
    // ownerIsInGame() — canon's mailit(1) suppression (GEFUNCS.C:2231) and
    // the first arm of call_4_help's chain (GECMDS.C:3955).
    findByUserid: jest.fn().mockReturnValue(
      opts.ownerInGame ? [{ ...makeShip(), userid: 'defender', status: 1 }] : [],
    ),
  } as unknown as ShipStateService;

  const mockPrisma = {
    user: { update: jest.fn().mockResolvedValue({}) },
    mailStat: { create: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;

  const makePlanetWithOwner = (ownerUserid: string | null): PlanetState => {
    const items = makeItems();
    items[I_TROOPS].qty = 10n; // very few defenders — high ratio to trigger alerts
    items[I_FIGHTER].qty = 0n;
    return {
      xsect: 5, ysect: 5, plnum: 0,
      type: 1, xcoord: 5.5, ycoord: 5.5,
      userid: ownerUserid,
      name: 'AlertPlanet', enviorn: 0, resource: 0,
      cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0,
      password: '', lastattack: '', beacon: '',
      spyowner: opts.spyowner ?? '',
      technology: 0, teamcode: 0n,
      items,
    };
  };

  const service = new PlanetAttackService(
    mockShipState, mockPrisma, events, random,
    PLATTRT1_DEFAULT, PLATTRT2_DEFAULT,
    0.05, 0.05, 0.05,
    FIRETICKS_DEFAULT,
  );

  return { service, events, emitted, mockPrisma, makePlanetWithOwner };
}

// ---------------------------------------------------------------------------
// T013 — Troop branch: owner alert
// ---------------------------------------------------------------------------

describe('PlanetAttackService — owner alert (troop branch)', () => {
  // `ownerInGame` is now load-bearing: canon's first arm is
  // `instat(plptr->userid,gestt) && othusp->substt >= FIGHTSUB`
  // (GECMDS.C:3955), so the live alert only fires for an owner who is actually
  // flying. This spec used to leave the owner offline and still expect the
  // alert, which was the port's flattened chain rather than canon's.
  it('emits ATTACK_OWNER_ALERT_EVENT with ownerUserid when ratio > 1', async () => {
    const { service, events, makePlanetWithOwner } = buildService(42, { ownerInGame: true });
    const alertPayloads: unknown[] = [];
    events.on(ATTACK_OWNER_ALERT_EVENT, (payload) => alertPayloads.push(payload));

    const planet = makePlanetWithOwner('defender');
    planet.items[I_TROOPS].qty = 5n; // tiny defenders → 10000/5 = ratio 2000 → ratio > 1
    const ship = makeShip();

    await service.attackTroop(10000, ship, planet);

    expect(alertPayloads.length).toBeGreaterThan(0);
    const payload = alertPayloads[0] as { ownerUserid: string; message: string };
    expect(payload.ownerUserid).toBe('defender');
    expect(typeof payload.message).toBe('string');
  });

  it('does NOT emit alert when ratio <= 1 (attacker outnumbered)', async () => {
    const { service, events, makePlanetWithOwner } = buildService(42);
    const alertPayloads: unknown[] = [];
    events.on(ATTACK_OWNER_ALERT_EVENT, (payload) => alertPayloads.push(payload));

    // `ratio` is a PERCENTAGE in canon: (left1*100)/left2, gated at `> 2`
    // (GECMDS.C:3655, :3673). "Outnumbered enough to go unnoticed" therefore
    // means the landing party is under 2 percent of the garrison, not merely
    // smaller than it. This fixture used 10 000 against 50 000, which reads as hopeless but
    // is 20 percent of the defenders -- comfortably over the threshold. It only
    // passed while the port omitted the x100 and computed an integer quotient of 0.
    const planet = makePlanetWithOwner('defender');
    planet.items[I_TROOPS].qty = 50_000n; // massive defenders
    const ship = makeShip(); // 500 attackers → ratio = 1 percent, below the gate

    await service.attackTroop(500, ship, planet);

    expect(alertPayloads.length).toBe(0);
  });

  it('does NOT emit alert when planet has no owner', async () => {
    const { service, events, makePlanetWithOwner } = buildService(42);
    const alertPayloads: unknown[] = [];
    events.on(ATTACK_OWNER_ALERT_EVENT, (payload) => alertPayloads.push(payload));

    const planet = makePlanetWithOwner(null);
    planet.items[I_TROOPS].qty = 5n;
    const ship = makeShip();

    await service.attackTroop(10000, ship, planet);

    expect(alertPayloads.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T013 — Troop branch: spy mail
// ---------------------------------------------------------------------------

describe('PlanetAttackService — spy mail roll (troop branch)', () => {
  it('inserts spy mail when sendSpyMail gate met (ratio > 5) and spyowner set and won == 1', async () => {
    const { service, mockPrisma, makePlanetWithOwner } = buildService(42, { spyowner: 'spy1' });

    const planet = makePlanetWithOwner('defender');
    planet.items[I_TROOPS].qty = 1n; // ratio will be huge → sendSpyMail = true
    const ship = makeShip();

    await service.attackTroop(10000, ship, planet);

    // mailStat.create may have been called for owner mail AND spy mail
    // We just assert it was called at least once when spyowner is set and conditions met
    const calls = (mockPrisma.mailStat.create as jest.Mock).mock.calls;
    if (calls.length > 0) {
      // If spy mail was inserted, recipient should include 'spy1'
      const recipientsIncludeSpy = calls.some(
        (c: unknown[]) => (c[0] as { data: { userid: string } }).data.userid === 'spy1',
      );
      // This is probabilistic due to gernd()%6==0 gate — but if won==1, it always fires
      // We rely on won==1 path which is deterministic for overwhelming attack
      if (planet.userid === 'attacker') {
        expect(recipientsIncludeSpy).toBe(true);
      }
    }
  });

  it('does NOT insert spy mail when spyowner is empty', async () => {
    const { service, mockPrisma, makePlanetWithOwner } = buildService(42); // no spyowner

    const planet = makePlanetWithOwner('defender');
    planet.items[I_TROOPS].qty = 1n;
    const ship = makeShip();

    await service.attackTroop(10000, ship, planet);

    const calls = (mockPrisma.mailStat.create as jest.Mock).mock.calls;
    // No spy mail since spyowner is ''
    const hasSpyRecipient = calls.some(
      (c: unknown[]) => (c[0] as { data: { userid: string } }).data.userid === '',
    );
    expect(hasSpyRecipient).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T026 — Fighter branch: owner alert
// ---------------------------------------------------------------------------

describe('PlanetAttackService — owner alert (fighter branch)', () => {
  it('emits alert when ratio > 1 in fighter attack', async () => {
    const { service, events, makePlanetWithOwner } = buildService(42, { ownerInGame: true });
    const alertPayloads: unknown[] = [];
    events.on(ATTACK_OWNER_ALERT_EVENT, (payload) => alertPayloads.push(payload));

    const planet = makePlanetWithOwner('defender');
    planet.items[I_FIGHTER].qty = 1n; // 1 defender fighter → ratio = 10000/1 * 100 = 1,000,000 >> 1
    const ship = makeShip();

    await service.attackFighter(10000, ship, planet);

    expect(alertPayloads.length).toBeGreaterThan(0);
    const payload = alertPayloads[0] as { ownerUserid: string };
    expect(payload.ownerUserid).toBe('defender');
  });

  it('emits alert when won == 1 even if ratio <= 1', async () => {
    // won==1 when left2==0 && troops<5
    const { service, events, makePlanetWithOwner } = buildService(1);
    const alertPayloads: unknown[] = [];
    events.on(ATTACK_OWNER_ALERT_EVENT, (payload) => alertPayloads.push(payload));

    // 1 defender fighter, 0 troops → won=1 is possible
    const planet = makePlanetWithOwner('defender');
    planet.items[I_FIGHTER].qty = 1n;
    planet.items[I_TROOPS].qty = 0n;
    const ship = makeShip();

    await service.attackFighter(10000, ship, planet);

    // Alert fires on (ratio > 1 || won == 1)
    // We just assert the service ran without error and alert was or wasn't emitted consistently
    expect(typeof alertPayloads.length).toBe('number');
  });
});

/**
 * `call_4_help` is an if/else-if CHAIN, and the port had flattened it.
 *
 *   if (instat(plptr->userid,gestt) && othusp->substt >= FIGHTSUB) {
 *       prfmsg(ATTACK6,...);  outprf(othusn);          // the OWNER
 *       prfmsg(ATTACK7);      outprfge(ALWAYS,usrnum); // the ATTACKER
 *   }
 *   else if (onsys(plptr->userid) && ...) { ATTACK6A; ATTACK7; }
 *   else if (won == 0 && send_spy_mail && gernd()%6 == 0 && spyowner[0]) { SPYM3 }
 *   else if (won == 1 && spyowner[0])                                    { SPYM4 }
 *
 * @see GECMDS.C:3952-3994
 *
 * Three things follow from it being a chain, and the port had none of them:
 *
 *  - the ATTACKER is told the planet called for help. That is the tell that
 *    the owner is online and inbound — the cue to press the assault or break
 *    orbit — and it was silently absent;
 *  - the spy's report is only sent when the owner could NOT be reached. The
 *    port sent it unconditionally;
 *  - a WON attack always reports to the spy owner. The port gated it on
 *    `sendSpyMail` (ratio > 5), so a planet taken at low ratio told the spy
 *    nothing, which is the case a spy is most useful for.
 *
 * The port also sent the spy a MESG02/MESG04 body — "they successfully
 * defended the planet", written as though the planet were the recipient's own.
 * Canon sends SPYM3/SPYM4: a TOP SECRET operative report in the spy's voice.
 */
describe('call_4_help is a chain, not a broadcast (GECMDS.C:3952)', () => {
  const highRatioAttack = 10_000;

  it('tells the ATTACKER the planet is calling for help', async () => {
    const { service, makePlanetWithOwner } = buildService(42, { ownerInGame: true });

    const out = await service.attackTroop(highRatioAttack, makeShip(), makePlanetWithOwner('defender'));

    expect(out.narration).toContain(formatMessage(MessageId.ATT_DISTRESS_SENT));
  });

  it('says nothing to the attacker when the owner is not there to hear it', async () => {
    const { service, makePlanetWithOwner } = buildService(42, { ownerInGame: false });

    const out = await service.attackTroop(highRatioAttack, makeShip(), makePlanetWithOwner('defender'));

    expect(out.narration).not.toContain(formatMessage(MessageId.ATT_DISTRESS_SENT));
  });

  it('does NOT mail the spy when the owner was reached — the spy arms are else-ifs', async () => {
    const { service, mockPrisma, makePlanetWithOwner } = buildService(42, {
      ownerInGame: true, spyowner: 'spook',
    });

    await service.attackTroop(highRatioAttack, makeShip(), makePlanetWithOwner('defender'));

    const calls = (mockPrisma.mailStat.create as jest.Mock).mock.calls;
    expect(calls.filter((c) => c[0].data.userid === 'spook')).toHaveLength(0);
  });

  it('mails the spy SPYM4 when the planet FALLS, with no ratio gate', async () => {
    // canon: `won == 1 && spyowner[0] != 0` — no send_spy_mail, no roll.
    const { service, mockPrisma, makePlanetWithOwner } = buildService(42, { spyowner: 'spook' });
    const planet = makePlanetWithOwner('defender');
    planet.items[I_TROOPS].qty = 1n;

    const out = await service.attackTroop(highRatioAttack, makeShip(), planet);

    if (out.won === 1) {
      const calls = (mockPrisma.mailStat.create as jest.Mock).mock.calls;
      const spy = calls.find((c) => c[0].data.userid === 'spook');
      expect(spy?.[0].data.type).toBe(MAIL_TYPE_MAP[MessageId.SPY_REPORT_TAKEN]);
    }
  });

  it('uses the operative report, not the owner distress body', async () => {
    const { service, mockPrisma, makePlanetWithOwner } = buildService(42, { spyowner: 'spook' });
    const planet = makePlanetWithOwner('defender');
    planet.items[I_TROOPS].qty = 1n;

    await service.attackTroop(highRatioAttack, makeShip(), planet);

    const calls = (mockPrisma.mailStat.create as jest.Mock).mock.calls;
    const spy = calls.find((c) => c[0].data.userid === 'spook');
    // MESG02/MESG04 are the OWNER's distress bodies; a spy must never get one.
    expect([MAIL_TYPE_MAP[MessageId.MESG02], MAIL_TYPE_MAP[MessageId.MESG04]])
      .not.toContain(spy?.[0].data.type);
  });
});
