import { buildGuide, GUIDE_DEVIATIONS } from '../../src/public/guide';

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
});
