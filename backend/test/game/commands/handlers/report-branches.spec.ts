/**
 * `rep` — which sub-report a keyword selects, and the conditional lines that
 * only appear for certain hull fits.
 *
 * A pilot reads `rep` to decide whether to fight or run. A sub-report that
 * silently shows the wrong section, or a weapons list that claims a fit the
 * hull does not have, costs a ship: `rep wpns` is the only in-game answer to
 * "can this hull carry torpedoes", and `rep acc` is the only answer to "can I
 * afford the upgrade". Everything here enters through the REAL command entry
 * point — `service.command.handler(ship, args, ctx)`, the same call
 * `CommandRouterService` makes — and asserts the exact emitted lines, never a
 * mock call count on its own.
 *
 * Canon for each branch (cmd_report, GECMDS.C:1946):
 *
 * - The sub-report is chosen by a chain of `sameas(margv[1], "...")` tests with
 *   a REPFMT default (GECMDS.C:2101-2104). A typo must produce the usage line,
 *   not a section.
 * - The weapons fit comes from the class table, not the hull instance —
 *   `shipclass[warsptr->shpclass]` — so two ships of different classes must
 *   answer differently for the same flag.
 * - `acc` reads the USER record, not the ship: REP26 when
 *   `waruptr->planets == 0` else REP27; REP28 cash; score clamped at zero,
 *   `if (waruptr->score <= 0) sprintf(gechrbuf,"0")` (GECMDS.C:2087-2092);
 *   REP31 kills; REP31A only `if (waruptr->teamcode > 0)` (GECMDS.C:2096-2099).
 * - The cloak line is gated on the CLASS —
 *   `if (shipclass[...].max_cloak == 1)` (GECMDS.C:2029) — so a hull with no
 *   cloak bay is told nothing at all, neither REP12 nor REP13.
 *
 * Deliberately NOT covered here, per docs/TEST_STRATEGY.md:
 * - The fourteen `cls?.maxTons ?? '?'`-shaped display fallbacks in the `wpns`
 *   block (report.handler.ts:124-134) and `cls?.typeName ?? 'Class n'` (:68).
 *   They fire only when a class is missing from the cache, which cannot happen
 *   for a ship that exists, and are cosmetic if it ever does.
 * - `maxCharge > 0 ? ... : 0` (:202). The value it computes is discarded on the
 *   next line (`void pct`) — the branch cannot change any output.
 * - `if (!user) return lines` (:285). A ship in the state map always has a user
 *   row; the guard prevents a crash, not a wrong answer.
 * - The `nav`, `sys` damage/subsystem and `inv`/`cargo` arms, already pinned by
 *   test/unit/handlers/report.spec.ts, report-cargo.spec.ts and
 *   cloak-reachability.spec.ts.
 *
 * @see GECMDS.C:1946 cmd_report, :2020 REP23/REP24, :2076-2099 acc section
 */
import { ReportHandlerService } from '../../../../src/game/commands/handlers/report.handler';
import type { PrismaService } from '../../../../src/prisma/prisma.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import type { CommandResult } from '../../../../src/game/commands/command.types';
import type { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { PMINFIRE } from '../../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';
import type { Mock } from 'vitest';

interface ClassRow {
  classNumber: number;
  typeName: string;
  maxPhaser: number;
  maxShields: number;
  hasTorpedo: boolean;
  hasMissile: boolean;
  hasDecoy: boolean;
  hasJammer: boolean;
  hasZipper: boolean;
  hasMine: boolean;
  hasCloak: boolean;
  maxTons: number;
  maxWarp: number;
}

interface UserRow {
  cash: bigint;
  score: bigint;
  kills: number;
  planets: number;
  teamcode: bigint | null;
}

function makeClass(over: Partial<ClassRow> = {}): ClassRow {
  return {
    classNumber: 1,
    typeName: 'Interceptor',
    maxPhaser: 4,
    maxShields: 4,
    hasTorpedo: false,
    hasMissile: false,
    hasDecoy: false,
    hasJammer: false,
    hasZipper: false,
    hasMine: false,
    hasCloak: false,
    maxTons: 1000,
    maxWarp: 9,
    ...over,
  };
}

function makeUser(over: Partial<UserRow> = {}): UserRow {
  return { cash: 0n, score: 0n, kills: 0, planets: 0, teamcode: null, ...over };
}

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'captain1',
    shipname: 'USS Test',
    heading: 270,
    xcoord: 5.5,
    ycoord: 3.25,
    freq: [100, 200, 300],
    status: 0,
    ...over,
  });
}

interface Harness {
  service: ReportHandlerService;
  userFind: Mock;
  teamFind: Mock;
}

