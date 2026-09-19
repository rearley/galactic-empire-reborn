# Calculator Planet Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in player can pick one of their own colonies from a dropdown on `/calculators` and have its live figures fill the form; nothing is written back.

**Architecture:** A new JWT-guarded `GET /public/my-planets` returns the caller's owned planets from the in-memory `PlanetStateService` (the source of truth — Postgres lags by a flush), already shaped as `CalculatorInput`. A pure function does the filtering and shaping so it is testable without Nest. The page fetches the list only when a token exists, shows a dropdown labelled `name — sector (x,y)`, fills the form on pick, and offers "Reset to planet". The calculator POST stays unauthenticated and unchanged.

**Tech Stack:** NestJS 11 + `@nestjs/passport` `AuthGuard('jwt')`; React + Vite; Vitest (both sides).

**Spec:** Agreed in conversation 2026-09-19 — dropdown of the player's own planets by name/sector; read-only; only the owner's planets (not team); works unchanged when signed out.

## Global Constraints

- Only planets where `PlanetState.userid === jwt.sub`. Never accept a planet id from the client.
- Only fields the owner already sees in game: stock and rates (`adm`), cash and tax rate (`adm`), environment and resource (scan). No new information.
- Route must sit under `/public/` — nginx proxies only `/auth/`, `/admin/`, `/public/`, `/socket.io/` (`reports.controller.ts` comment).
- Response carries `Cache-Control: no-store` — it is one player's private data.
- `VERSION` minor bump (new page capability) + `changelog.ts` entry, category `port-original`.
- Do not push.

---

### Task 1: Backend — `ownedPlanetsFor` and `GET /public/my-planets`

**Files:**
- Create: `backend/src/public/my-planets.ts`
- Create: `backend/src/public/my-planets.controller.ts`
- Modify: `backend/src/public/public.module.ts` (import `PlanetModule`, register controller)
- Test: `backend/test/public/my-planets.spec.ts`

**Interfaces:**
- Produces: `interface MyPlanet { xsect: number; ysect: number; plnum: number; name: string; input: CalculatorInput }`
- Produces: `function ownedPlanetsFor(userid: string, planets: readonly PlanetState[]): MyPlanet[]` — sorted by name (case-insensitive), then xsect, ysect, plnum.
- Produces: `GET /public/my-planets` → `MyPlanet[]`, 401 without a valid JWT.

- [ ] Step 1: failing tests — only the caller's planets; sort order; `input` carries `stock[i] = Number(items[i].qty)`, `rates[i] = items[i].rate`, `enviorn`, `resource`, `taxrate`, `planetCash = Number(cash)`; empty list for a player with none; controller reads `req.user.sub` and calls `PlanetStateService.all()`.
- [ ] Step 2: run, confirm failures.
- [ ] Step 3: implement the pure function and the controller (`@Controller('public') @UseGuards(AuthGuard('jwt'))`, `@Get('my-planets') @Header('Cache-Control','no-store')`).
- [ ] Step 4: run, confirm pass; `npx tsc --noEmit`.

### Task 2: Frontend — dropdown on `/calculators`

**Files:**
- Modify: `frontend/src/routes/Calculators.tsx`
- Test: `frontend/test/routes/calculators.spec.tsx`

**Interfaces:**
- Consumes: `GET /public/my-planets` (Task 1), `getToken()` from `frontend/src/auth/tokenStore.ts`.

- [ ] Step 1: failing tests —
  - signed out: no `/public/my-planets` request, no dropdown, copy still says the page cannot see your colonies unless you sign in;
  - signed in with planets: dropdown lists `Zygor II — sector (3,-5)`; picking one POSTs that planet's stock/rates/taxrate;
  - "Reset to planet" restores the picked planet's figures after an edit;
  - signed in with none: shows "You don't own any planets yet.";
  - endpoint 401/failure: page behaves as signed out (no error banner).
- [ ] Step 2: run, confirm failures.
- [ ] Step 3: implement — `planets` state (`MyPlanet[] | null`), effect gated on `getToken()`, `applyPlanet(p)` sets all six form states, `<select>` + reset button in the "Your colony" header, copy updated.
- [ ] Step 4: run, confirm pass.

### Task 3: Release bookkeeping

- [ ] `VERSION` 0.24.4 → 0.25.0; `changelog.ts` entry (`port-original`).
- [ ] `docs/DECISIONS.md` entry: the calculator may read the signed-in player's own colonies; why that is not the leak the page's "starts EMPTY" comment guards against.
- [ ] `docs/PROGRESS.md` entry + index line.
- [ ] Full backend and frontend suites; commit to master; do not push.
