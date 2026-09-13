# Deployment

> **DEPLOYED 2026-09-08.** The stack is live at `https://<game-domain>`.
> What follows is what actually worked, including the four things that did not
> work first — see **Things that bit** at the end.
>
> **AMENDED 2026-09-08.** The original draft was written blind, from the
> codebase, before anyone had looked at the target server. It has now been
> checked against the real host over the <panel> MCP connection. The
> **Target environment** section below is observed fact; the rest is amended
> to match it. Nothing has been deployed yet — the steps are unrun.
>
> The blind draft assumed a generic nginx box running the repo's
> `docker-compose.yml` as written, with its bundled Postgres container and
> published ports. Three of those assumptions were wrong for this server, and
> each is noted where it applies.

## A note on the placeholders

**REDACTED 2026-09-13, before this repository was made public.** Host names,
domain names, database role names, point release numbers and the names of
unrelated applications sharing the server have been replaced with angle-bracket
placeholders. They are consistent throughout the file:

| Placeholder | Is |
|---|---|
| `<game-domain>` | the subdomain the game is served from |
| `<deploy-host>` | the server the stack runs on |
| `<other-domain>` | an unrelated application on the same host, referenced as a config example |
| `<dbuser>` | the Postgres role, which is also the database name |

The real values live in a private operations note, not here. Nothing else was
removed: every procedure, failure mode and verification command below is intact,
because those are the parts worth reading. Anyone deploying their own instance
substitutes their own values and the document works unchanged.

## Target environment — observed, not assumed

Checked against the real host on 2026-09-08. Exact versions and hostnames are
deliberately not recorded here — see the redaction note at the end of this file.

| | |
|---|---|
| Host | Ubuntu LTS, <panel> |
| Docker | Engine + Compose plugin, both current |
| Node on host | **none** — everything runs in containers |
| PostgreSQL | **16.x, native on the host**, already running |
| Subdomain | exists, docroot holds a placeholder `index.html` |
| Custom nginx | none yet — no `vhost_nginx.conf` for this domain |
| Database | **not created yet.** The host already carries databases for unrelated applications, so the name has to be specific to this one |

### Three corrections to the blind draft

**1. Do not run a Postgres container.** The host already runs PostgreSQL 16.
The repo's `docker-compose.yml` bundles a `postgres` service — that is for local
development. **The deployed compose file must not use it**, or the game will
come up against an empty throwaway database beside the real one.

**Reach it over host networking, not the Docker bridge.** `postgresql.conf` has
`listen_addresses = 'localhost,172.17.0.1'` and `pg_hba.conf` has
`host all all 172.17.0.0/16 md5`, which looks like a container on the default
bridge can connect to `172.17.0.1`. **It cannot** — tested 2026-09-08, the
connection TIMES OUT rather than being refused, so something upstream of
Postgres drops bridge-to-host traffic. That `pg_hba` line is effectively dead.

What works, and what every other app on this host already does, is
`network_mode: host` with `127.0.0.1`. Verified:

```bash
docker run --rm --network host -e PGPASSWORD=... postgres:16-alpine \
  psql -h 127.0.0.1 -U <dbuser> -d <dbuser> -At -c 'select current_database();'
# -> <dbuser>
```

**2. Follow the established app pattern on this host**, which is not what the
repo's compose file does. Every existing app looks like:

```yaml
# /opt/<app>/docker-compose.yml
services:
  <app>:
    image: ghcr.io/rearley/<app>:latest
    container_name: <app>
    restart: unless-stopped
    network_mode: host
    env_file: .env
```

Images are built elsewhere, pushed to `ghcr.io/rearley/*`, and pulled here.
**A `watchtower` container is running and will auto-pull new images**, so
pushing a new tag redeploys without touching the server — worth knowing before
pushing a half-finished image.

Secrets live in `/opt/<app>/.env`, never in the compose file — for the apps
that follow this pattern. **GE ended up not following it**; see "Where that
value actually lives" below.

**3. The frontend probably does not need a container.** <panel>'s nginx already
serves `<game-domain>` from its docroot. Building `frontend/dist` and
placing it there is simpler than running the repo's frontend container and
proxying to it — and it is what makes the `try_files` rule below apply, since
<panel>'s own nginx does the serving.

## nginx on this host

<panel> owns `nginx.conf` and regenerates it; custom rules go in
`vhost_nginx.conf`, which <panel> includes inside the server block. The existing
apps do exactly this — see
`/var/www/vhosts/system/<other-domain>/conf/vhost_nginx.conf` for a working
example on this server.

For `<game-domain>`, create
`/var/www/vhosts/system/<game-domain>/conf/vhost_nginx.conf`:

