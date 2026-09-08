import { buildGuide, GUIDE_DEVIATIONS, GUIDE_CORRECTIONS } from '../../src/public/guide';

/**
 * The player's guide is generated from the SAME canon help the game serves to
 * `hel`, not written separately. Two hand-maintained descriptions of one game
 * is how a wiki ends up contradicting the thing it documents — and this port
 * already deviates from canon in declared ways, so a guide copied from the
 * community wiki would be wrong about the galaxy's size on the first page.
 */
describe('buildGuide', () => {
  const guide = buildGuide();

  it('is assembled from canon help rather than hand-written prose', () => {
    const all = guide.sections.flatMap((s) => s.entries);
    expect(all.length).toBeGreaterThan(30);
    all.forEach((e) => expect(e.body.length).toBeGreaterThan(0));
  });

  it('gives every entry a URL-safe slug, unique across the whole guide', () => {
    const slugs = guide.sections.flatMap((s) => s.entries).map((e) => e.slug);
    slugs.forEach((s) => expect(s).toMatch(/^[a-z0-9-]+$/));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('starts a new player somewhere sensible', () => {
    expect(guide.sections[0].entries[0].slug).toBe('getting-started');
  });

  it('carries the command pages, so `pha` is findable without playing', () => {
    const slugs = guide.sections.flatMap((s) => s.entries).map((e) => e.slug);
    expect(slugs).toContain('pha');
    expect(slugs).toContain('sca');
    expect(slugs).toContain('set');
  });

  it('marks where this port differs, on the page it matters', () => {
    // The landing page promises honesty about deviations. A guide that quietly
    // repeats canon's 601x601 would break that promise on its first screen.
    const all = guide.sections.flatMap((s) => s.entries);
    const flagged = all.filter((e) => e.deviation);
    expect(flagged.length).toBeGreaterThan(0);
    flagged.forEach((e) => expect(e.deviation).toMatch(/\S/));
  });

  it('every declared deviation attaches to a slug that exists', () => {
    // A note on a page nobody can reach is a note nobody reads.
    const slugs = new Set(guide.sections.flatMap((s) => s.entries).map((e) => e.slug));
    Object.keys(GUIDE_DEVIATIONS).forEach((slug) => expect(slugs.has(slug)).toBe(true));
  });

  it('strips canon\'s "***" separator rows, which mean nothing on a web page', () => {
    const all = guide.sections.flatMap((s) => s.entries);
    all.forEach((e) => expect(e.body).not.toContain('***'));
  });

  it('corrects canon where its own help contradicts its own code', () => {
    // Reported from play. HLPPLANT says "Anything you transfer to the planet
    // belongs to them, you cannot transfer it back" — but HLPTRA documents
    // `transfer up`, and GECMDS.C:3354 trans_up implements it, gated on
    // "you must own this planet or NOBODY must own it". Canon's help
    // contradicts canon's code, and the code wins.
    //
    // This is NOT a deviation: we match the code. So it is a separate note
    // type, or the page would claim we changed something we did not.
    const all = buildGuide().sections.flatMap((s) => s.entries);
    const planets = all.find((e) => e.slug === 'planets');
    expect(planets?.correction).toMatch(/transfer up/i);
  });

  it('keeps the two note types saying different things', () => {
    // They mean different things — "we changed this" vs "the original was wrong
    // about itself" — and conflating them would either accuse the original of a
    // change we made or claim credit for behaviour that was always canon.
    //
    // But a page can carry BOTH, and `planets` does: colonists eating is our
    // deviation, and the transfer-up claim is canon contradicting itself. An
    // earlier version of this test asserted the maps were disjoint, which was
    // simply wrong about the game.
    expect(Object.keys(GUIDE_CORRECTIONS).length).toBeGreaterThan(0);
    const texts = [...Object.values(GUIDE_DEVIATIONS), ...Object.values(GUIDE_CORRECTIONS)];
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('renders both notes on a page that has both', () => {
    const planets = buildGuide().sections.flatMap((s) => s.entries).find((e) => e.slug === 'planets');
    expect(planets?.deviation).toMatch(/colonists eat/i);
    expect(planets?.correction).toMatch(/transfer up/i);
  });

  it('every correction attaches to a slug that exists', () => {
    const slugs = new Set(buildGuide().sections.flatMap((s) => s.entries).map((e) => e.slug));
    Object.keys(GUIDE_CORRECTIONS).forEach((slug) => expect(slugs.has(slug)).toBe(true));
  });
});
