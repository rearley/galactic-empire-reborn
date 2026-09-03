/**
 * Canon: `mai` IS the maintenance command.
 *
 *   GECMDS.C:144   {"mai", cmd_maint, 1}
 *   GECMDS.C:4452  cmd_maint — the whole body is repair; there is no mailbox
 *   GECMDS.C:4469  `if (!sameas(plptr->password,"none") && margc < 2)` — the
 *                  ONLY optional argv[1] is the planet trade password.
 *
 * Our port dispatched on argument COUNT: bare `mai` listed mail and repaired
 * nothing, so a crippled pilot in orbit could not find the repair command.
 * The mailbox is a port original with no canon keyword, so it moves to `rea`.
 *
 * The 2,500 cr / 200 cr charge was also silent: MAINT5 (MBMGEMSG.MSG:3578)
 * quotes only the repair duration, never the fee. That is an original defect
 * (a charge with no confirmation), not a design choice, so we print the fee.
 * Prices: GECMDS.C:4500 `price = 200;` and GECMDS.C:4505 `price = 2500;`.
 */

import { MaiHandlerService } from '../../../../src/game/commands/handlers/mai.handler';
import { MaintHandlerService } from '../../../../src/game/commands/handlers/maint.handler';
import { ReaHandlerService } from '../../../../src/game/commands/handlers/rea.handler';
import { MailInboxService } from '../../../../src/game/mail/mail-inbox.service';
import { MaintenanceService } from '../../../../src/game/ship/maintenance.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { CommandResult } from '../../../../src/game/commands/command.types';
import { MailListEntry, MailListing, DistressSignalPayload } from '../../../../src/game/mail/mail.types';
import { HELP_TOPICS, HELP_TOPIC_IDS } from '../../../../src/game/commands/help/help-topics';
import { HelpHandlerService } from '../../../../src/game/commands/handlers/help.handler';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'alice', shipno: 1, shipname: 'AliceShip', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 98, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeEntry(index: number): MailListEntry {
  const payload: DistressSignalPayload = {
    kind: 'distress_signal',
    attackerShipName: 'Black Sun',
    planetName: 'Vega',
    sectorX: 1,
    sectorY: 2,
  };
  return {
    index, userid: 'alice', class: 1, msgno: BigInt(index),
    classLabel: 'Distress Signal', sender: 'Attacker', topic: 'Black Sun',
    date: '2026-05-07', stamp: 1_746_576_000, payload,
  };
}

function makeMaint(result: CommandResult = { lines: [] }) {
  const handler = jest.fn().mockResolvedValue(result);
  return {
    maint: { command: { handler } } as unknown as MaintHandlerService,
    handler,
  };
}

// ── `mai` is maintenance, always ─────────────────────────────────────────────

describe('mai — canon maintenance command (GECMDS.C:144)', () => {
  it('bare `mai` performs maintenance, it does not list mail', async () => {
    const { maint, handler } = makeMaint({ lines: [{ text: 'repairing', category: 'success' }] });
    const mai = new MaiHandlerService(maint);
    const ship = makeShip();

    const result = await mai.command.handler(ship, [], {});

    expect(handler).toHaveBeenCalledWith(ship, [], {});
    expect(result.lines.some((l) => /mail/i.test(l.text))).toBe(false);
  });

  it('passes the single optional argument through as the planet password', async () => {
    const { maint, handler } = makeMaint();
    const mai = new MaiHandlerService(maint);
    const ship = makeShip();

    await mai.command.handler(ship, ['sekrit'], {});

    expect(handler).toHaveBeenCalledWith(ship, ['sekrit'], {});
  });

  it('keyword is "mai"', () => {
    const { maint } = makeMaint();
    expect(new MaiHandlerService(maint).command.keyword).toBe('mai');
  });
});

// ── the 2,500 cr charge is quoted ────────────────────────────────────────────

describe('maint — the fee is printed, not silent', () => {
  function makeMaintHandler(gate: unknown) {
    const svc = { runMaintenance: jest.fn().mockResolvedValue(gate) } as unknown as MaintenanceService;
    return new MaintHandlerService(svc);
  }

  it('success output names the credits charged', async () => {
    const h = makeMaintHandler({ ok: true, price: 2500n, repairAmt: 33 });
    const result = await h.command.handler(makeShip(), [], {});
    const joined = result.lines.map((l) => l.text).join('\n');
    expect(joined).toMatch(/2,?500/);
    expect(joined.toLowerCase()).toContain('credit');
  });

  it('quotes the 200 cr price outside the neutral zone too', async () => {
    const h = makeMaintHandler({ ok: true, price: 200n, repairAmt: 5 });
    const result = await h.command.handler(makeShip(), [], {});
    expect(result.lines.map((l) => l.text).join('\n')).toContain('200');
  });
});

