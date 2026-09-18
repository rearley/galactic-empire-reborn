import React from 'react';
import { ConnectionIndicator } from './ConnectionIndicator';
import { BUILD_VERSION } from '../version';

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
 * @see onboarding/PreFlightScreen.tsx, App.tsx
 */
export function TitleBar({ status }: Props): React.JSX.Element {
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
      <ConnectionIndicator status={status} />
    </div>
  );
}
