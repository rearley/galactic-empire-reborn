/**
 * `hel newprice` and `hel class` are GENERATED, not transcribed.
 *
 * Canon ships both tables and signposts them from HELP NEW itself:
 *   "For pricing on ships type HELP CLASS, for phasers and shields type
 *    HELP NEWPRICE."   -- MBMGEHLP.MSG:788
 *
 * The port had neither (8 help topics against canon's 61), so the only way to
 * learn what an upgrade cost was to fly to Zygor and try it.
 *
 * They are built from PHASER_PRICE / SHIELD_PRICE and SHIP_CLASSES — the values
 * the shipyard actually charges — rather than copied out of HLPNEW2. That is
 * not fussiness: HLPNEW2 says a Mark-19 shield costs 250.0m while SHLDPR19 says
 * 200000000, and the option file wins. In-game help states design intent and is
 * never authoritative for a number. Transcribing would have put a known-wrong
 * price in the one place a player goes to check.
 */
import { HELP_TOPICS } from '../../src/game/commands/help/help-topics';
import { PHASER_PRICE, SHIELD_PRICE, FIRST_CPU_CLASS } from '../../src/game/commands/handlers/new-ship.handler';
import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';

const priceText = HELP_TOPICS.newprice.body.join('\n');
const classText = HELP_TOPICS.class.body.join('\n');

describe('hel newprice', () => {
  it('lists all 19 marks for both shields and phasers', () => {
    expect(SHIELD_PRICE).toHaveLength(19);
    expect(PHASER_PRICE).toHaveLength(19);
    for (let mark = 1; mark <= 19; mark++) {
      expect(priceText).toMatch(new RegExp(`^\\s*${mark}\\s`, 'm'));
    }
  });

  it('quotes the SHIPPED Mark-19 shield price, not the help file\'s', () => {
    // SHLDPR19 = 200000000. HLPNEW2 claims 250.0m and is wrong.
    expect(SHIELD_PRICE[18]).toBe(200_000_000n);
    expect(priceText).toContain('200.0m');
    expect(priceText).not.toContain('250.0m');
  });

  it('keeps the two columns distinct where canon does', () => {
    // Marks 5-14 differ between shields and phasers; if the table ever printed
    // one column twice this would pass silently without the check.
    expect(SHIELD_PRICE[4]).not.toEqual(PHASER_PRICE[4]);
    expect(priceText).toContain('250k');  // Mark-5 shield
    expect(priceText).toContain('220k');  // Mark-5 phaser
  });

  it('explains the trade-in, which is what makes the sticker price misleading', () => {
    expect(priceText.toLowerCase()).toContain('two thirds');
  });
});

describe('hel class', () => {
  it('lists every hull `new ship` will actually sell', () => {
    const sellable = SHIP_CLASSES.filter(
      (c) => c.category === 'PLAYER' && c.classNumber < FIRST_CPU_CLASS,
    );
    expect(sellable.length).toBeGreaterThan(0);
    for (const c of sellable) expect(classText).toContain(c.typeName);
  });

  it('does NOT list the Sysopian Death Star', () => {
    // Class 41 is category PLAYER and had already leaked into the purchase
    // list once before the cyb_class bound was added (GECMDS.C:4564).
    const deathStar = SHIP_CLASSES.find((c) => c.classNumber === 41);
    expect(deathStar?.category).toBe('PLAYER');
    expect(classText).not.toContain('Death Star');
  });

  it('shows the Interceptor at its canon price', () => {
    // CORRECTION 2026-09-06: price no longer follows the name. Canon's row puts
    // fourteen capability columns between them (GECMDS.C:411), so the old
    // `Interceptor\s+65k` pinned a layout canon does not have. Assert on the
    // ROW instead, which is what actually matters.
    const row = classText.split('\n').find((l) => l.includes('Interceptor'));
    expect(row).toBeDefined();
    expect(row).toContain('65k');
  });

  it('points at the other table rather than repeating it', () => {
    expect(classText.toUpperCase()).toContain('NEWPRICE');
  });
});
