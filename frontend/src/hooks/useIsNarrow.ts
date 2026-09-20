import { useEffect, useState } from 'react';

/**
 * The width below which the terminal's three columns cannot all fit.
 *
 * 320px scan column + 192px roster = 512px of fixed width before the event log
 * gets anything, so anything under Tailwind's `md` is a screen where the log
 * loses. @see App.tsx
 */
export const NARROW_QUERY = '(max-width: 767px)';

/**
 * True on a screen too narrow for the three-column terminal.
 *
 * A media QUERY rather than Tailwind's responsive classes because the phone
 * layout is a different tree, not the same tree restyled: the command line
 * moves above the log and two panels become `<details>`. Responsive classes
 * would mean rendering both and hiding one, which doubles the scan panel's
 * subscriptions.
 *
 * An environment with no `matchMedia` reads as WIDE. That is the safe default:
 * the desktop layout on a phone is cramped, but the phone layout on a desktop
 * is wrong for every player we have.
 */
export function useIsNarrow(query: string = NARROW_QUERY): boolean {
  const [narrow, setNarrow] = useState(() => matches(query));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent): void => setNarrow(e.matches);
    // No synchronous read here: the initial state already did it during render,
    // and setting state in an effect only costs a second pass.
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return narrow;
}

function matches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}
