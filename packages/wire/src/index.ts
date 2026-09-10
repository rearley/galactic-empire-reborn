/**
 * The Socket.io contract between the NestJS backend and the React frontend.
 *
 * One declaration, two consumers. Before this package existed the contract was
 * declared twice — in `frontend/src/types/contracts.ts` and in
 * `specs/003-ship-commands/contracts/shared-types.ts` — and kept identical by a
 * test, while the backend imported neither and wrote every payload as an inline
 * object literal. So it was enforced between two consumers and unenforced
 * against the producer.
 *
 * @see docs/superpowers/specs/2026-09-10-restructure-design.md
 */

/**
 * Probe symbol proving the package resolves from both a CommonJS and an ESM
 * consumer. Asserted by a spec in each app. Not a semantic version of the
 * contract and not read by any runtime code — if the contract ever needs real
 * versioning, that is a deliberate design change, not a bump of this string.
 */
export const WIRE_CONTRACT_VERSION = '1';
