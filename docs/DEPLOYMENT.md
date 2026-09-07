# Deployment

> **FIRST DRAFT.** This file was written from the codebase during Task 13 of
> the public-web-presence plan (2026-09-07), before the game had ever been
> deployed to the real Plesk server. Every path, port and process-manager
> detail below is a starting point, not a confirmed fact about that server.
> Correct it in place — do not treat it as settled — the first time it is
> actually deployed, and remove this notice once it has been verified against
> reality.

## The two processes

The game ships as two separate artifacts that a single nginx vhost stitches
together:

1. **Backend** — the NestJS application (`backend/`), compiled to
   `backend/dist/` and run with Node directly (`node dist/src/main.js`, or
   whatever process manager Plesk offers — pm2, systemd, or Passenger's Node
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

On Plesk specifically, this likely wants to go in the domain's "Additional
nginx directives" box (Websites & Domains → the domain → Apache & nginx
Settings) rather than a hand-edited vhost file, since Plesk regenerates its
own nginx config from its UI. Confirm the exact mechanism against the real
panel — this is one of the things this draft cannot know in advance.

During local development, Vite's dev server proxies `/auth`, `/public` and
`/socket.io` itself (see `frontend/vite.config.ts`); nginx only matters once
the built `dist/` is served for real.

## Required environment variables

Set for the backend process:

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | Read by `PrismaService`; production must NOT set `TEST_DATABASE_URL`, which is a separate variable that test runs bind to instead (`backend/src/prisma/database-url.ts`). |
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

- Exact process manager and restart command Plesk expects for a Node app
  (pm2 / systemd unit / Plesk's Node.js extension).
- Whether Plesk's Node.js support proxies to the app itself, making the
  manual nginx block above partially redundant — reconcile once the panel is
  in front of us.
- TLS termination point and certificate renewal (Let's Encrypt via Plesk is
  the presumed default, unconfirmed).
- Log destination and rotation for the backend process.
