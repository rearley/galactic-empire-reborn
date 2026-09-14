import React from 'react';
import { Link } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';
import { PORT_RELEASE, PORT_RELEASE_DATE, HOOKS, FAITHFUL, CHANGED } from '../content/port-notes';
import { supportUrl } from '../support';

function Rule(): React.JSX.Element {
  return <hr className="my-10 border-gray-800" />;
}

function Cmd({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <code className="text-yellow-400">{children}</code>;
}

/**
 * The "help pay for the server" block, or nothing when no link is configured.
 *
 * Deliberately a plain anchor and not a payment widget: an embedded script from
 * a processor would put a third party on the page that a stranger visits before
 * they have agreed to anything, for something that is functionally a hyperlink.
 */
function Support(): React.JSX.Element | null {
  const href = supportUrl();
  if (href === null) return null;
  return (
    <>
      <Rule />
      <section className="text-center">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block border border-gray-700 px-6 py-2 text-xs uppercase tracking-widest text-gray-400 hover:border-gray-500 hover:text-gray-200"
        >
          Support the server
        </a>
        <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-gray-600">
          This runs on a rented box that costs real money every month. Donations go to keeping it
          online — never an advantage in the game. Nothing here is for sale, and nothing ever will
          be: the game is Mike Murdock&apos;s, and it is free.
        </p>
      </section>
    </>
  );
}

export function Landing(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-black font-mono text-gray-100">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl uppercase tracking-widest text-yellow-400">Galactic Empire</h1>
        <p className="mt-2 text-sm uppercase tracking-widest text-gray-500">
          Mike Murdock&apos;s 1988 BBS classic, flying again
        </p>

        <p className="mt-8 text-base leading-relaxed text-gray-200">
          You get one ship, an empty sector, and a prompt. Everything else you take.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-gray-300">
          Type <Cmd>sca</Cmd> and the galaxy draws itself in ASCII. Type <Cmd>war 9</Cmd> and you are
          moving — really moving, across a map that keeps turning after you look away. Somewhere out
          there another commander is doing the same thing, and something that is not a commander at
          all has already decided you are worth the trouble.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-gray-300">
          Hunt. Trade. Take a planet and hold it. Talk your way onto a team, or don&apos;t, and find
          out what the neutral zone is for.
        </p>

        <p className="mt-8">
          <Link
            to="/register"
            className="inline-block border border-yellow-400 px-6 py-2 text-sm uppercase tracking-widest text-yellow-400 hover:bg-yellow-400 hover:text-black"
          >
            Enlist — it&apos;s free
          </Link>
        </p>

        <Rule />

        <section>
          <h2 className="text-sm uppercase tracking-widest text-gray-400">What you are getting into</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-gray-300">
            {HOOKS.map((item) => (
              <li key={item} className="border-l-2 border-gray-800 pl-4">{item}</li>
            ))}
          </ul>
        </section>

        <Rule />

        <section>
          <h2 className="text-sm uppercase tracking-widest text-gray-400">If you played this before</h2>
          <p className="mt-4 text-sm leading-relaxed text-gray-300">
            Then you already know what <Cmd>hel</Cmd> gets you, and you have opinions about
            Cybertrons. It is the same game — release {PORT_RELEASE}, {PORT_RELEASE_DATE}, the last
            one ever shipped — rebuilt from the original source rather than from memory.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-300">
            {FAITHFUL.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <Rule />

        <section>
          <h2 className="text-sm uppercase tracking-widest text-gray-400">What is different</h2>
          <p className="mt-4 text-sm leading-relaxed text-gray-400">
            Honestly, because you will notice:
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-300">
            {CHANGED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <Rule />

        <section>
          <h2 className="text-sm uppercase tracking-widest text-gray-400">You type everything</h2>
          <p className="mt-4 text-sm leading-relaxed text-gray-300">
            There is nothing to click. <Cmd>sca</Cmd> scans your sector. <Cmd>war 5</Cmd> orders
            warp five. <Cmd>pha 75</Cmd> fires phasers at three-quarter power. <Cmd>hel</Cmd> lists
            every command the game knows, and <Cmd>x</Cmd> gets you out — assuming nobody is
            currently shooting at you.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-gray-400">
            It takes about five minutes to learn and a long time to get good at, which was rather
            the point in 1988. The{' '}
            <Link to="/guide" className="text-yellow-400 hover:underline">player&apos;s guide</Link>{' '}
            has the original&apos;s own documentation for every command, and says where this port
            differs.
          </p>
        </section>

        <Rule />

        <p className="text-center">
          <Link
            to="/register"
            className="inline-block border border-yellow-400 px-8 py-3 uppercase tracking-widest text-yellow-400 hover:bg-yellow-400 hover:text-black"
          >
            Enlist
          </Link>
        </p>
        <p className="mt-4 text-center text-xs text-gray-600">
          Free, no client to install. Pick a commander name and you are flying.
        </p>
        <Support />

        <p className="mt-8 text-center text-xs text-gray-600">
          Galactic Empire was written by Mike Murdock, who released its source publicly. This port
          is free software and says{' '}
          <Link to="/provenance" className="text-gray-500 hover:text-gray-300 hover:underline">
            what it took from the original and what it did not
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