```nginx
# SPA deep links. Without this, /stats and /play 404 — <panel>'s nginx looks for
# files with those names and finds none. This is the single most likely thing
# to be wrong on a first deploy.
location / {
    try_files $uri $uri/ /index.html;
}

# The game socket. The Upgrade/Connection headers are not optional: without
# them Socket.io does not error, it silently falls back to HTTP long-polling.
# The game still "works" and feels wrong, which is a bad failure to debug.
location /socket.io/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
}

location ^~ /auth/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location ^~ /public/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Apply with `<panel> sbin nginx_control --reconfigure-domain <game-domain>`
(or <panel>'s "Apache & nginx Settings" panel), then `nginx -t` before reloading.

**Rate limiting note.** The app throttles `/auth/*` per caller. Behind a proxy
every request appears to come from the proxy unless `X-Forwarded-For` is
trusted, so all visitors would share one bucket. The header is set above;
confirm the app is configured to trust it before relying on the limit.

## Database — created and verified 2026-09-08

Role and database `<dbuser>` exist on the host's PostgreSQL 16, owned by
`<dbuser>`, and a container using host networking connects to them successfully.

```sql
CREATE ROLE <dbuser> LOGIN PASSWORD '...';
CREATE DATABASE <dbuser> OWNER <dbuser>;
```

The backend therefore wants:

```
DATABASE_URL=postgresql://<dbuser>:<password>@localhost:5432/<dbuser>?schema=public
```

**Where that value actually lives — read this before an incident, not during
one.** The section above says secrets belong in `/opt/<app>/.env`, which is the
pattern the other apps on this host follow. **GE does not follow it.** This
stack is managed by the <panel> Docker extension, which keeps its own compose
file under `/opt/<panel-path>/`, owned by root and mode 600; there is no `/opt/ge` and
no `.env`, and `DATABASE_URL` and `JWT_SECRET` are written inline in that
compose file.

An earlier version of this document named `/opt/ge/.env`, a path that has never
existed. **Do not trust a written path for this — including this one.** Ask the
container where its config lives:

```bash
docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' ge-backend
```

Note the compose **project** is `ge` and the **service** is `backend`, so
recreating it is `docker compose -f <that file> up -d --force-recreate backend`
— not `ge-backend`, which is only the container name.

### Rotating the database password

Done 2026-09-09; the procedure is recorded because the reason recurs. A role can
change its own password, so this needs no Postgres superuser and no `su -
postgres`: read the current URL out of `compose.yaml`, authenticate as
`<dbuser>`, `ALTER ROLE <dbuser> WITH PASSWORD '<new>'`, rewrite the same line in
`compose.yaml`, then force-recreate the `backend` service. Existing connections
survive `ALTER ROLE`, so the running container keeps serving until it is
recreated.

Generate the value with `openssl rand -hex 24`. Hex avoids the second failure
mode here: the password sits inside a URL, so `%`, `@`, `#`, `?` and `/` need
encoding, and an un-encoded `%` is what broke a `psql` invocation during the
2026-09-09 audit.

**Verify by proving the OLD password fails**, not by watching the new one
succeed. A container that never reconnected also looks healthy:

```bash
curl -s localhost:3100/health                    # {"status":"ok","database":"up"}
PGPASSWORD=<old> psql -h localhost -U <dbuser> -d <dbuser> -c 'select 1'   # must FAIL
```

Then delete any backup copy of the compose file, since it holds the old secret.

**A note on how this went wrong the first time.** A `<dbuser>` database already
existed — in **MySQL**, because that is what <panel> creates by default. This
application cannot run on it, and not marginally: `schema.prisma` declares
`provider = "postgresql"`, `User.options` and `User.fkeys` are native scalar
arrays (`Int[]`, `String[]`) which MySQL has no type for, email uniqueness is a
partial expression index (`UNIQUE (lower(email)) WHERE email IS NOT NULL`) which
MySQL cannot express, team lookup uses Prisma's Postgres-only
`mode: 'insensitive'`, and scores and cash are `BigInt`. The empty MySQL
database was removed. **Check which engine you are looking at before assuming a
database with the right name is the right database.**

The schema is applied with `npx prisma migrate deploy`, never `migrate dev`.

## The two processes

The game ships as two separate artifacts that a single nginx vhost stitches
together:

1. **Backend** — the NestJS application (`backend/`), compiled to
   `backend/dist/` and run with Node directly (`node dist/src/main.js`, or
   whatever process manager <panel> offers — pm2, systemd, or Passenger's Node
   support). It listens on **`:3000`** by default (`process.env.PORT ?? 3000`,
   `backend/src/main.ts:12`) and serves three things: the `/auth` REST
   endpoints, the unauthenticated `/public` REST endpoints, and the
   `/socket.io` real-time transport. It does **not** serve any static files.
2. **Frontend** — a static build (`frontend/dist/`, produced by
   `npm run build` inside `frontend/`) that nginx serves directly from disk.
   There is no frontend process to run or supervise; a stale `dist/` is a
   deploy-script bug, not a crashed service.

## nginx

Two things are easy to get wrong here, and both make the site look broken in
a way that is confusing to debug from the browser alone.

**1. Deep links need `try_files` falling through to `index.html`.** The
frontend is a single-page app with client-side routing
(`react-router-dom`, wired in `frontend/src/main.tsx`) — `/stats`,
`/login`, `/register`, `/register/name` and `/play` are not real files on
disk. Without a fallback, nginx 404s on any of them the moment a visitor
reloads, bookmarks, or is sent a direct link — only `/` ever works. `App.tsx`
and the router never even load in that case, so the failure looks like a
missing page rather than a routing config problem.

**2. The Socket.io proxy needs the `Upgrade`/`Connection` headers.** Without
them, nginx proxies `/socket.io/` as plain HTTP and Socket.io silently falls
back to long-polling — the game still appears to work (commands go through,
slowly) with no obvious error, which makes this the kind of bug that survives
a casual smoke test and only shows up as odd latency once someone is
actually playing.

A starting block:

```nginx
server {
    listen 443 ssl;
    server_name game.example.com;

    root /path/to/galactic-empire-reborn/frontend/dist;
    index index.html;

    # Frontend SPA — every unmatched path falls through to index.html so
    # client-side routes (react-router-dom) resolve on a hard reload/deep link.
    location / {
        try_files $uri $uri/ /index.html;
    }

    # REST API — auth (login/register/username) and the public stats endpoint.
    location ~ ^/(auth|public)/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket transport — Upgrade/Connection headers are required, or
    # Socket.io silently falls back to HTTP long-polling instead of erroring.
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
}
```

On <panel> specifically, this likely wants to go in the domain's "Additional
nginx directives" box (Websites & Domains → the domain → Apache & nginx
Settings) rather than a hand-edited vhost file, since <panel> regenerates its
own nginx config from its UI. Confirm the exact mechanism against the real
panel — this is one of the things this draft cannot know in advance.

During local development, Vite's dev server proxies `/auth`, `/public` and
`/socket.io` itself (see `frontend/vite.config.ts`); nginx only matters once
the built `dist/` is served for real.

## Required environment variables

Set for the backend process:

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | Set inline in the <panel> stack's `compose.yaml`, not an `.env` — see the database section. Read by `PrismaService`; production must NOT set `TEST_DATABASE_URL`, which is a separate variable that test runs bind to instead (`backend/src/prisma/database-url.ts`). |
| `JWT_SECRET` | Signs and verifies auth tokens | Required — both `auth/jwt.strategy.ts` and `auth/auth.module.ts` throw at boot if it is unset. Generate a real secret; do not reuse anything from `.env.example`. |
| `PORT` | Backend listen port | Defaults to `3000` if unset (`backend/src/main.ts:12`). |
| `MIDNIGHT_MAILDAYS` | Mail purge age, days | Integer 1–7, default 3 (canon `MAILDAYS`, clamp ceiling 7 per `GEMAIN.C:497`). |
| `MIDNIGHT_CHGLOSER` | PvP cash-penalty percent | Integer 0–100, default 100. |
| `MIDNIGHT_ADMIN_TOKEN` | Bearer token for the admin midnight-run endpoint | Optional, but the admin endpoint returns 503 (`ADMIN_TOKEN_NOT_CONFIGURED`) until it is set — decide deliberately whether that endpoint should be reachable at all in production. |

Do **not** set:

| Variable | Why not |
|---|---|
| `GE_DEBUG_ENDPOINTS` | **Must be unset in production.** `backend/src/main.ts` and `backend/src/debug/debug-endpoints.ts` gate a set of `/debug/*` controllers that act on a ship *by name* with no authentication of any kind — they can teleport a ship, swap its hull class, zero its damage, hand out ordnance, rewrite a captain's credit balance, or spawn droids. `debugEndpointsEnabled()` already refuses to turn them on when `NODE_ENV=production` regardless of this variable's value, so the code fails closed either way — but `NODE_ENV` is exactly the kind of thing a host can leave unset by accident, so treat "leave `GE_DEBUG_ENDPOINTS` unset" as the actual control, not the `NODE_ENV` check as a substitute for it. If it somehow is set and the endpoints mount, `main.ts` logs this at startup and it should be treated as a live incident, not a warning to shrug off: <br><br>`[Bootstrap] *** GE_DEBUG_ENDPOINTS is on: /debug/* cheat routes are mounted and UNAUTHENTICATED. ***`<br>`[Bootstrap] *** Do not expose this port. Unset GE_DEBUG_ENDPOINTS to remove them. ***` |

## Releasing a schema change

```bash
cd backend
npx prisma migrate deploy
```

**Never `npx prisma migrate dev` against the production database.** `migrate
dev` is an interactive, development-oriented command that can prompt to reset
the database when it detects drift; `migrate deploy` only applies pending
migrations from the committed `prisma/migrations/` history and never resets
anything. This matters more than usual here: the live world (ships, planets,
scores) is real player state, not fixture data, and per CLAUDE.md migrations
are committed, versioned artifacts that are never edited after creation.

## Release checklist (draft)

1. `cd backend && npm ci && npx prisma migrate deploy && npm run build`
2. `cd frontend && npm ci && npm run build`
3. Restart the backend process (whatever supervises `node dist/src/main.js`
   on this host — confirm and record here on first deploy).
4. Confirm nginx is serving the new `frontend/dist` and that `try_files` and
   the `/socket.io` Upgrade headers are in place (see above) — a deep link
   reload and a live command in a running game are the two smoke tests that
   catch the failure modes this file exists to prevent.
5. Confirm `GE_DEBUG_ENDPOINTS` is unset in the process environment.

## Open questions for the first real deploy

- Exact process manager and restart command <panel> expects for a Node app
  (pm2 / systemd unit / <panel>'s Node.js extension).
- Whether <panel>'s Node.js support proxies to the app itself, making the
  manual nginx block above partially redundant — reconcile once the panel is
  in front of us.
- TLS termination point and certificate renewal (Let's Encrypt via <panel> is
  the presumed default, unconfirmed).
- Log destination and rotation for the backend process.


## Things that bit, and why

Recorded because each cost a cycle and none was guessable from the codebase.

**1. Port 3000 was already taken.** An unrelated application on the host was
already bound to it. With `network_mode: host` the backend would have collided
silently. GE runs on **3100** instead. Check `ss -lnt` before choosing a port on
a shared host — host networking means every app shares one port space, and the
default in `main.ts` is exactly the port most likely to be occupied.

**2. `duplicate location "/"`.** <panel>'s generated `nginx.conf` already defines
`location /` (proxying to Apache on `:7081`), so a prefix `location /` in
`vhost_nginx.conf` makes the whole config fail to build — and it fails at
`httpdmng --reconfigure-domain`, which reports the error only in its own output,
while `nginx -t` still passes against the last good config. <panel>'s own Docker
extension solves this with **regex** locations (`location ~ ^/.*`), which are
evaluated before prefix matches and do not collide. Do the same.

**3. The frontend container crash-looped, 502ing every page.** Its nginx had
`proxy_pass http://backend:3000`, and nginx resolves upstream names while
PARSING config — then refuses to start when resolution fails. The backend is on
host networking, so no `backend` name exists on the frontend's bridge. Fixed by
resolving through a variable, which defers it to request time. A container that
will not boot serves 502 on every route, including the ones needing no backend.

**4. `docker-entrypoint.sh` polls `pg_isready` before migrating**, defaulting to
host `postgres` and user `ge` — compose-network names that do not exist here.
Without `PGHOST` and `PGUSER` in the environment the container waits forever,
healthy-looking and doing nothing. Both are set in the stack's compose file.

## Verifying a deploy

```bash
docker ps --filter name=ge- --format '{{.Names}} {{.Status}}'
docker logs ge-backend 2>&1 | grep GameConfig     # must name the tuning file
curl -s localhost:3100/health
curl -sk https://<game-domain>/public/stats
```

The `GameConfig` line is the one worth reading every time. It prints either the
tuning file it loaded and how many options it holds, or that it found none and
is running on canon defaults. The second case is not an error and will not fail
a health check — it is how a container once ran a 601x601 galaxy while everyone
believed it was 201x201.

## What was redacted, and why it did not cost anything

This file was written as an operations runbook for one server and then published
with the rest of the repository. Those two purposes pull in opposite directions:
a runbook wants to name exactly where things are, and a public document should
not hand a stranger a map of a machine.

The resolution was to keep every *procedure* and drop every *identifier*. What
came out:

- the host and domain names, and the name of an unrelated application that was
  cited as a working nginx example
- exact point releases of the operating system, Docker and PostgreSQL, which are
  a CVE shopping list and go stale the week they are patched
- the names of databases belonging to other applications on the host
- the literal path to the compose file holding `DATABASE_URL` and `JWT_SECRET`

That last one cost the least, because the document already said not to trust it.
The `docker inspect` recipe above finds the file on any host, was already the
recommended procedure, and had already been wrong once — it named `/opt/ge/.env`
for a day, a path that never existed. Deleting the literal path removes a
reconnaissance detail and makes the document more correct at the same time.

Ports were deliberately kept. `3100` is discoverable from the compose file and
the Dockerfile in this repository regardless, it is useless without knowing the
host, and it appears in enough verification commands that genericising it would
have made them uncopyable for no security gain.
