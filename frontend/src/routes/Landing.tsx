import React from 'react';
import { Link } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';
import { PORT_RELEASE, PORT_RELEASE_DATE, FAITHFUL, CHANGED } from '../content/port-notes';

export function Landing(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-black font-mono text-gray-100">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl uppercase tracking-widest text-yellow-400">Galactic Empire</h1>
        <p className="mt-4 text-sm leading-relaxed text-gray-300">
          Galactic Empire is Mike Murdock&apos;s 1988 multiplayer space combat game, originally
          run on The Major BBS. Commanders fly starships through a persistent galaxy, rotating and
          accelerating in real time, trading at planets, and firing on each other and the machines
          that patrol the neutral zone.
        </p>
        <p className="mt-2 text-sm text-gray-400">
          This is a web port of release {PORT_RELEASE} ({PORT_RELEASE_DATE}), the last one ever
          shipped.
        </p>

        <hr className="my-8 border-gray-800" />

        <section>
          <h2 className="text-sm uppercase tracking-widest text-gray-400">Faithful to the original</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-300">
            {FAITHFUL.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <hr className="my-8 border-gray-800" />

        <section>
          <h2 className="text-sm uppercase tracking-widest text-gray-400">Where this port deviates</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-300">
            {CHANGED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <hr className="my-8 border-gray-800" />

        <section>
          <h2 className="text-sm uppercase tracking-widest text-gray-400">Command primer</h2>
          <p className="mt-3 text-sm text-gray-300">
            Everything happens by typing commands at a prompt. <code className="text-yellow-400">sca</code>{' '}
            scans your sector, <code className="text-yellow-400">war 5</code> orders warp 5,{' '}
            <code className="text-yellow-400">pha 75</code> fires phasers at 75 percent power, and{' '}
            <code className="text-yellow-400">hel</code> lists every command the game understands.
          </p>
        </section>

        <hr className="my-8 border-gray-800" />

        <p className="text-center">
          <Link
            to="/register"
            className="inline-block border border-yellow-400 px-6 py-2 uppercase tracking-widest text-yellow-400 hover:bg-yellow-400 hover:text-black"
          >
            Enlist
          </Link>
        </p>
      </main>
    </div>
  );
}
