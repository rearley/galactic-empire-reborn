# Public web presence — landing, auth, stats

**Date:** 2026-09-07
**Status:** approved design, not yet implemented
**Scope:** public marketing site, email/password authentication, two-step
registration, public stats page, logout.

## Why

The game is about to be deployed to a public subdomain on a Plesk server. A
visitor arriving at the root currently gets a bare username/password box with
no explanation of what the game is. There is also no logout, and the only
credential is a display handle, which is unrecoverable if forgotten.

## Findings that shaped the design

Established by reading the codebase, not assumed:

1. **The userid/username split already exists.** `User.userid` is an opaque
   random key (`usr_<hex>`); `username` is a separate display handle with a
   case-insensitive unique index. Every foreign key — Ship, Mail, MailStat,
   planet ownership — points at `userid`. Adding email therefore touches no
   foreign key and is not an identity migration.
2. **24 of 33 `User` rows are Cybertrons** (`Cybrg-200`..`Cybrg-223`), sharing
   the table with humans and distinguished only by `passwordHash IS NULL`. Any
   public count or leaderboard must filter on `passwordHash IS NOT NULL` or it
   advertises AI as players.
3. **The frontend has no router.** `main.tsx` renders `<App/>`, which branches
   on the JWT to show `AuthScreen` or the terminal.
4. **The JWT already persists** in `localStorage` via `auth/tokenStore.ts`, so
   introducing routes does not change session behaviour.
5. **`x` is canon's exit, not a logout.** `GEMAIN.C:2859 mnu_fightsub` clears
   torpedo locks, saves, announces `EXIWAR2` to the sector and sets
   `GESTAT_AVAIL`, returning the player to the ship-select menu — canon's GE
   main menu. Logging off the BBS was a separate action at the outer menu. The
   port implemented the inner half only.
6. **`ros` and the midnight job rank separately.** `midnight/rank-roster.ts`
   assigns `rospos`; `ros.handler.ts` runs an independent Prisma query with
   canon's own predicate. The public board must share the latter, not the
   former. See the correction in section 5.

## 1. Routing

Add `react-router-dom` — the only new frontend dependency. `main.tsx` wraps
`<BrowserRouter>`.

| Route | Element |
|---|---|
| `/` | `Landing` |
| `/login` | `Login` |
| `/register` | `Register` — email + password |
| `/register/name` | `ChooseUsername` — authenticated |
| `/stats` | `Stats` |
| `/play` | `RequireAuth` → today's `App` |
| `*` | redirect to `/` |

`auth/AuthScreen.tsx` splits into `Login.tsx` and `Register.tsx`; its
mode-toggle state is replaced by links. `App.tsx` loses its `if (!token)`
branch.

`RequireAuth` reads `tokenStore`, redirects anonymous visitors to `/login`
preserving the intended destination, and redirects an authenticated user with
no username to `/register/name` from wherever they land — so abandoning signup
and returning later resumes rather than stranding the account.

### Deployment consequence

Deep links must fall through to `index.html`. nginx on Plesk needs
`try_files $uri $uri/ /index.html;` with `/auth`, `/public` and `/socket.io`
proxied to `:3000`. This implementation creates
`docs/DEPLOYMENT.md` (it does not exist today) holding a starting block, to be
adjusted against the real server on first deploy.

Vite's dev proxy gains `/public`.

## 2. Email as the credential

One migration, `add_user_email`:

- `email String?` — nullable, because the 24 Cybertron rows can never have one.
- `emailVerifiedAt DateTime?` — written by nothing, read by nothing. It exists
  so that adding verification later is a token table plus a flow, not another
  `User` migration.
- `username` becomes **nullable** (see §3).
- A partial, case-insensitive unique index, as raw SQL since Prisma's
  `@unique` can express neither `lower()` nor a `WHERE` clause:

  ```sql
  CREATE UNIQUE INDEX user_email_lower_key
    ON "User" (lower(email)) WHERE email IS NOT NULL;
  ```

`RegisterDto` becomes `{ email, password }`; `LoginDto` becomes
`{ email, password }`. The existing username regex and 8–72 character password
rule are unchanged.

With two unique constraints, a duplicate must say which one. Postgres returns
the index name in Prisma's `P2002.meta.target`, so `AuthService` branches on it
to return `EMAIL_TAKEN` or `USERNAME_TAKEN`. A single generic message would be
a poor registration experience.

The constant-time bcrypt path in `login` — always comparing against
`DUMMY_BCRYPT_HASH` when the user is absent or has a null hash — is preserved
exactly, now keyed on email.

### Existing accounts

The database is wiped when the game moves to Plesk, so no email backfill path
is built. The nine existing human rows are test accounts.

## 3. Two-step registration

`POST /auth/register` with `{ email, password }` creates the row with
`username = null` and returns a JWT. `POST /auth/username` — authenticated —
with `{ username }` sets it and returns a fresh token.

The row is created at step 1 rather than holding credentials client-side so
that "that email is taken" lands immediately, instead of after the player has
already invested in choosing a name.

**`WsAuthGuard` must reject a token whose payload has no username**, with code
`USERNAME_REQUIRED`. Without it a half-registered account could open a socket
and board a ship with a null display handle, and canon's `username()`
(`GEFUNCS.C:2596`) is called throughout combat and sector messaging. This gate
is what makes the nullable column safe and gets a direct test.

### Sweeping half-finished accounts

