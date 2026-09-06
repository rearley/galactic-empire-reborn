import { useCallback, useRef } from 'react';

/**
 * A drop-free sink for command results.
 *
 * `useSocket` used to park each result in a single `useState` slot and let App
 * react to it. React 18 batches state updates, so two payloads arriving in the
 * same batch collapsed — the first was overwritten before any effect ran, and
 * its lines never reached the log. A one-slot mailbox cannot serve as a queue.
 *
 * Delivery happens synchronously in the socket callback, so it neither depends
 * on render scheduling nor competes with it. The handler is held in a ref so a
 * re-render cannot detach an in-flight subscription.
 *
 * @see test/message-loss.spec.tsx
 */
export function useCommandResultQueue<T>(onResult: (payload: T) => void): {
  push: (payload: T) => void;
} {
  const handler = useRef(onResult);
  handler.current = onResult;

  const push = useCallback((payload: T) => {
    handler.current(payload);
  }, []);

  return { push };
}