async function makeHarness(
  classes: ClassRow[] = [makeClass()],
  user: UserRow | null = makeUser(),
  team: { teamname: string } | null = null,
): Promise<Harness> {
  const userFind = vi.fn().mockResolvedValue(user);
  const teamFind = vi.fn().mockResolvedValue(team);
  const prisma = {
    user: { findUnique: userFind },
    team: { findUnique: teamFind },
  } as unknown as PrismaService;
  const shipClassCache = new ShipClassCacheService({} as never);
  for (const c of classes) {
    shipClassCache.setForTest(c.classNumber, { maxAcceleration: 0, ...c });
  }
  const service = new ReportHandlerService(prisma, undefined, shipClassCache);
  return { service, userFind, teamFind };
}

async function report(h: Harness, args: string[], ship: ShipState = makeShip()): Promise<string[]> {
  const result = await (h.service.command.handler(ship, args, {}) as Promise<CommandResult>);
  return result.lines.map((l) => l.text);
}

// ---------------------------------------------------------------------------
// Sub-report selection (report.handler.ts:121, :138, :143)
// ---------------------------------------------------------------------------

describe('rep <keyword> — which section the keyword selects', () => {
  it('`wpns` returns the weapons list and nothing from nav, sys or acc', async () => {
    const h = await makeHarness();
    const lines = await report(h, ['wpns'], makeShip({ phasrtype: 2, shieldtype: 1 }));

    expect(lines).toContain('Weapons & Systems:');
    expect(lines.some((t) => t.startsWith('  Torpedoes:'))).toBe(true);
    // Not the navigation section (REP35/REP32), not systems (REP09), not
    // accounting (REP25) — a mis-routed keyword would show one of these.
    expect(lines).not.toContain(formatMessage(MessageId.REP35));
    expect(lines.some((t) => t.startsWith('Galactic Pos.'))).toBe(false);
    expect(lines).not.toContain(formatMessage(MessageId.REP25));
    expect(h.userFind).not.toHaveBeenCalled();
  });

  it('`acc` returns the accounting section, read against the CALLER\'s userid', async () => {
    const h = await makeHarness([makeClass()], makeUser({ kills: 4 }));
    const lines = await report(h, ['acc'], makeShip({ userid: 'captain1' }));

    expect(lines).toContain(formatMessage(MessageId.REP25));
    expect(lines).toContain(formatMessage(MessageId.REP31, 4));
    expect(lines).not.toContain('Weapons & Systems:');
    // The account belongs to the pilot flying the hull — reading anyone else's
    // would show another player their rival's cash.
    expect(h.userFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userid: 'captain1' } }),
    );
  });

  it('an unrecognised keyword answers REPFMT alone — never a section by default', async () => {
    const h = await makeHarness();
    const lines = await report(h, ['navv']);

    expect(lines).toEqual([formatMessage(MessageId.REPFMT)]);
  });
});

// ---------------------------------------------------------------------------
// `rep wpns` — the fit comes from the CLASS row (report.handler.ts:126-132)
// ---------------------------------------------------------------------------

describe('rep wpns — yes/no mirrors the hull fit, per flag', () => {
  it('reports each system independently, from that ship\'s class row', async () => {
    const h = await makeHarness([
      makeClass({
        classNumber: 1,
        hasTorpedo: true, hasMissile: false,
        hasDecoy: false, hasJammer: true,
        hasZipper: false, hasMine: true, hasCloak: false,
      }),
    ]);
    const lines = await report(h, ['wpns']);

    expect(lines).toContain('  Torpedoes:  yes');
    expect(lines).toContain('  Missiles:   no');
    expect(lines).toContain('  Decoys:     no');
    expect(lines).toContain('  Jammers:    yes');
    expect(lines).toContain('  Zippers:    no');
    expect(lines).toContain('  Mines:      yes');
    expect(lines).toContain('  Cloak:      no');
  });

  it('a second class answers differently for the same flags', async () => {
    const h = await makeHarness([
      makeClass({ classNumber: 1, hasTorpedo: true, hasMine: true }),
      makeClass({ classNumber: 7, typeName: 'Freighter', hasTorpedo: false, hasMine: false, hasCloak: true }),
    ]);
    const lines = await report(h, ['wpns'], makeShip({ shpclass: 7 }));

    expect(lines[0]).toBe(formatMessage(MessageId.REP01, 'Freighter', 'USS Test'));
    expect(lines).toContain('  Torpedoes:  no');
    expect(lines).toContain('  Mines:      no');
    expect(lines).toContain('  Cloak:      yes');
  });
});

// ---------------------------------------------------------------------------
// `rep sys` — the phaser line and the class-gated cloak line
// ---------------------------------------------------------------------------