An account that completes step 1 and never step 2 holds its email address
forever. The midnight job therefore deletes any `User` with a non-null
`passwordHash`, a **null username**, and `createdAt` older than **10 days**.

All three conditions are load-bearing. `passwordHash IS NOT NULL` keeps the
sweep away from the 24 Cybertron rows, whose usernames are also atypical. The
null username is what marks the account as abandoned mid-signup: once step 2
completes the row can never match again, so a real player is unreachable by
this code regardless of age.

Such a row owns no ships, planets or mail — those are only created after the
player boards — so this is a plain delete with no cascade to reason about. The
threshold is a named constant, `ABANDONED_SIGNUP_DAYS = 10`, alongside the
existing `MAILDAYS`.

Per the project's midnight rule the sweep must be idempotent: running it twice
in one night deletes the same rows once and reports zero the second time.

## 4. Logout

Added as **site chrome, not a game command** — an option on the ship-select
screen, and in the header on `/` and `/stats`. It clears the token, disconnects
the socket, and routes to `/`.

**It is deliberately not reachable from inside the live terminal.** Logging out
disconnects the socket, which is `warhupa`; with `cantexit > 0` that destroys
the hull. The sequence is `x` first — which enforces `cantexit` itself and
answers `CANTEXT` when it cannot — then log out from the menu. This matches
canon's own two-level exit: out of Galactic Empire, then off the BBS.

## 5. Public stats API

New `PublicModule` exposing unauthenticated `GET /public/stats`:

```json
{ "commanders": 9, "online": 1,
  "roster": [{ "rank": 1, "username": "rick", "score": 15345,
               "kills": 31, "planets": 3 }] }
```

- `commanders` counts `passwordHash IS NOT NULL`, and the roster filters the
  same way. This gets an explicit regression test with Cybertron fixtures — it
  is the most likely thing to silently break.
- **CORRECTION (2026-09-07, before implementation).** An earlier draft of this
  section said the public board reuses `midnight/rank-roster.ts` so it could
  not disagree with the in-game `ros` command. That was wrong on both counts.
  `rankRoster` assigns `rospos` during the midnight job and is not what `ros`
  uses; `ros.handler.ts` runs its own Prisma query. The shared selection is
  therefore **extracted from `ros.handler.ts`** into a pure module both call —
  `game/player/roster-query.ts` — preserving canon's predicate and ordering
  exactly: `score > 0` (`GECMDS.C:4038`), AI excluded by the `Cybrg-`,
  `@Droid-` and `@` userid prefixes, ordered score desc, then kills desc, then
  userid ascending. `ros` is refactored onto it in the same task, with its
  existing tests unchanged as the proof the refactor is behaviour-preserving.
- Note that the roster predicate and the `commanders` count answer different
  questions and legitimately differ. The roster is canon's scoreboard, which
  omits anyone who has never scored. `commanders` is "how many people have
  signed up", so it counts `passwordHash IS NOT NULL` and includes the
  never-flown.
- `online` comes from a new `PresenceService`: a `Set<userid>` the gateway adds
  to in `handleConnection` and removes in `handleDisconnect`. Not the channel
  registry, which contains AI; not a raw socket count, which double-counts
  reconnects. A clean seam that tests without a socket.

The response is cached in memory for 15 seconds. That is the entire abuse story
for an unauthenticated public endpoint — polling is free regardless of volume.

## 6. Landing content

Full terminal aesthetic — monospace, amber on black, box-drawing rules —
reusing the Tailwind theme already in the app. Sections:

1. What the game is
2. History: 1988, Mike Murdock, MajorBBS, dial-up
3. The exact port target: release **3.2e, 1994-08-06**, the last one, per
   `GE/DOCS/GEREADME.DOC`
4. Faithful — roughly six curated items
5. Changed — roughly six curated items, leading with what a player actually
   feels: a 201x201 galaxy against canon's 601x601; colonists eating food when
   canon fed only troops; typed `f1`-style bindings because a browser cannot
   claim function keys
6. A short primer on typed commands
7. Enlist

Curated down from 119 entries in `docs/DECISIONS.md`. Copy is a draft for the
author to edit.

## 7. Testing

**Backend.** Duplicate email and duplicate username return distinct error
codes; login by email is case-insensitive; the constant-time path still runs
bcrypt for an unknown email; `POST /auth/username` rejects a duplicate and a
second call from an account that already has one; `WsAuthGuard` rejects a
username-less token; `/public/stats` excludes Cybertrons and password-less
rows; the cache serves a second call without re-querying. The midnight sweep
deletes an abandoned signup at 11 days, spares one at 9, spares a Cybertron of
any age, spares a completed account of any age, and is idempotent across two
runs.

**Frontend.** Landing renders; `RequireAuth` redirects an anonymous visit to
`/login`; an authenticated user without a username is redirected to
`/register/name`; register posts email and password; the username step posts
with the bearer token; stats renders a roster from a stubbed fetch; logout
clears the token and leaves `/play`.

## 8. Explicitly out of scope

- Email sending of any kind: no verification gate, no password reset. Adding
  sending later is anticipated (`emailVerifiedAt` exists for it) but is a
  separate piece of work.
- Stats page: no event ticker, team standings, or galaxy aggregates.
- SEO beyond a real `<title>` and description meta in `index.html`. The
  marketing copy ships as JavaScript and will not be crawlable — the accepted
  cost of putting the public pages in the existing SPA.
