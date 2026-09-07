import '@testing-library/jest-dom';
import { vi } from 'vitest';

/**
 * @testing-library/react's `waitFor` only flushes pending fake-timer callbacks
 * (via its `asyncWrapper`) when it detects a Jest-style global `jest` object
 * with fake timers installed — it has no idea Vitest's `vi.useFakeTimers()`
 * exists. Without this alias, any test that calls `waitFor` while
 * `vi.useFakeTimers()` is active hangs until the real (non-fake) test timeout,
 * because the wrapper's internal `setTimeout(..., 0)` never resolves. `vi`'s
 * API is a superset of Jest's timer API, so this alias is safe.
 */
if (typeof (globalThis as { jest?: unknown }).jest === 'undefined') {
  (globalThis as { jest?: unknown }).jest = vi;
}
