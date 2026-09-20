/**
 * Types for `deploy-warn.mjs`.
 *
 * The script stays plain JavaScript on purpose — watchtower runs it with bare
 * `node` inside the container, so it must not need a build step. This file is
 * what lets its spec be type-checked anyway; `npx tsc --noEmit` covers the
 * test suite, and an untyped import made every call site `any`.
 */

export interface WarnResponse {
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
}

export interface WarnRequestInit {
  method: string;
  headers: Record<string, string>;
  body: string;
}

export interface WarnDeps {
  fetchImpl?: (url: string, init: WarnRequestInit) => Promise<WarnResponse>;
  sleep?: (ms: number) => Promise<void>;
  env?: Record<string, string | undefined>;
}

/** Announces the imminent restart, then holds for the countdown. Never throws. */
export function warn(deps?: WarnDeps): Promise<void>;
