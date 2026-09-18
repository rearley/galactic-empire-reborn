import React, { useEffect, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

type Category =
  | 'port-bug'
  | 'corrected-to-canon'
  | 'deliberate-deviation'
  | 'canon-was-wrong'
  | 'port-original';

interface ChangelogEntry {
  category: Category;
  text: string;
}
interface ChangelogRelease {
  version: string;
  date: string;
  entries: ChangelogEntry[];
}
interface Changelog {
  releases: ChangelogRelease[];
  categories: Record<Category, { title: string; blurb: string }>;
}

/**
 * The colour each kind of change is spoken in.
 *
 * Two of the four already have one: `/guide` renders a deliberate deviation in
 * yellow and "the original is wrong here" in sky, and a reader who has seen the
 * guide should not have to learn a second vocabulary here. The other two are
 * new, and deliberately quieter — an ordinary fix is the least interesting
 * thing on the page.
 */
const TONE: Record<Category, { border: string; wash: string; label: string }> = {
  'port-bug': { border: 'border-gray-700', wash: 'bg-gray-900/40', label: 'text-gray-400' },
  'corrected-to-canon': { border: 'border-emerald-700', wash: 'bg-emerald-950/20', label: 'text-emerald-400' },
  'deliberate-deviation': { border: 'border-yellow-700', wash: 'bg-yellow-950/20', label: 'text-yellow-500' },
  'canon-was-wrong': { border: 'border-sky-700', wash: 'bg-sky-950/20', label: 'text-sky-400' },
  'port-original': { border: 'border-violet-700', wash: 'bg-violet-950/20', label: 'text-violet-400' },
};

const ORDER: Category[] = [
  'port-bug',
  'corrected-to-canon',
  'deliberate-deviation',
  'canon-was-wrong',
  'port-original',
];

function useChangelog(): { data: Changelog | null; error: boolean } {
  const [data, setData] = useState<Changelog | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/public/changelog')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((c: Changelog) => { if (!cancelled) setData(c); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  return { data, error };
}

function Entry({ entry, title }: { entry: ChangelogEntry; title: string }): React.JSX.Element {
  const tone = TONE[entry.category] ?? TONE['port-bug'];
  return (
    <li className={`border-l-2 ${tone.border} ${tone.wash} py-2 pl-4`}>
      <span className={`mr-2 text-xs uppercase tracking-widest ${tone.label}`}>{title}</span>
      <span className="text-sm leading-relaxed text-gray-200">{entry.text}</span>
    </li>
  );
}

/**
 * /changelog — what changed, in the language of someone who plays the game.
 *
 * The four categories are the reason the page exists. A port of someone else's
 * game can change something for three quite different reasons — we broke it, we
 * had drifted from the original, or we chose to differ — and a fourth case
 * where the original's manual contradicts its own code. Running them together
 * as one list of "fixes" would either accuse Murdock of our mistakes or claim
 * his design as our improvement, which is exactly what the landing page
 * promises not to do.
 *
 * Entries start at public launch on 2026-09-18. Reconstructing player-facing
 * notes from two hundred pre-launch commits would be a guess presented as a
 * record, and nobody was playing yet to have noticed.
 */
export function Changelog(): React.JSX.Element {
  const { data, error } = useChangelog();

  return (
    <div className="min-h-screen bg-black font-mono text-gray-100">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl uppercase tracking-widest text-yellow-400">What changed</h1>
        <p className="mt-2 text-sm uppercase tracking-widest text-gray-500">
          The game is live and still being worked on
        </p>

        {error && (
          <p role="alert" className="mt-8 border-l-2 border-red-800 bg-red-950/20 py-2 pl-4 text-sm text-red-300">
            Could not load the changelog. The game itself is unaffected — try again shortly.
          </p>
        )}

        {data && (
          <>
            <dl data-testid="category-legend" className="mt-8 space-y-4">
              {ORDER.filter((c) => data.categories[c]).map((c) => (
                <div key={c} className={`border-l-2 ${TONE[c].border} pl-4`}>
                  <dt className={`text-xs uppercase tracking-widest ${TONE[c].label}`}>
                    {data.categories[c].title}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-gray-400">{data.categories[c].blurb}</dd>
                </div>
              ))}
            </dl>

            <hr className="my-10 border-gray-800" />

            {data.releases.map((release) => (
              <section key={release.version} className="mb-10">
                <div className="flex items-baseline gap-3">
                  <h2 data-testid="release-version" className="text-lg text-yellow-400">
                    v{release.version}
                  </h2>
                  <span className="text-xs uppercase tracking-widest text-gray-600">{release.date}</span>
                </div>
                <ul className="mt-4 space-y-3">
                  {release.entries.map((entry, i) => (
                    <Entry
                      key={`${release.version}-${i}`}
                      entry={entry}
                      title={data.categories[entry.category]?.title ?? entry.category}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
