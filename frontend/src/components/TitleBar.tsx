import React from 'react';
import { ConnectionIndicator } from './ConnectionIndicator';
import { BUILD_VERSION } from '../version';
import { useSysop } from '../auth/useSysop';

interface Props {
  status: React.ComponentProps<typeof ConnectionIndicator>['status'];
}

/**
 * The one strip that belongs to the SESSION rather than the game: who this is,
 * which build you are looking at, and whether the socket is up.
 *
 * Extracted when ship entry became its own screen. Both it and the terminal
 * need this bar and neither needs the other's chrome, so it is defined once
 * rather than transcribed into the second caller — which is how the two would
 * drift, and the build identity is the one thing that must not.
 *
 * It also carries the sysop's Reports link, because this is the only chrome the
 * GAME has: the site header is public-pages only, and logging in goes straight
 * to `/play`. Without it a sysop landed in the ship selector with no way to
 * their reports except editing the URL.
 *
 * @see onboarding/PreFlightScreen.tsx, App.tsx
 */
export function TitleBar({ status }: Props): React.JSX.Element {
  // The sysop's way OUT of the game. On screen both in flight and on the
  // ship-select screen, which is already a "what do you want to do" moment.
  // @see auth/useSysop.ts — cosmetic; /admin/reports is what refuses.
  const { sysop } = useSysop();

  return (
    <div className="flex items-center justify-between border-b border-gray-800 px-3 py-1">
      <span className="text-xs text-gray-500 uppercase tracking-widest">
        Galactic Empire
        {/* Build identity. Deploys are hands-off, so this is the only way to
            tell whether what you are looking at is the change you pushed.
            @see src/version.ts */}
        <span className="ml-2 normal-case tracking-normal text-gray-700" title="build">
          {BUILD_VERSION}
        </span>
      </span>
      <div className="flex items-center gap-4">
        {sysop && (
          // A plain anchor, not a router Link: `App` is rendered without a
          // Router ancestor by a dozen terminal specs, and a Link throws
          // outside Router context. A full page load is honest here anyway —
          // you are leaving the game, and the socket closes behind you.
          <a href="/reports" className="text-xs uppercase tracking-widest text-gray-500 hover:text-gray-300">
            Reports
          </a>
        )}
        <ConnectionIndicator status={status} />
      </div>
    </div>
  );
}