// ── the mailbox moves to `rea` ───────────────────────────────────────────────

describe('rea — bare form lists the mailbox', () => {
  function makeRea(listing: MailListing, entry: MailListEntry | null = null) {
    const inbox = {
      list: jest.fn().mockResolvedValue(listing),
      resolveIndex: jest.fn().mockResolvedValue(entry),
      deleteByIndex: jest.fn(),
    } as unknown as MailInboxService;
    return { rea: new ReaHandlerService(inbox), inbox };
  }

  it('bare `rea` lists messages instead of printing a usage line', async () => {
    const listing: MailListing = { userid: 'alice', entries: [makeEntry(1), makeEntry(2)], empty: false };
    const { rea, inbox } = makeRea(listing);

    const result = await rea.command.handler(makeShip(), [], {});

    expect(inbox.list).toHaveBeenCalledWith('alice');
    expect(result.lines.some((l) => l.text.includes('Distress Signal'))).toBe(true);
    expect(result.lines.some((l) => /usage/i.test(l.text))).toBe(false);
  });

  it('bare `rea` with an empty mailbox says so', async () => {
    const { rea } = makeRea({ userid: 'alice', entries: [], empty: true });
    const result = await rea.command.handler(makeShip(), [], {});
    expect(result.lines.some((l) => /no mail/i.test(l.text))).toBe(true);
  });

  it('`rea <n>` still reads message n', async () => {
    const entry = makeEntry(2);
    const { rea, inbox } = makeRea({ userid: 'alice', entries: [entry], empty: false }, entry);
    const result = await rea.command.handler(makeShip(), ['2'], {});
    expect(inbox.resolveIndex).toHaveBeenCalledWith('alice', 2);
    expect(result.lines.some((l) => l.text.includes('Black Sun'))).toBe(true);
  });
});

// ── discoverability ──────────────────────────────────────────────────────────

describe('help makes repair and the mailbox findable', () => {
  const bodies = () => Object.values(HELP_TOPICS).map((t) => t.body.join('\n')).join('\n');

  it('the topic list includes a maintenance topic', () => {
    expect(HELP_TOPIC_IDS).toContain('maintenance');
  });

  it('the topic list includes a mail topic', () => {
    expect(HELP_TOPIC_IDS).toContain('mail');
  });

  it('`hel mai` resolves to the maintenance topic rather than "unknown topic"', () => {
    const help = new HelpHandlerService();
    const result = help.command.handler(makeShip(), ['mai'], {}) as CommandResult;
    expect(result.lines[0].category).toBe('info');
    expect(result.lines.map((l) => l.text).join('\n').toLowerCase()).toContain('repair');
  });

  it('`hel repair` also resolves to the maintenance topic', () => {
    const help = new HelpHandlerService();
    const result = help.command.handler(makeShip(), ['repair'], {}) as CommandResult;
    expect(result.lines[0].category).toBe('info');
  });

  it('the ship topic mentions repair and points at mai', () => {
    const ship = HELP_TOPICS.ship.body.join('\n');
    expect(ship.toLowerCase()).toContain('repair');
    expect(ship).toMatch(/\bmai\b/);
  });

  it('the maintenance topic quotes both canon prices', () => {
    const body = HELP_TOPICS.maintenance.body.join('\n');
    expect(body).toMatch(/2,?500/);
    expect(body).toContain('200');
  });

  it('combat help covers focus, the reload wait, shields dropping, and sca sh', () => {
    const combat = HELP_TOPICS.combat.body.join('\n');
    expect(combat).toMatch(/focus/i);
    expect(combat).toMatch(/36 ?s|36 seconds/i);
    expect(combat).toMatch(/shield/i);
    expect(combat).toContain('sca sh');
  });

  it('combat help warns that the shop and trading posts sit in the neutral zone', () => {
    const combat = HELP_TOPICS.combat.body.join('\n');
    expect(combat).toMatch(/neutral zone/i);
    expect(combat).toMatch(/sector 0[, ]+0|\(0,0\)|0,0/);
  });

  it('no topic body is silently empty', () => {
    expect(bodies().length).toBeGreaterThan(0);
    for (const id of HELP_TOPIC_IDS) {
      expect(HELP_TOPICS[id].body.length).toBeGreaterThan(1);
    }
  });
});
