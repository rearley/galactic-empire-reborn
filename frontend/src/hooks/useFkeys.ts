import { useEffect, useState } from 'react';
import { socket } from '../socket/socketClient';

/**
 * Function-key bindings for the F KEY MAP panel. Sent on board and again
 * after every `fset`, so the panel is populated at login rather than only
 * once you change something. @see src/game/commands/fkeys.ts
 */
export function useFkeys(): string[] {
  const [fkeys, setFkeys] = useState<string[]>([]);

  useEffect(() => {
    const handleFkeys = (e: { fkeys: string[] }) => setFkeys(e.fkeys ?? []);
    socket.on('fkeys.snapshot', handleFkeys);
    return () => { socket.off('fkeys.snapshot', handleFkeys); };
  }, []);

  return fkeys;
}