describe('rep sys — phaser bank readiness (report.handler.ts:222)', () => {
  // A recorded deviation, not an accident. Canon prints REP23 whenever
  // GECMDS.C:2019 `if (warsptr->phasr > 0)` holds, while `cmd_phas` refuses to
  // fire below PMINFIRE — so the original calls the bank operative through the
  // 0-59 band and then declines the shot. This port gates the report on the
  // charge a shot actually costs, so the line answers the question the pilot is
  // asking. @divergence rep-sys-phaser-readiness
  it('a bank at or above PMINFIRE reads operative', async () => {
    const h = await makeHarness();
    const lines = await report(h, ['sys'], makeShip({ phasrtype: 3, phasr: PMINFIRE }));
    expect(lines).toContain(formatMessage(MessageId.REP23, 3));
    expect(lines).not.toContain(formatMessage(MessageId.REP24, 3));
  });

  it('one point below PMINFIRE reads inoperable — the pilot must not be told it can fire', async () => {
    const h = await makeHarness();
    const lines = await report(h, ['sys'], makeShip({ phasrtype: 3, phasr: PMINFIRE - 1 }));
    expect(lines).toContain(formatMessage(MessageId.REP24, 3));
    expect(lines).not.toContain(formatMessage(MessageId.REP23, 3));
  });
});

describe('rep sys — the cloak line is gated on the CLASS (GECMDS.C:2029)', () => {
  it('a hull with no cloak bay is told neither REP12 nor REP13', async () => {
    const h = await makeHarness([makeClass({ hasCloak: false })]);
    const lines = await report(h, ['sys'], makeShip({ cloak: 0 }));

    expect(lines).not.toContain(formatMessage(MessageId.REP12));
    expect(lines).not.toContain(formatMessage(MessageId.REP13));
    // and still reports the rest of the section
    expect(lines).toContain(formatMessage(MessageId.REP24A, 100, 200, 300));
  });
});

// ---------------------------------------------------------------------------
// `rep acc` — the account conditionals (report.handler.ts:287, :295, :300, :305)
// ---------------------------------------------------------------------------

describe('rep acc — planets, score and team (GECMDS.C:2076-2099)', () => {
  it('no planets established says so; a colonised empire prints the count', async () => {
    const none = await makeHarness([makeClass()], makeUser({ planets: 0 }));
    expect(await report(none, ['acc'])).toContain(formatMessage(MessageId.REP26));

    const some = await makeHarness([makeClass()], makeUser({ planets: 3 }));
    const lines = await report(some, ['acc']);
    expect(lines).toContain(formatMessage(MessageId.REP27, 3));
    expect(lines).not.toContain(formatMessage(MessageId.REP26));
  });

  it('a negative score is clamped to 0, cash is not', async () => {
    const h = await makeHarness([makeClass()], makeUser({ score: -4500n, cash: 12345n }));
    const lines = await report(h, ['acc']);

    expect(lines).toContain(formatMessage(MessageId.REP30, '0'));
    expect(lines.some((t) => t.includes('-4,500') || t.includes('-4500'))).toBe(false);
    expect(lines).toContain(formatMessage(MessageId.REP28, (12345n).toLocaleString()));
  });

  it('a positive score is printed, not clamped', async () => {
    const h = await makeHarness([makeClass()], makeUser({ score: 98765n }));
    expect(await report(h, ['acc'])).toContain(
      formatMessage(MessageId.REP30, (98765n).toLocaleString()),
    );
  });

  it('a teamed captain gets REP31A with the team name', async () => {
    const h = await makeHarness([makeClass()], makeUser({ teamcode: 42n }), { teamname: 'Red Fleet' });
    const lines = await report(h, ['acc']);

    expect(lines).toContain(formatMessage(MessageId.REP31A, 'Red Fleet'));
    expect(h.teamFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamcode: 42n } }),
    );
  });

  it('an unteamed captain gets no team line and no team lookup', async () => {
    const h = await makeHarness([makeClass()], makeUser({ teamcode: 0n }));
    const lines = await report(h, ['acc']);

    expect(lines.some((t) => t.startsWith('   Team:'))).toBe(false);
    expect(h.teamFind).not.toHaveBeenCalled();
  });

  // CHARACTERIZATION. Canon's teamname() always resolves; here a teamcode
  // pointing at a row that no longer exists (a team disbanded at midnight)
  // must drop the line rather than print "Team: undefined".
  it('a dangling teamcode drops the line rather than printing a blank team', async () => {
    const h = await makeHarness([makeClass()], makeUser({ teamcode: 42n }), null);
    const lines = await report(h, ['acc']);

    expect(lines.some((t) => t.startsWith('   Team:'))).toBe(false);
    expect(lines.join('\n')).not.toMatch(/undefined/);
  });
});
