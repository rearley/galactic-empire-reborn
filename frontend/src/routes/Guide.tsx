import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';

/**
 * The player's guide.
 *
 * Every word of the reference comes from the server, which generates it from
 * the SAME canon help the game serves to `hel`. Nothing here is a second,
 * hand-written description of the game — that is how a wiki ends up
 * contradicting the thing it documents. The only hand-written parts are the
 * primer below and the deviation notes, which canon cannot know.
 */

interface GuideEntry {
  slug: string;
  title: string;
  body: string[];
  deviation?: string;
}
interface GuideSection {
  title: string;
  blurb: string;
  entries: GuideEntry[];
}
interface Guide {
  sections: GuideSection[];
}

function useGuide(): { guide: Guide | null; error: boolean } {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/public/guide')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((g: Guide) => { if (!cancelled) setGuide(g); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  return { guide, error };
}

function Deviation({ text }: { text: string }): React.JSX.Element {
  return (
    <p className="mt-4 border-l-2 border-yellow-700 bg-yellow-950/20 py-2 pl-4 text-sm text-yellow-200">
      <span className="mr-2 uppercase tracking-widest text-yellow-500">Differs here</span>
      {text}
    </p>
  );
}

/** `/guide` — the primer, then an index into canon's own pages. */
export function Guide(): React.JSX.Element {
  const { guide, error } = useGuide();

  return (
    <div className="min-h-screen bg-black font-mono text-gray-100">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl uppercase tracking-widest text-yellow-400">Player&apos;s guide</h1>

        <p className="mt-6 text-sm leading-relaxed text-gray-300">
          You fly one ship. You type at it. Everything below is the original
          game&apos;s own documentation, served straight out of the running server —
          so it cannot drift from what actually happens when you press enter.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-gray-300">
          The short version: <Cmd>sca</Cmd> to see where you are, <Cmd>war 5</Cmd> to
          move, <Cmd>orb</Cmd> at a planet to trade, <Cmd>pha 75</Cmd> when something
          hostile is close. <Cmd>hel</Cmd> in game gives you all of this too, and{' '}
          <Cmd>x</Cmd> gets you out when nobody is shooting.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-gray-400">
          Where this port knowingly differs from the 1988 original, the page says so.
        </p>

        {error && (
          <p role="alert" className="mt-8 text-sm text-red-400">
            The guide is unavailable right now. Everything in it is also available
            in game by typing <Cmd>hel</Cmd>.
          </p>
        )}

        {guide?.sections.map((section) => (
          <section key={section.title} className="mt-10">
            <h2 className="text-sm uppercase tracking-widest text-gray-400">{section.title}</h2>
            <p className="mt-1 text-xs text-gray-600">{section.blurb}</p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {section.entries.map((e) => (
                <li key={e.slug}>
                  <Link to={`/guide/${e.slug}`} className="text-yellow-400 hover:underline">
                    {e.title}
                  </Link>
                  {e.deviation && <span className="ml-1 text-yellow-700" title="differs from the original">*</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}

/** `/guide/:slug` — one page of canon's help, rendered. */
export function GuidePage(): React.JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const { guide, error } = useGuide();

  const entry = guide?.sections.flatMap((s) => s.entries).find((e) => e.slug === slug);

  return (
    <div className="min-h-screen bg-black font-mono text-gray-100">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/guide" className="text-xs uppercase tracking-widest text-gray-500 hover:text-gray-300">
          &larr; Guide
        </Link>

        {error && (
          <p role="alert" className="mt-6 text-sm text-red-400">The guide is unavailable right now.</p>
        )}

        {guide && !entry && (
          <p className="mt-6 text-sm text-gray-400">
            No page called &ldquo;{slug}&rdquo;. Try the <Link to="/guide" className="text-yellow-400 hover:underline">index</Link>.
          </p>
        )}

        {entry && (
          <>
            <h1 className="mt-4 text-xl uppercase tracking-widest text-yellow-400">{entry.title}</h1>
            {entry.deviation && <Deviation text={entry.deviation} />}
            {/* pre: canon's help is column-aligned with spaces, which HTML collapses. */}
            <pre className="mt-6 overflow-x-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
              {entry.body.join('\n')}
            </pre>
          </>
        )}
      </main>
    </div>
  );
}

function Cmd({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <code className="text-yellow-400">{children}</code>;
}
