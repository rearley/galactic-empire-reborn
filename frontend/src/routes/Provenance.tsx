import React from 'react';
import { Link } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import {
  PORT_RELEASE,
  PORT_RELEASE_DATE,
  ORIGINAL_AUTHOR,
  ORIGINAL_YEARS,
  AUTHORS_NOTE,
  PORTED,
  NOT_PORTED,
  LICENCE_NAME,
  LICENCE_NOTES,
  NOT_AFFILIATED,
  SOURCE_URL,
  SOURCE_NOTE,
} from '../content/provenance-notes';

function Rule(): React.JSX.Element {
  return <hr className="my-10 border-gray-800" />;
}

function Entries({ items }: { items: readonly { what: string; detail: string }[] }): React.JSX.Element {
  return (
    <dl className="mt-4 space-y-5">
      {items.map((item) => (
        <div key={item.what} className="border-l-2 border-gray-800 pl-4">
          <dt className="text-sm text-yellow-400">{item.what}</dt>
          <dd className="mt-1 text-sm leading-relaxed text-gray-300">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * /provenance — where the game came from, and who is owed credit for what.
 *
 * Written after someone told us this port owed credit to a different project
 * under a licence the original never carried. The correction is cheap to make
 * once and expensive to keep making in private, so it lives on a page.
 */
export function Provenance(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-black font-mono text-gray-100">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl uppercase tracking-widest text-yellow-400">Where this came from</h1>
        <p className="mt-2 text-sm uppercase tracking-widest text-gray-500">
          Credit, licensing, and what was and was not ported
        </p>

        <section className="mt-8">
          <p className="text-base leading-relaxed text-gray-200">
            Galactic Empire was written by {ORIGINAL_AUTHOR} and sold as a commercial module for The
            Major BBS. This is a port of release {PORT_RELEASE}, dated {PORT_RELEASE_DATE}, the last
            one ever shipped.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-gray-300">
            Years later he released the source publicly, and wrote this into the header of every
            file:
          </p>
          <blockquote className="mt-4 border-l-2 border-yellow-400 pl-4 text-sm italic leading-relaxed text-gray-300">
            {AUTHORS_NOTE}
          </blockquote>
          <p className="mt-4 text-sm leading-relaxed text-gray-400">
            That is what this is. The copyright on the original work is his, {ORIGINAL_YEARS}.
          </p>
        </section>

        <Rule />

        <section>
          <h2 className="text-sm uppercase tracking-widest text-gray-400">What came from the original</h2>
          <Entries items={PORTED} />
        </section>

        <Rule />

        <section>
          <h2 className="text-sm uppercase tracking-widest text-gray-400">What did not</h2>
          <Entries items={NOT_PORTED} />
        </section>

        <Rule />

        <section>
          <h2 className="text-sm uppercase tracking-widest text-gray-400">Licence</h2>
          <p className="mt-4 text-sm leading-relaxed text-gray-200">
            This port is released under the {LICENCE_NAME}.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-300">
            {LICENCE_NOTES.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-gray-200">
            <a
              href={SOURCE_URL}
              className="text-yellow-400 hover:underline"
              rel="noreferrer"
              target="_blank"
            >
              Read or download the complete source
            </a>
            . {SOURCE_NOTE}
          </p>
        </section>

        <Rule />

        <section>
          <h2 className="text-sm uppercase tracking-widest text-gray-400">Not affiliated</h2>
          <p className="mt-4 text-sm leading-relaxed text-gray-400">{NOT_AFFILIATED}</p>
        </section>

        <Rule />

        <p className="text-sm leading-relaxed text-gray-400">
          The{' '}
          <Link to="/guide" className="text-yellow-400 hover:underline">player&apos;s guide</Link>{' '}
          carries the original&apos;s own documentation for every command, and marks each place this
          port deliberately differs from it.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
