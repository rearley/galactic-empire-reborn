# Public Web Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Galactic Empire Reborn a public front door — a landing page, email/password sign-up split across two steps, a live stats page, and a logout — so a visitor arriving at the domain root learns what the game is instead of meeting a bare password box.

**Architecture:** The existing Vite SPA gains `react-router-dom` and grows public routes alongside the game, which moves to `/play` behind a guard. Authentication switches from display-handle to email; `username` becomes nullable and is chosen in a second step, with `WsAuthGuard` refusing any token that lacks one. A new unauthenticated `PublicModule` serves cached counts and a scoreboard whose selection is extracted from the existing `ros` command so the two can never diverge.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest (backend); React 18, Vite, Tailwind, Vitest + React Testing Library (frontend). One new dependency: `react-router-dom`.

**Spec:** `docs/superpowers/specs/2026-09-07-public-web-presence-design.md`

## Global Constraints

- **Canon precedence:** C source (`reference/ge-source/`) → `.MSG` in `GE/REL/` → wiki. Never `GE/MSG/`, never `GE/REL2/`. `/reference/` is READ ONLY; read `reference/CLAUDE.md` before reading under it.
- **If a test encodes a deviation from canon, the test is wrong.** Fix the test.
- **TDD is non-negotiable.** Write the failing test, run it, read the red, then implement.
- **Never `prisma db push`.** Always `npx prisma migrate dev --name <name>`. Migrations are committed artifacts.
- **Commit directly to `master`.** No feature branches.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz`
- **TypeScript strict mode.** No `any`, no implicit types.
- **Deploy discipline:** the backend is a live game with a player in it. Do not restart the backend or edit frontend files (Vite HMR reloads the player's browser) without confirming the player is parked. A client-side disconnect with `cantexit > 0` destroys their ship.
- **Existing human accounts:** 9 rows. **Cybertrons:** 24 rows (`Cybrg-200`..`Cybrg-223`), `passwordHash IS NULL`. Any public count or board must exclude them.
- **Canon roster predicate** (`GECMDS.C:4038`, `GECMDS.C:4020-4045`): `score > 0`; exclude userids starting `Cybrg-`, `@Droid-`, `@`; order score desc, kills desc, userid asc; cap `MAXLIST` (10) or 200 for `ros all`.
- **Port target for all landing copy:** release **3.2e, 1994-08-06** (`GE/DOCS/GEREADME.DOC`).
- **`ABANDONED_SIGNUP_DAYS = 10`.**

---

## File Structure

**Backend — created**

| File | Responsibility |
|---|---|
| `src/game/player/roster-query.ts` | Pure: canon's roster `where` clause + `orderBy`. One export, no Prisma client. |
| `src/public/public.module.ts` | Wires the stats controller and service. |
| `src/public/stats.controller.ts` | `GET /public/stats`. HTTP shape only. |
| `src/public/stats.service.ts` | Queries + 15s cache. |
| `src/public/presence.service.ts` | `Set<userid>` of connected players. |
| `src/auth/dto/choose-username.dto.ts` | Validation for step 2. |

**Backend — modified**

| File | Change |
|---|---|
| `prisma/schema.prisma` | `email`, `emailVerifiedAt`, `username` nullable. |
| `src/auth/auth.service.ts` | Register on email; `chooseUsername`; P2002 branch. |
| `src/auth/dto/register.dto.ts`, `login.dto.ts` | Email replaces username. |
| `src/auth/auth.controller.ts` | `POST /auth/username`. |
| `src/auth/ws-auth.guard.ts` | Reject username-less tokens. |
| `src/gateway/game.gateway.ts` | Presence add/remove. |
| `src/game/commands/handlers/ros.handler.ts` | Consume `roster-query.ts`. |
| `src/game/midnight/midnight.repository.ts`, `.service.ts`, `.constants.ts` | Phase 5 sweep. |
| `src/app.module.ts` | Import `PublicModule`. |

**Frontend — created:** `src/routes/{Landing,Login,Register,ChooseUsername,Stats}.tsx`, `src/routes/RequireAuth.tsx`, `src/routes/SiteHeader.tsx`, `src/auth/logout.ts`, `src/content/port-notes.ts`.
**Frontend — modified:** `src/main.tsx` (router), `src/App.tsx` (drop auth branch), `src/onboarding/ShipSelectPrompt.tsx` (logout), `vite.config.ts` (`/public` proxy). **Deleted:** `src/auth/AuthScreen.tsx`.

**Docs:** `docs/DEPLOYMENT.md` (new), plus `DECISIONS.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `DATA_MODEL.md` at the end.

**Ordering constraint:** Task 1 (migration) must land before Tasks 2–4. Task 5 (`WsAuthGuard`) must land before any account can be created without a username — do not deploy Tasks 2–4 to the live server without 5.

---

### Task 1: Schema — email, nullable username

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `User`)
- Create: `backend/prisma/migrations/<timestamp>_add_user_email/migration.sql`
- Test: `backend/test/unit/user-email-schema.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `User.email: string | null`, `User.emailVerifiedAt: Date | null`, `User.username: string | null`. Unique index `user_email_lower_key`. Existing index `user_username_lower_key` (confirm its real name in step 3).

- [ ] **Step 1: Write the failing test**

`backend/test/unit/user-email-schema.spec.ts`:

```ts
/**
 * The email column is nullable at the DB level because the 24 Cybertron rows
 * can never have one, and uniqueness is therefore partial and case-insensitive.
 * Prisma's `@unique` can express neither `lower()` nor `WHERE`, so the index is
 * raw SQL in the migration — and a raw index is exactly the kind of thing that
 * silently fails to ship. This reads the migration file back.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '../../prisma/migrations');

function migrationSql(nameFragment: string): string {
  const dir = readdirSync(MIGRATIONS).find((d) => d.includes(nameFragment));
  if (!dir) throw new Error(`no migration matching "${nameFragment}"`);
  return readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8');
}

describe('add_user_email migration', () => {
  const sql = migrationSql('add_user_email');
  // The raw index ships as its own migration — editing an applied one would
  // force a reset, and there is a live playtest in this database.
  const indexSql = migrationSql('user_email_lower_index');

  it('creates a partial, case-insensitive unique index on email', () => {
    const normalised = indexSql.replace(/\s+/g, ' ').toLowerCase();
    expect(normalised).toContain('create unique index');
    expect(normalised).toContain('user_email_lower_key');
    expect(normalised).toContain('lower(email)');
    expect(normalised).toContain('where email is not null');
  });

  it('makes username nullable rather than dropping it', () => {
    const normalised = sql.replace(/\s+/g, ' ').toLowerCase();
    expect(normalised).toContain('alter column "username" drop not null');
    expect(normalised).not.toContain('drop column "username"');
  });
});

describe('schema.prisma', () => {
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const userModel = /model User \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? '';

  it('declares email and emailVerifiedAt as optional', () => {
    expect(userModel).toMatch(/email\s+String\?/);
    expect(userModel).toMatch(/emailVerifiedAt\s+DateTime\?/);
  });

  it('declares username as optional', () => {
    expect(userModel).toMatch(/username\s+String\?/);
  });
});
```

- [ ] **Step 2: Run it and read the red**

```bash
cd backend && npx jest test/unit/user-email-schema.spec.ts
```

Expected: FAIL — `no migration matching "add_user_email"`.

- [ ] **Step 3: Find the existing username index name**

```bash
cd backend && grep -rn "username" prisma/migrations/*/migration.sql | grep -i "index\|unique"
```

Write the real name down; the next step's `email` index must follow the same naming convention, and Task 3 branches on both names.

- [ ] **Step 4: Edit the schema**

In `backend/prisma/schema.prisma`, model `User`:

```prisma
  /// Display handle chosen in step 2 of registration; case-insensitive unique
  /// (lower index in migration). NULL means signup was abandoned after step 1 —
  /// WsAuthGuard refuses such a token, and midnight sweeps the row at 10 days.
  username      String?
  /// Login credential. Nullable because the Cybertron rows in this table can
  /// never have one; uniqueness is a partial lower() index, not @unique.
  email         String?
  /// Reserved for a future verification flow. Written by nothing today.
  emailVerifiedAt DateTime?
```

- [ ] **Step 5: Generate the migration**

```bash
cd backend && npx prisma migrate dev --name add_user_email
```

That migration holds only the column changes. **Do not edit it** — Prisma has
already recorded its checksum, and editing an applied migration forces a
`migrate reset`, which would delete every ship, planet and score in the
database. There is a live playtest in there.

Instead add the raw index as its own migration:

```bash
cd backend && mkdir -p "prisma/migrations/$(date +%Y%m%d%H%M%S)_user_email_lower_index"
```

Write `migration.sql` inside it:

```sql
-- Prisma's @unique can express neither lower() nor a WHERE clause, so the index
-- that actually enforces "one account per email address, case-insensitively" is
-- written by hand. Partial because the 24 Cybertron rows have no email.
--
-- Its own migration rather than an edit to the generated one: that file is
-- already applied and checksummed, and editing it would force a migrate reset.
CREATE UNIQUE INDEX "user_email_lower_key"
  ON "User" (lower(email)) WHERE email IS NOT NULL;
```

Apply it:

```bash
cd backend && npx prisma migrate dev
```

Expected: `The following migration(s) have been applied` naming only the new
directory. If Prisma instead offers to reset, **stop and say so** — something
edited an applied migration, and answering yes destroys the playtest.

- [ ] **Step 6: Run the test — expect green**

```bash
cd backend && npx jest test/unit/user-email-schema.spec.ts
```

- [ ] **Step 7: Confirm the index exists in the database**

```bash
cd backend && set -a && . ./.env && set +a && \
  psql "$DATABASE_URL" -c '\d "User"' | grep -i email
```

Expected: a line naming `user_email_lower_key` as UNIQUE.

- [ ] **Step 8: Full suite — the nullable username will break callers**

```bash
cd backend && npx tsc --noEmit && npx jest
```

`username` is now `string | null`. Every compile error is a real site that assumed non-null. Fix each with `?? userid` — which is already the established idiom, see `ros.handler.ts:81` and `game.gateway.ts:672`. Do not use `!`.

- [ ] **Step 9: Commit**

```bash
git add backend/prisma backend/test/unit/user-email-schema.spec.ts backend/src
git commit -m "$(cat <<'EOF'
feat(auth): User gains email; username becomes nullable

Email is the login credential from here. The column is nullable because
the 24 Cybertron rows in this table can never have one, so uniqueness is
a partial index — and case-insensitive, so Prisma's @unique could express
neither half. It is raw SQL, and a test reads the migration file back
because a hand-written index is exactly what silently fails to ship.

username goes nullable to make room for two-step registration. Callers
that assumed non-null now fall back to userid, the idiom already used by
ros and the gateway.

emailVerifiedAt is written by nothing. It exists so that adding
verification later is a token table and a flow, not another User
migration.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz
EOF
)"
```

---

### Task 2: Register and log in by email

**Files:**
- Modify: `backend/src/auth/dto/register.dto.ts`, `backend/src/auth/dto/login.dto.ts`, `backend/src/auth/auth.service.ts`
- Test: `backend/test/auth/email-auth.spec.ts`

**Interfaces:**
- Consumes: Task 1's schema.
- Produces:
  - `RegisterDto { email: string; password: string }`
  - `LoginDto { email: string; password: string }`
  - `AuthService.register(dto): Promise<AuthResult>` — creates `username: null`
  - `AuthResult { token: string; user: { id: string; username: string | null } }`
  - Error codes `EMAIL_TAKEN` (409), `INVALID_CREDENTIALS` (401)

- [ ] **Step 1: Write the failing test**

`backend/test/auth/email-auth.spec.ts`:

```ts
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

function makeService(userTable: Partial<Record<string, jest.Mock>>) {
  const prisma = { user: userTable } as unknown as PrismaService;
  const jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') } as unknown as JwtService;
  return new AuthService(prisma, jwt);
}

function p2002(indexName: string) {
  return Object.assign(new Error('unique violation'), {
    code: 'P2002',
    meta: { target: indexName },
  });
}

describe('register', () => {
  it('creates the account with a null username — the handle comes in step 2', async () => {
    const create = jest.fn().mockResolvedValue({});
    const svc = makeService({ create });

    const result = await svc.register({ email: 'Pilot@Example.COM', password: 'hunter2hunter2' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ username: null, email: 'pilot@example.com' }),
      }),
    );
    expect(result.user.username).toBeNull();
    expect(result.token).toBe('signed.jwt.token');
  });

  it('reports EMAIL_TAKEN, not a generic conflict', async () => {
    // A single "already taken" would leave the player guessing which field was
    // the problem, on the one screen where guessing is most expensive.
    const create = jest.fn().mockRejectedValue(p2002('user_email_lower_key'));
    const svc = makeService({ create });

    await expect(svc.register({ email: 'taken@example.com', password: 'hunter2hunter2' }))
      .rejects.toMatchObject({ response: { code: 'EMAIL_TAKEN' } });
    await expect(svc.register({ email: 'taken@example.com', password: 'hunter2hunter2' }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe('login', () => {
  const hash = bcrypt.hashSync('hunter2hunter2', 4);

  it('finds the account regardless of the case the player typed', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      userid: 'usr_abc', username: 'rick', passwordHash: hash,
    });
    const svc = makeService({ findFirst });

    const result = await svc.login({ email: 'RICK@Example.com', password: 'hunter2hunter2' });

    expect(result.user).toEqual({ id: 'usr_abc', username: 'rick' });
    const where = findFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('insensitive');
  });

  it('still runs bcrypt when the email is unknown, so timing does not leak membership', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const svc = makeService({ findFirst });
    const compare = jest.spyOn(bcrypt, 'compare');

    await expect(svc.login({ email: 'nobody@example.com', password: 'hunter2hunter2' }))
      .rejects.toBeInstanceOf(UnauthorizedException);

    expect(compare).toHaveBeenCalled();
    compare.mockRestore();
  });

  it('issues a token for an account that has not chosen a username yet', async () => {
    // Otherwise abandoning signup after step 1 locks the player out of step 2.
    const findFirst = jest.fn().mockResolvedValue({
      userid: 'usr_def', username: null, passwordHash: hash,
    });
    const svc = makeService({ findFirst });

    const result = await svc.login({ email: 'half@example.com', password: 'hunter2hunter2' });
    expect(result.user.username).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and read the red**

```bash
cd backend && npx jest test/auth/email-auth.spec.ts
```

Expected: FAIL — `register` still requires `username`; TypeScript rejects `{ email, password }` against `RegisterDto`.

- [ ] **Step 3: Rewrite the DTOs**

`backend/src/auth/dto/register.dto.ts`:

```ts
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @MaxLength(254) // RFC 5321 max path length
  @IsEmail()
  email!: string;

  @MaxLength(72) // bcrypt truncates beyond 72 bytes
  @MinLength(8)
  @IsString()
  password!: string;
}
```

`backend/src/auth/dto/login.dto.ts`: identical body, class named `LoginDto`. Repeat it in full — do not import one from the other; they diverge the moment either grows a field.

- [ ] **Step 4: Update AuthService**

Replace `register` and `login` in `backend/src/auth/auth.service.ts`:

```ts
export interface AuthResult {
  token: string;
  user: { id: string; username: string | null };
}

/** Index names from the add_user_email migration. @see Task 1 step 3. */
const EMAIL_INDEX = 'user_email_lower_key';

async register(dto: RegisterDto): Promise<AuthResult> {
  const userid = `usr_${randomBytes(12).toString('hex')}`;
  const hash = await bcrypt.hash(dto.password, BCRYPT_COST);
  const email = dto.email.trim().toLowerCase();

  try {
    await this.prisma.user.create({
      data: { userid, email, username: null, passwordHash: hash, options: [] },
    });
  } catch (err: unknown) {
    if (isUniqueViolation(err, EMAIL_INDEX)) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'An account with that email already exists.',
      });
    }
    throw err;
  }

  return { token: this.issueJwt(userid, null), user: { id: userid, username: null } };
}

async login(dto: LoginDto): Promise<AuthResult> {
  const user = await this.prisma.user.findFirst({
    where: { email: { equals: dto.email.trim(), mode: 'insensitive' } },
  });

  // Always compare against something so an unknown email costs the same as a
  // known one. Without this the response time answers "is this address
  // registered?" for anyone who cares to ask.
  const hashToCompare = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
  const valid = await bcrypt.compare(dto.password, hashToCompare);

  if (!user || user.passwordHash === null || !valid) {
    throw new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
  }

  return {
    token: this.issueJwt(user.userid, user.username),
    user: { id: user.userid, username: user.username },
  };
}
```

Change `issueJwt` to accept `username: string | null`, and add this module-level helper:

```ts
/**
 * Prisma reports every unique violation as P2002 and names the offending
 * constraint in meta.target. Two unique indexes now live on User, so the
 * constraint name is the only thing that says which field the player must fix.
 */
function isUniqueViolation(err: unknown, indexName: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: string; meta?: { target?: unknown } };
  if (e.code !== 'P2002') return false;
  const target = e.meta?.target;
  const names = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return names.some((n) => n.includes(indexName));
}
```

- [ ] **Step 5: Run the test — expect green**

```bash
cd backend && npx jest test/auth/email-auth.spec.ts
```

- [ ] **Step 6: Fix the fallout**

```bash
cd backend && npx tsc --noEmit && npx jest
```

Existing auth tests posting `{ username, password }` now fail. **They encode the old contract, so update them** — that is not the same as a test encoding a canon deviation. Any test asserting `USERNAME_TAKEN` from `register` moves to Task 3.

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth backend/test/auth
git commit -m "$(cat <<'EOF'
feat(auth): email is the login credential

register takes email + password and creates the row with a null username;
the handle is step 2. login looks up by email, case-insensitively, and
still runs bcrypt against a dummy hash when the address is unknown so the
response time does not answer "is this address registered?".

With two unique indexes on User, P2002 alone no longer says which field
the player must fix, so isUniqueViolation reads meta.target and register
returns EMAIL_TAKEN specifically.

login deliberately issues a token to an account with no username yet —
otherwise abandoning signup after step 1 locks you out of finishing it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz
EOF
)"
```

---

### Task 3: Choosing a username

**Files:**
- Create: `backend/src/auth/dto/choose-username.dto.ts`
- Modify: `backend/src/auth/auth.service.ts`, `backend/src/auth/auth.controller.ts`
- Test: `backend/test/auth/choose-username.spec.ts`

**Interfaces:**
- Consumes: Task 2's `AuthResult`, `isUniqueViolation`, `issueJwt`.
- Produces: `AuthService.chooseUsername(userid: string, dto: ChooseUsernameDto): Promise<AuthResult>`; `POST /auth/username` (JWT-guarded); codes `USERNAME_TAKEN` (409), `USERNAME_ALREADY_SET` (409).

- [ ] **Step 1: Write the failing test**

`backend/test/auth/choose-username.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

function makeService(userTable: Partial<Record<string, jest.Mock>>) {
  const prisma = { user: userTable } as unknown as PrismaService;
  const jwt = { sign: jest.fn().mockReturnValue('fresh.jwt.token') } as unknown as JwtService;
  return new AuthService(prisma, jwt);
}

describe('chooseUsername', () => {
  it('sets the handle and returns a token that carries it', async () => {
    // The token issued at step 1 says username: null, and WsAuthGuard refuses
    // those. Without a fresh token here the player finishes signup and still
    // cannot open a socket.
    const findUnique = jest.fn().mockResolvedValue({ userid: 'usr_abc', username: null });
    const update = jest.fn().mockResolvedValue({ userid: 'usr_abc', username: 'rick' });
    const svc = makeService({ findUnique, update });

    const result = await svc.chooseUsername('usr_abc', { username: 'rick' });

    expect(update).toHaveBeenCalledWith({
      where: { userid: 'usr_abc' },
      data: { username: 'rick' },
    });
    expect(result.user).toEqual({ id: 'usr_abc', username: 'rick' });
    expect(result.token).toBe('fresh.jwt.token');
  });

  it('refuses a handle someone already holds', async () => {
    const findUnique = jest.fn().mockResolvedValue({ userid: 'usr_abc', username: null });
    const update = jest.fn().mockRejectedValue(
      Object.assign(new Error('unique violation'), {
        code: 'P2002',
        meta: { target: 'user_username_lower_key' },
      }),
    );
    const svc = makeService({ findUnique, update });

    await expect(svc.chooseUsername('usr_abc', { username: 'rick' }))
      .rejects.toMatchObject({ response: { code: 'USERNAME_TAKEN' } });
  });

  it('refuses to rename an account that already has a handle', async () => {
    // This endpoint completes signup. It is not a rename feature, and letting
    // it act as one would let a player shed a reputation mid-war.
    const findUnique = jest.fn().mockResolvedValue({ userid: 'usr_abc', username: 'rick' });
    const update = jest.fn();
    const svc = makeService({ findUnique, update });

    await expect(svc.chooseUsername('usr_abc', { username: 'someoneelse' }))
      .rejects.toMatchObject({ response: { code: 'USERNAME_ALREADY_SET' } });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an unknown userid rather than creating a row', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const svc = makeService({ findUnique, update: jest.fn() });

    await expect(svc.chooseUsername('usr_ghost', { username: 'rick' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run it and read the red**

```bash
cd backend && npx jest test/auth/choose-username.spec.ts
```

Expected: FAIL — `svc.chooseUsername is not a function`.

- [ ] **Step 3: Write the DTO**

`backend/src/auth/dto/choose-username.dto.ts`:

```ts
import { IsString, Matches } from 'class-validator';

export class ChooseUsernameDto {
  /**
   * Printable ASCII, 3–16 characters — the rule the port has always used, kept
   * verbatim so existing accounts stay valid. Canon's UIDSIZ is 30, but that
   * bounds the login id (here an opaque usr_ key), not the display handle.
   */
  @Matches(/^[\x21-\x7E]{3,16}$/)
  @IsString()
  username!: string;
}
```

- [ ] **Step 4: Implement chooseUsername**

Add to `AuthService`, alongside the `EMAIL_INDEX` constant (use the real index name found in Task 1 step 3):

```ts
const USERNAME_INDEX = 'user_username_lower_key';

/**
 * Step 2 of registration: attach a display handle to an account that has
 * credentials but no name yet.
 *
 * Returns a FRESH token. The one minted at step 1 carries `username: null`,
 * which WsAuthGuard refuses — without reissuing here the player would finish
 * signing up and still be unable to open a socket.
 */
async chooseUsername(userid: string, dto: ChooseUsernameDto): Promise<AuthResult> {
  const existing = await this.prisma.user.findUnique({ where: { userid } });
  if (!existing) throw new NotFoundException({ code: 'NO_SUCH_USER', message: 'Account not found.' });

  if (existing.username !== null) {
    throw new ConflictException({
      code: 'USERNAME_ALREADY_SET',
      message: 'This account already has a username.',
    });
  }

  try {
    await this.prisma.user.update({ where: { userid }, data: { username: dto.username } });
  } catch (err: unknown) {
    if (isUniqueViolation(err, USERNAME_INDEX)) {
      throw new ConflictException({
        code: 'USERNAME_TAKEN',
        message: 'That username is already taken.',
      });
    }
    throw err;
  }

  return {
    token: this.issueJwt(userid, dto.username),
    user: { id: userid, username: dto.username },
  };
}
```

Import `NotFoundException` from `@nestjs/common`.

- [ ] **Step 5: Run the test — expect green**

```bash
cd backend && npx jest test/auth/choose-username.spec.ts
```

- [ ] **Step 6: Expose the endpoint**

Check how existing routes read a JWT — there is a `jwt.strategy.ts`:

```bash
cd backend && cat src/auth/jwt.strategy.ts && grep -rn "AuthGuard('jwt')\|PassportModule" src/
```

Add to `AuthController`, using whatever guard that file establishes (`@UseGuards(AuthGuard('jwt'))` if Passport is wired):

```ts
@Post('username')
@HttpCode(200)
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true }))
async chooseUsername(@Req() req: { user: { userid: string } }, @Body() dto: ChooseUsernameDto) {
  return this.authService.chooseUsername(req.user.userid, dto);
}
```

If `jwt.strategy.ts` names the property differently (`sub`, `id`), match it rather than renaming the strategy.

- [ ] **Step 7: Verify end to end against the running server**

```bash
cd backend && TOKEN=$(curl -s localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"plan-check@example.com","password":"hunter2hunter2"}' | jq -r .token)
curl -s localhost:3000/auth/username -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" -d '{"username":"plancheck"}' | jq .
curl -s localhost:3000/auth/username -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" -d '{"username":"plancheck2"}' | jq .
```

Expected: first call returns a token and `"username":"plancheck"`; second returns `USERNAME_ALREADY_SET`. Then remove the row:

```bash
cd backend && set -a && . ./.env && set +a && \
  psql "$DATABASE_URL" -c "DELETE FROM \"User\" WHERE email = 'plan-check@example.com';"
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/auth backend/test/auth
git commit -m "$(cat <<'EOF'
feat(auth): POST /auth/username completes a two-step signup

The account exists after step 1 so that "email taken" lands before the
player has invested in choosing a name. This endpoint attaches the handle.

It returns a fresh token on purpose: the step-1 token carries
username: null, which WsAuthGuard refuses, so without reissuing here a
player would finish signing up and still be unable to open a socket.

It refuses an account that already has a handle. This completes
registration; it is not a rename, and letting it act as one would let a
player shed a reputation mid-war.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz
EOF
)"
```

---

### Task 4: WsAuthGuard refuses a username-less token

**Files:**
- Modify: `backend/src/auth/ws-auth.guard.ts`
- Test: `backend/test/auth/ws-auth-username-required.spec.ts`

**Interfaces:**
- Consumes: Task 2's `issueJwt(userid, username | null)`.
- Produces: `WsJwtPayload { sub: string; username: string }` — still non-null, because the guard now guarantees it.

**This task is what makes the nullable column safe. Do not deploy Tasks 2–3 without it.**

- [ ] **Step 1: Write the failing test**

`backend/test/auth/ws-auth-username-required.spec.ts`:

```ts
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { AuthService } from '../../src/auth/auth.service';
import { Socket } from 'socket.io';

function makeSocket(token: string | undefined) {
  return {
    handshake: { auth: token === undefined ? {} : { token } },
    emit: jest.fn(),
    disconnect: jest.fn(),
  } as unknown as Socket & { emit: jest.Mock; disconnect: jest.Mock };
}

function makeGuard(payload: unknown) {
  const authService = { verifyJwt: jest.fn().mockResolvedValue(payload) } as unknown as AuthService;
  return new WsAuthGuard(authService);
}

describe('WsAuthGuard', () => {
  it('refuses a token whose account never chose a username', async () => {
    // canon's username() (GEFUNCS.C:2596) names a player throughout combat and
    // sector messaging. A half-registered account reaching the socket would put
    // a null through all of it.
    const guard = makeGuard({ sub: 'usr_half', username: null });
    const client = makeSocket('valid.jwt');

    const result = await guard.validate(client);

    expect(result).toBeNull();
    expect(client.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'USERNAME_REQUIRED' }),
    );
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('refuses an empty-string username too', async () => {
    const guard = makeGuard({ sub: 'usr_half', username: '' });
    const client = makeSocket('valid.jwt');
    expect(await guard.validate(client)).toBeNull();
  });

  it('admits a fully registered account', async () => {
    const guard = makeGuard({ sub: 'usr_abc', username: 'rick' });
    const client = makeSocket('valid.jwt');

    expect(await guard.validate(client)).toEqual({ sub: 'usr_abc', username: 'rick' });
    expect(client.disconnect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and read the red**

```bash
cd backend && npx jest test/auth/ws-auth-username-required.spec.ts
```

Expected: FAIL — the guard returns `{ sub: 'usr_half', username: null }` instead of `null`.

- [ ] **Step 3: Implement the gate**

In `validate`, after `const payload = await this.authService.verifyJwt(token);`:

```ts
      // Two-step registration means a valid token can belong to an account that
      // has credentials but no display handle yet. Canon's username()
      // (GEFUNCS.C:2596) names a player throughout combat and sector messaging,
      // so a null must never reach the game — this is the gate that makes the
      // nullable column safe.
      if (!payload.username) {
        this.logger.warn(`WsAuthGuard: ${payload.sub} has no username — refusing`);
        client.emit('error', {
          code: 'USERNAME_REQUIRED',
          message: 'Finish signing up by choosing a username.',
        });
        client.disconnect(true);
        return null;
      }
```

Widen `AuthService.verifyJwt`'s return type to `{ sub: string; username: string | null }` so the check is not dead code to the compiler. `WsJwtPayload.username` stays `string`.

- [ ] **Step 4: Run the test — expect green**

```bash
cd backend && npx jest test/auth/ws-auth-username-required.spec.ts && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth backend/test/auth
git commit -m "$(cat <<'EOF'
fix(auth): a socket requires a username, not just a valid token

Two-step registration means a perfectly valid JWT can belong to an
account with credentials and no display handle. Canon's username()
(GEFUNCS.C:2596) names a player throughout combat and sector messaging,
so a null reaching the game would surface everywhere at once.

This is the gate that makes the nullable column safe, which is why it is
its own commit: the schema change is not deployable without it.

verifyJwt widens to string | null so the check is not dead code to the
compiler; WsJwtPayload stays non-null because the guard now guarantees it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz
EOF
)"
```

---

### Task 5: Extract the roster query

**Files:**
- Create: `backend/src/game/player/roster-query.ts`
- Modify: `backend/src/game/commands/handlers/ros.handler.ts`
- Test: `backend/test/game/player/roster-query.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ROSTER_WHERE` — Prisma `where` for canon's roster predicate
  - `ROSTER_ORDER_BY` — Prisma `orderBy` array
  - `RosterRow { userid: string; username: string | null; score: bigint; kills: number; planets: number; population: bigint }`

The existing `ros` tests are the proof this refactor preserves behaviour. Do not modify them.

- [ ] **Step 1: Write the failing test**

`backend/test/game/player/roster-query.spec.ts`:

```ts
import { ROSTER_WHERE, ROSTER_ORDER_BY } from '../../../src/game/player/roster-query';

describe('ROSTER_WHERE', () => {
  it('lists only players who have actually scored', () => {
    // GECMDS.C:4038 — tmpusr.score > 0. Without it every dormant account pads
    // the board, which is what filled the roster with e2e_* rows.
    expect(ROSTER_WHERE.score).toEqual({ gt: 0n });
  });

  it('excludes Cybertrons, droids, and every @-prefixed userid', () => {
    const json = JSON.stringify(ROSTER_WHERE, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    expect(json).toContain('Cybrg-');
    expect(json).toContain('@Droid-');
    expect(json).toContain('"startsWith":"@"');
  });
});

describe('ROSTER_ORDER_BY', () => {
  it('orders by score, then kills, then userid — deterministic on ties', () => {
    expect(ROSTER_ORDER_BY).toEqual([
      { score: 'desc' },
      { kills: 'desc' },
      { userid: 'asc' },
    ]);
  });
});
```

- [ ] **Step 2: Run it and read the red**

```bash
cd backend && npx jest test/game/player/roster-query.spec.ts
```

Expected: FAIL — cannot resolve `../../../src/game/player/roster-query`.

- [ ] **Step 3: Create the module**

`backend/src/game/player/roster-query.ts`:

```ts
import type { Prisma } from '@prisma/client';

/**
 * Canon's roster selection, shared by the in-game `ros` command and the public
 * stats page so the two can never disagree.
 *
 * Extracted verbatim from ros.handler.ts. The public board is not a second
 * leaderboard with its own taste — it is the same board, rendered in HTML.
 *
 * @see GECMDS.C:4020-4045 — cmd_geroster
 * @see GECMDS.C:4038 — tmpusr.score > 0
 */
export const ROSTER_WHERE = {
  score: { gt: 0n },
  AND: [
    { NOT: { userid: { startsWith: 'Cybrg-' } } },
    { NOT: { userid: { startsWith: '@Droid-' } } },
    { NOT: { userid: { startsWith: '@' } } },
  ],
} satisfies Prisma.UserWhereInput;

/** Score descending; kills then userid break ties so paging is stable. */
export const ROSTER_ORDER_BY = [
  { score: 'desc' },
  { kills: 'desc' },
  { userid: 'asc' },
] satisfies Prisma.UserOrderByWithRelationInput[];

/** Columns both the `ros` command and the public board render. */
export interface RosterRow {
  userid: string;
  username: string | null;
  score: bigint;
  kills: number;
  planets: number;
  population: bigint;
}
```

- [ ] **Step 4: Run the test — expect green**

```bash
cd backend && npx jest test/game/player/roster-query.spec.ts
```

- [ ] **Step 5: Refactor ros.handler.ts onto it**

Replace the inline `where` and `orderBy` in `handle()` with the imports, keeping every surrounding comment:

```ts
    const allRows = await this.prisma.user.findMany({
      where: ROSTER_WHERE,
      orderBy: ROSTER_ORDER_BY,
      take: limit,
      select: { userid: true, username: true, score: true, kills: true, planets: true, population: true },
    });
```

- [ ] **Step 6: Prove the refactor changed nothing**

```bash
cd backend && npx jest ros && npx tsc --noEmit
```

Every existing `ros` test must pass untouched. If one fails, the extraction was not faithful — fix the module, not the test.

- [ ] **Step 7: Commit**

```bash
git add backend/src/game/player/roster-query.ts backend/src/game/commands/handlers/ros.handler.ts backend/test/game/player
git commit -m "$(cat <<'EOF'
refactor(roster): extract canon's roster predicate for reuse

The public stats page needs the same board `ros` shows. The design
originally said to reuse midnight/rank-roster.ts, which was wrong twice
over: rankRoster assigns rospos, and ros does not use it — ros runs its
own query with its own predicate.

So the shared thing is extracted from ros rather than borrowed from
midnight. The public board is not a second leaderboard with its own
taste; it is the same board rendered in HTML.

Behaviour-preserving: the existing ros tests pass unmodified, which is
the point of doing this before the public endpoint exists.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz
EOF
)"
```

---

### Task 6: PresenceService

**Files:**
- Create: `backend/src/public/presence.service.ts`, `backend/src/public/public.module.ts`
- Modify: `backend/src/gateway/game.gateway.ts`, `backend/src/gateway/gateway.module.ts`, `backend/src/app.module.ts`
- Test: `backend/test/public/presence.service.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PresenceService` with `arrive(userid: string): void`, `depart(userid: string): void`, `count(): number`, `has(userid: string): boolean`.

- [ ] **Step 1: Write the failing test**

`backend/test/public/presence.service.spec.ts`:

```ts
import { PresenceService } from '../../src/public/presence.service';

describe('PresenceService', () => {
  let presence: PresenceService;
  beforeEach(() => { presence = new PresenceService(); });

  it('counts an arrival', () => {
    presence.arrive('usr_a');
    expect(presence.count()).toBe(1);
  });

  it('counts a player once across two sockets', () => {
    // A reconnect briefly overlaps the old socket, and a player may have the
    // game open in two tabs. Counting sockets would advertise phantom players.
    presence.arrive('usr_a');
    presence.arrive('usr_a');
    expect(presence.count()).toBe(1);
  });

  it('forgets a player on departure', () => {
    presence.arrive('usr_a');
    presence.depart('usr_a');
    expect(presence.count()).toBe(0);
  });

  it('ignores a departure it never saw', () => {
    // handleDisconnect fires for sockets the guard rejected before they were
    // ever admitted, so this is a normal path, not an error.
    expect(() => presence.depart('usr_ghost')).not.toThrow();
    expect(presence.count()).toBe(0);
  });

  it('keeps players separate', () => {
    presence.arrive('usr_a');
    presence.arrive('usr_b');
    expect(presence.count()).toBe(2);
    presence.depart('usr_a');
    expect(presence.count()).toBe(1);
    expect(presence.has('usr_b')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and read the red**

```bash
cd backend && npx jest test/public/presence.service.spec.ts
```

Expected: FAIL — cannot resolve `../../src/public/presence.service`.

- [ ] **Step 3: Implement it**

`backend/src/public/presence.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

/**
 * Who is connected right now, for the public stats page.
 *
 * Deliberately not derived from either obvious source. ShipChannelRegistry
 * holds AI ships as well as players. Counting raw sockets double-counts a
 * reconnect and a second browser tab. This tracks distinct userids and nothing
 * else.
 *
 * In-memory and process-local, consistent with the project's no-Redis rule: on
 * restart it is empty and refills as players reconnect.
 */
@Injectable()
export class PresenceService {
  private readonly online = new Set<string>();

  arrive(userid: string): void { this.online.add(userid); }

  /** Safe for a userid never seen — the guard rejects sockets before arrival. */
  depart(userid: string): void { this.online.delete(userid); }

  count(): number { return this.online.size; }

  has(userid: string): boolean { return this.online.has(userid); }
}
```

`backend/src/public/public.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PresenceService } from './presence.service';

@Module({
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PublicModule {}
```

- [ ] **Step 4: Run the test — expect green**

```bash
cd backend && npx jest test/public/presence.service.spec.ts
```

- [ ] **Step 5: Wire the gateway**

Import `PublicModule` in `app.module.ts` (add to the `imports` array) and in `gateway.module.ts`. Inject `PresenceService` into `GameGateway`'s constructor.

In `handleConnection`, immediately after `client.data.username = payload.username;`:

```ts
    this.presence.arrive(userid);
```

In `handleDisconnect`, immediately after `const userid = client.data.userid as string | undefined;`:

```ts
    // Before the cantexit branch below: that path can throw or return early,
    // and a player who cannot be un-counted is a player the stats page reports
    // as online forever.
    if (userid !== undefined) this.presence.depart(userid);
```

- [ ] **Step 6: Verify nothing regressed**

```bash
cd backend && npx tsc --noEmit && npx jest
```

Gateway tests constructing `GameGateway` directly need the new argument. Pass a real `new PresenceService()` — it has no dependencies, so a mock buys nothing.

- [ ] **Step 7: Commit**

```bash
git add backend/src/public backend/src/gateway backend/src/app.module.ts backend/test/public
git commit -m "$(cat <<'EOF'
feat(public): track who is actually online

Neither obvious source works. ShipChannelRegistry contains AI ships;
raw socket counts double-count a reconnect and a second tab. This tracks
distinct userids.

depart() runs before the cantexit branch in handleDisconnect, because
that path can throw or return early and a player who cannot be
un-counted is one the stats page reports as online forever.

In-memory and process-local per the project's no-Redis rule: empty on
restart, refills as players reconnect.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz
EOF
)"
```

---

### Task 7: GET /public/stats

**Files:**
- Create: `backend/src/public/stats.service.ts`, `backend/src/public/stats.controller.ts`
- Modify: `backend/src/public/public.module.ts`
- Test: `backend/test/public/stats.service.spec.ts`

**Interfaces:**
- Consumes: Task 5's `ROSTER_WHERE`/`ROSTER_ORDER_BY`, Task 6's `PresenceService`.
- Produces:
  - `PublicStats { commanders: number; online: number; roster: PublicRosterEntry[] }`
  - `PublicRosterEntry { rank: number; username: string; score: string; kills: number; planets: number }`
  - `StatsService.getStats(): Promise<PublicStats>`; `GET /public/stats`
  - `STATS_CACHE_MS = 15_000`, `PUBLIC_ROSTER_LIMIT = 20`

`score` is a **string** — `BigInt` does not survive `JSON.stringify`.

- [ ] **Step 1: Write the failing test**

`backend/test/public/stats.service.spec.ts`:

```ts
import { StatsService } from '../../src/public/stats.service';
import { PresenceService } from '../../src/public/presence.service';
import { PrismaService } from '../../src/prisma/prisma.service';

function makeService(rows: unknown[], commanderCount: number) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const count = jest.fn().mockResolvedValue(commanderCount);
  const prisma = { user: { findMany, count } } as unknown as PrismaService;
  const presence = new PresenceService();
  return { svc: new StatsService(prisma, presence), findMany, count, presence };
}

const RICK = { userid: 'usr_rick', username: 'rick', score: 15345n, kills: 31, planets: 3, population: 0n };
const VRASK = { userid: 'usr_v', username: 'vraskcmdr', score: 900n, kills: 2, planets: 0, population: 0n };

describe('getStats', () => {
  it('counts only accounts a human could log into', async () => {
    // 24 of 33 User rows are Cybertrons (Cybrg-200..223) with a null
    // passwordHash. Counting the table reports 33 players and is a lie.
    const { svc, count } = makeService([], 9);
    const stats = await svc.getStats();

    expect(stats.commanders).toBe(9);
    expect(count).toHaveBeenCalledWith({ where: { passwordHash: { not: null } } });
  });

  it('applies canon roster selection so AI can never reach the board', async () => {
    const { svc, findMany } = makeService([RICK], 9);
    await svc.getStats();

    const arg = findMany.mock.calls[0][0];
    const json = JSON.stringify(arg.where, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(json).toContain('Cybrg-');
    expect(arg.where.score).toEqual({ gt: 0n });
    expect(arg.orderBy).toEqual([{ score: 'desc' }, { kills: 'desc' }, { userid: 'asc' }]);
  });

  it('ranks from list order and serialises score as a string', async () => {
    // BigInt does not survive JSON.stringify — it throws. The endpoint would
    // 500 on the first player with a score.
    const { svc } = makeService([RICK, VRASK], 9);
    const stats = await svc.getStats();

    expect(stats.roster).toEqual([
      { rank: 1, username: 'rick', score: '15345', kills: 31, planets: 3 },
      { rank: 2, username: 'vraskcmdr', score: '900', kills: 2, planets: 0 },
    ]);
    expect(() => JSON.stringify(stats)).not.toThrow();
  });

  it('reports live presence', async () => {
    const { svc, presence } = makeService([], 9);
    presence.arrive('usr_rick');
    expect((await svc.getStats()).online).toBe(1);
  });

  it('serves a second call from cache without re-querying', async () => {
    // The endpoint is public and unauthenticated, and the page polls it. The
    // cache is the entire abuse story.
    const { svc, findMany, count } = makeService([RICK], 9);
    await svc.getStats();
    await svc.getStats();

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('re-queries once the cache expires', async () => {
    const { svc, findMany } = makeService([RICK], 9);
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    await svc.getStats();
    now.mockReturnValue(1_000_000 + 15_001);
    await svc.getStats();

    expect(findMany).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('reports live presence even on a cached read', async () => {
    // Online-now is the number that makes the page feel alive; freezing it for
    // 15 seconds is the one thing the cache must not do.
    const { svc, presence } = makeService([RICK], 9);
    await svc.getStats();
    presence.arrive('usr_rick');
    expect((await svc.getStats()).online).toBe(1);
  });

  it('falls back to userid when a scoring account has no username', async () => {
    const { svc } = makeService([{ ...RICK, username: null }], 9);
    expect((await svc.getStats()).roster[0].username).toBe('usr_rick');
  });
});
```

- [ ] **Step 2: Run it and read the red**

```bash
cd backend && npx jest test/public/stats.service.spec.ts
```

Expected: FAIL — cannot resolve `../../src/public/stats.service`.

- [ ] **Step 3: Implement the service**

`backend/src/public/stats.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from './presence.service';
import { ROSTER_WHERE, ROSTER_ORDER_BY } from '../game/player/roster-query';

/** Long enough that polling costs nothing; short enough to feel live. */
export const STATS_CACHE_MS = 15_000;

/** Canon's MAXLIST is 10 for `ros`; a web page has room for more. */
export const PUBLIC_ROSTER_LIMIT = 20;

export interface PublicRosterEntry {
  rank: number;
  username: string;
  /** String, not BigInt — BigInt throws inside JSON.stringify. */
  score: string;
  kills: number;
  planets: number;
}

export interface PublicStats {
  commanders: number;
  online: number;
  roster: PublicRosterEntry[];
}

@Injectable()
export class StatsService {
  private cached: { commanders: number; roster: PublicRosterEntry[] } | null = null;
  private cachedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  /**
   * Counts and the public scoreboard.
   *
   * `commanders` and the roster answer different questions and legitimately use
   * different predicates. The roster is canon's board, which omits anyone who
   * has never scored (GECMDS.C:4038). `commanders` is "how many people signed
   * up", so it counts anyone who could log in — passwordHash not null, which is
   * also what keeps the 24 Cybertron rows out of the total.
   */
  async getStats(): Promise<PublicStats> {
    const now = Date.now();
    if (this.cached === null || now - this.cachedAt >= STATS_CACHE_MS) {
      const [commanders, rows] = await Promise.all([
        this.prisma.user.count({ where: { passwordHash: { not: null } } }),
        this.prisma.user.findMany({
          where: ROSTER_WHERE,
          orderBy: ROSTER_ORDER_BY,
          take: PUBLIC_ROSTER_LIMIT,
          select: { userid: true, username: true, score: true, kills: true, planets: true },
        }),
      ]);

      this.cached = {
        commanders,
        roster: rows.map((row, i) => ({
          rank: i + 1,
          username: row.username ?? row.userid,
          score: row.score.toString(),
          kills: row.kills,
          planets: row.planets,
        })),
      };
      this.cachedAt = now;
    }

    // Read outside the cache branch on purpose: online-now is what makes the
    // page feel alive, and freezing it for 15 seconds is the one thing this
    // cache must not do.
    return { ...this.cached, online: this.presence.count() };
  }
}
```

- [ ] **Step 4: Run the test — expect green**

```bash
cd backend && npx jest test/public/stats.service.spec.ts
```

- [ ] **Step 5: Add the controller and register it**

`backend/src/public/stats.controller.ts`:

```ts
import { Controller, Get, Header } from '@nestjs/common';
import { StatsService, PublicStats } from './stats.service';

/**
 * Unauthenticated. Everything here is already visible in-game via `ros`, and
 * the 15s cache in StatsService is what makes it safe to leave open.
 */
@Controller('public')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('stats')
  @Header('Cache-Control', 'public, max-age=15')
  async getStats(): Promise<PublicStats> {
    return this.stats.getStats();
  }
}
```

Update `public.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PresenceService } from './presence.service';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

@Module({
  imports: [PrismaModule],
  controllers: [StatsController],
  providers: [PresenceService, StatsService],
  exports: [PresenceService],
})
export class PublicModule {}
```

- [ ] **Step 6: Hit it for real**

```bash
cd backend && npx nest build && curl -s localhost:3000/public/stats | jq .
```

Restart the backend first if it is running an older build — and only when the player is parked. Expected: `commanders: 9`, a roster containing `rick` and no `Cybrg-` entry.

- [ ] **Step 7: Commit**

```bash
git add backend/src/public backend/test/public
git commit -m "$(cat <<'EOF'
feat(public): GET /public/stats

commanders and the roster use different predicates on purpose. The roster
is canon's board and omits anyone who never scored (GECMDS.C:4038);
commanders answers "how many signed up", so it counts passwordHash not
null — which is also what keeps the 24 Cybertron rows out of the total.
Counting the table reports 33 players and is a lie.

score serialises as a string because BigInt throws inside
JSON.stringify — the endpoint would 500 on the first player with a score.

online is read outside the cache branch: freezing the live number for 15
seconds is the one thing this cache must not do.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz
EOF
)"
```

---

### Task 8: Midnight sweeps abandoned signups

**Files:**
- Modify: `backend/src/game/midnight/midnight.constants.ts`, `midnight.repository.ts`, `midnight.service.ts`
- Test: `backend/test/game/midnight/abandoned-signup-sweep.spec.ts`

**Interfaces:**
- Consumes: Task 1's nullable `username`.
- Produces: `ABANDONED_SIGNUP_DAYS = 10`; `MidnightRepository.purgeAbandonedSignups(tx: TxClient, days: number, now: Date): Promise<number>`; counter `abandonedSignupsDeleted`.

- [ ] **Step 1: Write the failing test**

`backend/test/game/midnight/abandoned-signup-sweep.spec.ts`:

```ts
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { ABANDONED_SIGNUP_DAYS } from '../../../src/game/midnight/midnight.constants';

function makeRepo() {
  const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const tx = { user: { deleteMany } } as never;
  return { repo: new MidnightRepository(), tx, deleteMany };
}

const NOW = new Date('2026-09-07T00:00:00Z');

describe('purgeAbandonedSignups', () => {
  it('deletes only rows with credentials, no username, and age past the cutoff', async () => {
    const { repo, tx, deleteMany } = makeRepo();
    await repo.purgeAbandonedSignups(tx, ABANDONED_SIGNUP_DAYS, NOW);

    const where = deleteMany.mock.calls[0][0].where;

    // All three conditions are load-bearing. passwordHash keeps the sweep off
    // the 24 Cybertron rows; the null username is what marks the row abandoned
    // mid-signup and makes a real player unreachable by this code at any age.
    expect(where.passwordHash).toEqual({ not: null });
    expect(where.username).toBeNull();
    expect(where.createdAt.lt).toEqual(new Date('2026-08-28T00:00:00Z'));
  });

  it('uses a 10-day threshold', () => {
    expect(ABANDONED_SIGNUP_DAYS).toBe(10);
  });

  it('returns how many it deleted', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
    const tx = { user: { deleteMany } } as never;
    expect(await new MidnightRepository().purgeAbandonedSignups(tx, 10, NOW)).toBe(4);
  });

  it('is idempotent — a second run finds nothing left', async () => {
    const deleteMany = jest.fn()
      .mockResolvedValueOnce({ count: 4 })
      .mockResolvedValueOnce({ count: 0 });
    const tx = { user: { deleteMany } } as never;
    const repo = new MidnightRepository();

    expect(await repo.purgeAbandonedSignups(tx, 10, NOW)).toBe(4);
    expect(await repo.purgeAbandonedSignups(tx, 10, NOW)).toBe(0);
  });
});
```

If `MidnightRepository`'s constructor takes arguments, match the existing call in `midnight.service.ts` rather than the no-arg form above.

- [ ] **Step 2: Run it and read the red**

```bash
cd backend && npx jest test/game/midnight/abandoned-signup-sweep.spec.ts
```

Expected: FAIL — `ABANDONED_SIGNUP_DAYS` is not exported and `purgeAbandonedSignups` does not exist.

- [ ] **Step 3: Add the constant**

Append to `backend/src/game/midnight/midnight.constants.ts`:

```ts
/**
 * Days before an abandoned signup is deleted.
 *
 * PORT-ORIGINAL: canon has no such sweep — registration was a single BBS-level
 * action with no half-finished state to clean up. Two-step signup creates one:
 * an account with credentials and no username holds its email address forever.
 */
export const ABANDONED_SIGNUP_DAYS = 10;
```

- [ ] **Step 4: Add the repository method**

In `backend/src/game/midnight/midnight.repository.ts`, near `purgeMail`:

```ts
  /**
   * Delete accounts that began registration and never chose a username.
   *
   * All three conditions matter. `passwordHash IS NOT NULL` keeps the sweep
   * away from the 24 Cybertron rows in this table. A null username is what
   * marks the row as abandoned mid-signup — once step 2 completes it can never
   * match again, so a real player is unreachable by this code at any age.
   *
   * Such a row owns no ships, planets or mail: those are only created once the
   * player boards. This is a plain delete with no cascade to reason about.
   */
  async purgeAbandonedSignups(tx: TxClient, days: number, now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const result = await tx.user.deleteMany({
      where: {
        passwordHash: { not: null },
        username: null,
        createdAt: { lt: cutoff },
      },
    });
    return result.count;
  }
```

- [ ] **Step 5: Run the test — expect green**

```bash
cd backend && npx jest test/game/midnight/abandoned-signup-sweep.spec.ts
```

- [ ] **Step 6: Call it from the job**

In `midnight.service.ts`, after phase 4's `assignRosterPositions(tx)`:

```ts
        this.logger.log('midnight: phase 5 — purge abandoned signups');
        const abandonedSignupsDeleted = await this.repo.purgeAbandonedSignups(
          tx, ABANDONED_SIGNUP_DAYS, new Date(),
        );
```

Add `abandonedSignupsDeleted` to the `phaseCounters` object and to the `MidnightCounters` interface wherever it is declared. Import `ABANDONED_SIGNUP_DAYS`.

- [ ] **Step 7: Confirm the whole job still passes, idempotency included**

```bash
cd backend && npx jest midnight && npx tsc --noEmit
```

The existing idempotency test must still pass. If it asserts an exact counter shape, add the new field to its expectation — the counter is new, not a deviation.

- [ ] **Step 8: Commit**

```bash
git add backend/src/game/midnight backend/test/game/midnight
git commit -m "$(cat <<'EOF'
feat(midnight): sweep abandoned signups after 10 days

Two-step registration lets someone hold an email address forever by
completing step 1 and closing the tab. Phase 5 deletes those rows.

All three conditions are load-bearing: passwordHash keeps the sweep off
the 24 Cybertron rows, and the null username is what makes a real player
unreachable by this code at any age — once step 2 completes the row can
never match again.

The row owns no ships, planets or mail; those exist only once a player
boards. Plain delete, no cascade.

PORT-ORIGINAL: canon has no such sweep because it had no half-finished
registration state to clean up.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz
EOF
)"
```

---

### Task 9: Router and route guards

**Files:**
- Modify: `frontend/package.json`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/vite.config.ts`
- Create: `frontend/src/routes/RequireAuth.tsx`, `frontend/src/auth/session.ts`
- Test: `frontend/test/routes/require-auth.spec.tsx`

**Interfaces:**
- Consumes: `auth/tokenStore.ts` (`getToken`, `setToken`, `clearToken`).
- Produces:
  - `session.ts`: `decodeUsername(token: string | null): string | null`, `hasUsername(token: string | null): boolean`
  - `RequireAuth` — wraps children; redirects to `/login` when no token, to `/register/name` when the token has no username.

**Frontend edits trigger Vite HMR and reload the player's browser. Confirm the player is parked before starting this task.**

- [ ] **Step 1: Install the router**

```bash
cd frontend && npm install react-router-dom@^6
```

- [ ] **Step 2: Write the failing test**

`frontend/test/routes/require-auth.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth } from '../../src/routes/RequireAuth';
import { setToken, clearToken } from '../../src/auth/tokenStore';

/** A JWT is three dot-separated base64url segments; only the middle is read. */
function fakeJwt(payload: Record<string, unknown>): string {
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${body}.signature`;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/register/name" element={<p>choose a username</p>} />
        <Route path="/play" element={<RequireAuth><p>the game</p></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  afterEach(() => clearToken());

  it('sends an anonymous visitor to the login page', () => {
    clearToken();
    renderAt('/play');
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('the game')).not.toBeInTheDocument();
  });

  it('sends a half-registered player to finish choosing a username', () => {
    // Otherwise they reach /play, the socket opens, and WsAuthGuard closes it
    // with USERNAME_REQUIRED — a dead end with no way forward.
    setToken(fakeJwt({ sub: 'usr_half', username: null }));
    renderAt('/play');
    expect(screen.getByText('choose a username')).toBeInTheDocument();
  });

  it('lets a fully registered player through', () => {
    setToken(fakeJwt({ sub: 'usr_abc', username: 'rick' }));
    renderAt('/play');
    expect(screen.getByText('the game')).toBeInTheDocument();
  });

  it('treats a malformed token as no token instead of crashing', () => {
    setToken('not-a-jwt');
    renderAt('/play');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it and read the red**

```bash
cd frontend && npx vitest run test/routes/require-auth.spec.tsx
```

Expected: FAIL — cannot resolve `../../src/routes/RequireAuth`.

- [ ] **Step 4: Write the session helper**

`frontend/src/auth/session.ts`:

```ts
/**
 * Reads the username out of a JWT payload.
 *
 * This does NOT verify the signature and must never be trusted for
 * authorisation — the server re-verifies every token. It exists only to route:
 * knowing whether signup is finished decides which screen to show, and asking
 * the server for that on every navigation would be a round trip for a decision
 * the token already carries.
 */
export function decodeUsername(token: string | null): string | null {
  if (!token) return null;
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  try {
    const json = atob(segments[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { username?: unknown };
    return typeof payload.username === 'string' && payload.username.length > 0
      ? payload.username
      : null;
  } catch {
    // Malformed token: treat as unauthenticated rather than crashing the app.
    return null;
  }
}

export function hasUsername(token: string | null): boolean {
  return decodeUsername(token) !== null;
}
```

- [ ] **Step 5: Write RequireAuth**

`frontend/src/routes/RequireAuth.tsx`:

```tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken } from '../auth/tokenStore';
import { hasUsername } from '../auth/session';

interface Props { children: React.JSX.Element }

/**
 * Gate on /play.
 *
 * Two redirects, not one. A token with no username belongs to an account that
 * began registration and stopped; letting it reach /play means the socket opens
 * and WsAuthGuard immediately closes it with USERNAME_REQUIRED — a dead end
 * with no way forward. Sending them to step 2 resumes the signup instead.
 *
 * The intended path rides along in location state so a deep link survives login.
 */
export function RequireAuth({ children }: Props): React.JSX.Element {
  const location = useLocation();
  const token = getToken();

  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!hasUsername(token)) return <Navigate to="/register/name" replace />;
  return children;
}
```

- [ ] **Step 6: Run the test — expect green**

```bash
cd frontend && npx vitest run test/routes/require-auth.spec.tsx
```

- [ ] **Step 7: Mount the router**

`frontend/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css';
import { App } from './App';
import { RequireAuth } from './routes/RequireAuth';
import { Landing } from './routes/Landing';
import { Login } from './routes/Login';
import { Register } from './routes/Register';
import { ChooseUsername } from './routes/ChooseUsername';
import { Stats } from './routes/Stats';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No #root element found');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register/name" element={<ChooseUsername />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/play" element={<RequireAuth><App /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
```

The five route components do not exist yet — Tasks 10–12 create them. To keep the tree compiling in the meantime, create each as a one-line placeholder now (`export function Landing(): React.JSX.Element { return <p>Landing</p>; }`) and fill them in in their own tasks.

- [ ] **Step 8: Strip the auth branch from App.tsx**

`RequireAuth` owns that decision now. In `frontend/src/App.tsx`:

```tsx
export function App(): React.JSX.Element {
  useEffect(() => {
    // A token rejected mid-session (expired, or an account deleted by the
    // midnight sweep) sends the player back to the front door rather than
    // leaving a dead terminal on screen.
    onSocketAuthFailed(() => {
      clearToken();
      window.location.assign('/login');
    });
    connectSocket();
  }, []);

  return <Terminal />;
}
```

Delete the `token` state, `handleAuthenticated`, the `if (!token)` branch, and the `AuthScreen`/`getToken`/`setToken` imports. Import `clearToken`.

- [ ] **Step 9: Proxy /public in dev**

In `frontend/vite.config.ts`, alongside the existing entries:

```ts
      '/public': { target: 'http://localhost:3000', changeOrigin: true },
```

- [ ] **Step 10: Full frontend suite**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Tests rendering `<App/>` and expecting a login form now fail — that behaviour moved to `RequireAuth` and `/login`. Update or delete them; they assert an obsolete contract, not a canon deviation.

- [ ] **Step 11: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src frontend/test frontend/vite.config.ts
git commit -m "$(cat <<'EOF'
feat(web): add react-router; the game moves to /play

App.tsx no longer decides whether you are logged in — RequireAuth does,
and it makes two decisions rather than one. A token with no username
belongs to an account that began registration and stopped; letting it
reach /play opens a socket that WsAuthGuard immediately closes with
USERNAME_REQUIRED, a dead end. It redirects to step 2 instead.

session.ts reads the JWT payload without verifying it, which is safe only
because it decides routing and never authorisation — the server
re-verifies every token. A malformed token routes to /login rather than
crashing the app.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz
EOF
)"
```

---

### Task 10: Login, Register and ChooseUsername screens

**Files:**
- Create: `frontend/src/routes/Login.tsx`, `Register.tsx`, `ChooseUsername.tsx`
- Delete: `frontend/src/auth/AuthScreen.tsx` (and its test)
- Test: `frontend/test/routes/auth-screens.spec.tsx`

**Interfaces:**
- Consumes: `tokenStore`, `session.ts`.
- Produces: three route components, each default-exported by name.

- [ ] **Step 1: Write the failing test**

`frontend/test/routes/auth-screens.spec.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Login } from '../../src/routes/Login';
import { Register } from '../../src/routes/Register';
import { ChooseUsername } from '../../src/routes/ChooseUsername';
import { setToken, getToken, clearToken } from '../../src/auth/tokenStore';

function mockFetch(status: number, body: unknown) {
  const f = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  global.fetch = f as unknown as typeof fetch;
  return f;
}

function renderRoute(element: React.JSX.Element, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path="/play" element={<p>the game</p>} />
        <Route path="/register/name" element={<p>choose a username</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => clearToken());

describe('Register', () => {
  it('posts email and password, then sends the player to step 2', async () => {
    const f = mockFetch(201, { token: 'step1.token', user: { id: 'usr_a', username: null } });
    renderRoute(<Register />, '/register');

    await userEvent.type(screen.getByLabelText(/email/i), 'pilot@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await userEvent.click(screen.getByRole('button', { name: /enlist|register/i }));

    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      email: 'pilot@example.com', password: 'hunter2hunter2',
    });
    expect(getToken()).toBe('step1.token');
    await screen.findByText('choose a username');
  });

  it('shows the server message when the email is taken', async () => {
    mockFetch(409, { code: 'EMAIL_TAKEN', message: 'An account with that email already exists.' });
    renderRoute(<Register />, '/register');

    await userEvent.type(screen.getByLabelText(/email/i), 'taken@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await userEvent.click(screen.getByRole('button', { name: /enlist|register/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
    expect(getToken()).toBeNull();
  });
});

describe('Login', () => {
  it('posts email, not a display handle', async () => {
    const f = mockFetch(200, { token: 'login.token', user: { id: 'usr_a', username: 'rick' } });
    renderRoute(<Login />, '/login');

    await userEvent.type(screen.getByLabelText(/email/i), 'rick@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      email: 'rick@example.com', password: 'hunter2hunter2',
    });
    await screen.findByText('the game');
  });

  it('routes a half-registered account to step 2 rather than the game', async () => {
    mockFetch(200, { token: 'half.token', user: { id: 'usr_h', username: null } });
    renderRoute(<Login />, '/login');

    await userEvent.type(screen.getByLabelText(/email/i), 'half@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await screen.findByText('choose a username');
  });
});

describe('ChooseUsername', () => {
  it('sends the bearer token and stores the fresh one', async () => {
    // The step-1 token cannot open a socket; only the token this call returns
    // can. Storing the old one would strand the player.
    setToken('step1.token');
    const f = mockFetch(200, { token: 'step2.token', user: { id: 'usr_a', username: 'rick' } });
    renderRoute(<ChooseUsername />, '/register/name');

    await userEvent.type(screen.getByLabelText(/username/i), 'rick');
    await userEvent.click(screen.getByRole('button', { name: /continue|confirm|choose/i }));

    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer step1.token');
    expect(getToken()).toBe('step2.token');
    await screen.findByText('the game');
  });

  it('reports a taken username without discarding the session', async () => {
    setToken('step1.token');
    mockFetch(409, { code: 'USERNAME_TAKEN', message: 'That username is already taken.' });
    renderRoute(<ChooseUsername />, '/register/name');

    await userEvent.type(screen.getByLabelText(/username/i), 'rick');
    await userEvent.click(screen.getByRole('button', { name: /continue|confirm|choose/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already taken/i);
    expect(getToken()).toBe('step1.token');
  });
});
```

Check `frontend/test/setup.ts` first — if `vi` is not injected globally there, add `import { vi } from 'vitest';` at the top of this spec.

- [ ] **Step 2: Run it and read the red**

```bash
cd frontend && npx vitest run test/routes/auth-screens.spec.tsx
```

Expected: FAIL — the three modules do not exist (or are the Task 9 placeholders).

- [ ] **Step 3: Build a shared form shell**

`frontend/src/routes/AuthForm.tsx` — the three screens differ only in fields and copy, and duplicating the terminal chrome three times guarantees they drift:

```tsx
import React from 'react';
import { Link } from 'react-router-dom';

interface Props {
  title: string;
  error: string | null;
  loading: boolean;
  submitLabel: string;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthForm({
  title, error, loading, submitLabel, onSubmit, children, footer,
}: Props): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black font-mono text-gray-100">
      <div className="w-96 px-4">
        <Link to="/" className="mb-6 block text-center text-xl uppercase tracking-widest text-yellow-400">
          Galactic Empire
        </Link>
        <p className="mb-4 text-center text-sm text-gray-500">{title}</p>
        <form onSubmit={onSubmit}>
          {error && <p role="alert" className="mb-3 text-sm text-red-400">{error}</p>}
          {children}
          <button
            type="submit"
            disabled={loading}
            className="w-full border border-yellow-600 py-1 text-yellow-400 hover:bg-yellow-900 disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </form>
        {footer && <div className="mt-4 text-center text-xs text-gray-600">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({
  id, label, type, value, onChange, autoComplete, hint,
}: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; autoComplete: string; hint?: string;
}): React.JSX.Element {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block text-sm text-gray-400">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="w-full border border-gray-600 bg-black px-2 py-1 text-gray-100"
      />
      {hint && <p className="mt-1 text-xs text-gray-600">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Write Register.tsx**

```tsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setToken } from '../auth/tokenStore';
import { AuthForm, Field } from './AuthForm';

/**
 * Step 1 of two: credentials only.
 *
 * Split so that "that email is taken" arrives before the player has invested in
 * choosing a name — wrong order is a bad first impression.
 */
export function Register(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setError((body.message as string | undefined) ?? 'Registration failed.');
        return;
      }
      setToken(body.token as string);
      navigate('/register/name');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthForm
      title="ENLIST — step 1 of 2"
      error={error}
      loading={loading}
      submitLabel="Enlist"
      onSubmit={handleSubmit}
      footer={<>Already flying? <Link to="/login" className="text-gray-400 underline hover:text-gray-200">Log in</Link></>}
    >
      <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field
        id="password" label="Password" type="password" value={password}
        onChange={setPassword} autoComplete="new-password" hint="At least 8 characters."
      />
    </AuthForm>
  );
}
```

- [ ] **Step 5: Write Login.tsx**

Same shape, posting to `/auth/login` with `autoComplete="current-password"`, title `"LOG IN"`, submit label `"Log in"`, footer linking to `/register`. Its navigation branches:

```tsx
      setToken(body.token as string);
      // A player who stopped after step 1 must finish it; sending them to /play
      // would bounce off RequireAuth and read as a broken login.
      const user = body.user as { username: string | null } | undefined;
      navigate(user?.username ? '/play' : '/register/name');
```

- [ ] **Step 6: Write ChooseUsername.tsx**

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken, setToken } from '../auth/tokenStore';
import { AuthForm, Field } from './AuthForm';

/**
 * Step 2 of two: the display handle, unique and permanent.
 *
 * The token returned here REPLACES the one from step 1. That one carries
 * username: null and WsAuthGuard refuses it, so keeping it would leave the
 * player registered and unable to enter the game.
 */
export function ChooseUsername(): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/auth/username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken() ?? ''}`,
        },
        body: JSON.stringify({ username }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setError((body.message as string | undefined) ?? 'Could not set that username.');
        return;
      }
      setToken(body.token as string);
      navigate('/play');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthForm
      title="ENLIST — step 2 of 2"
      error={error}
      loading={loading}
      submitLabel="Confirm"
      onSubmit={handleSubmit}
    >
      <Field
        id="username" label="Commander name" type="text" value={username}
        onChange={setUsername} autoComplete="username"
        hint="3–16 characters. This is how the galaxy will know you, and it cannot be changed."
      />
    </AuthForm>
  );
}
```

- [ ] **Step 7: Run the test — expect green**

```bash
cd frontend && npx vitest run test/routes/auth-screens.spec.tsx
```

- [ ] **Step 8: Delete AuthScreen**

```bash
cd frontend && rm src/auth/AuthScreen.tsx && ls test | grep -i auth
```

Delete any test file covering it, then confirm nothing still imports it:

```bash
cd frontend && grep -rn "AuthScreen" src test || echo "clean"
```

- [ ] **Step 9: Full frontend suite**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 10: Commit**

```bash
git add frontend/src frontend/test
git commit -m "$(cat <<'EOF'
feat(web): login, enlist, and commander-name screens

Registration is two screens so that "that email is taken" arrives before
the player has invested in choosing a name.

Step 2 replaces the stored token rather than keeping the one from step 1:
that token carries username: null and WsAuthGuard refuses it, so keeping
it would leave a player registered and unable to enter the game.

Login branches on whether the account has a username — sending a
half-registered player to /play would bounce off RequireAuth and read as
a broken login.

AuthScreen is deleted; its mode toggle is now two routes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz
EOF
)"
```

---

### Task 11: Logout

**Files:**
- Create: `frontend/src/auth/logout.ts`, `frontend/src/routes/SiteHeader.tsx`
- Modify: `frontend/src/onboarding/ShipSelectPrompt.tsx`
- Test: `frontend/test/routes/logout.spec.tsx`

**Interfaces:**
- Consumes: `tokenStore.clearToken`, `socket/socketClient`.
- Produces: `logout(): void`; `SiteHeader` component; `ShipSelectPrompt` gains an optional `onLogout?: () => void`.

- [ ] **Step 1: Write the failing test**

`frontend/test/routes/logout.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShipSelectPrompt } from '../../src/onboarding/ShipSelectPrompt';
import { setToken, getToken, clearToken } from '../../src/auth/tokenStore';
import { logout } from '../../src/auth/logout';

vi.mock('../../src/socket/socketClient', () => ({
  socket: { disconnect: vi.fn(), connected: true },
  connectSocket: vi.fn(),
  onSocketAuthFailed: vi.fn(),
}));

const SHIPS = [
  { index: 1, shipno: 1, className: 'Interceptor', shipname: 'Vraska', sector: { x: 0, y: 0 } },
  { index: 2, shipno: 2, className: 'Dreadnought', shipname: 'Korrin', sector: { x: 3, y: 4 } },
];

afterEach(() => clearToken());

describe('logout', () => {
  it('clears the stored token', () => {
    setToken('some.jwt.token');
    const assign = vi.fn();
    logout(assign);
    expect(getToken()).toBeNull();
  });

  it('sends the player to the front door', () => {
    setToken('some.jwt.token');
    const assign = vi.fn();
    logout(assign);
    expect(assign).toHaveBeenCalledWith('/');
  });
});

describe('ShipSelectPrompt', () => {
  it('offers a logout beneath the fleet', () => {
    // This is the only place inside the game that offers it. Logging out
    // disconnects the socket, which is warhupa — with cantexit > 0 that
    // destroys the hull. `x` has already run and enforced cantexit by the time
    // this screen appears.
    render(<ShipSelectPrompt ships={SHIPS} onSelect={vi.fn()} error={null} onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: /log ?out/i })).toBeInTheDocument();
  });

  it('calls onLogout when chosen', async () => {
    const onLogout = vi.fn();
    render(<ShipSelectPrompt ships={SHIPS} onSelect={vi.fn()} error={null} onLogout={onLogout} />);
    await userEvent.click(screen.getByRole('button', { name: /log ?out/i }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('still renders the fleet when no logout handler is supplied', () => {
    render(<ShipSelectPrompt ships={SHIPS} onSelect={vi.fn()} error={null} />);
    expect(screen.getByTestId('ship-select')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log ?out/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and read the red**

```bash
cd frontend && npx vitest run test/routes/logout.spec.tsx
```

Expected: FAIL — cannot resolve `../../src/auth/logout`.

- [ ] **Step 3: Write logout.ts**

```ts
import { clearToken } from './tokenStore';
import { socket } from '../socket/socketClient';

/**
 * End the session: drop the token, close the socket, return to the front door.
 *
 * Offered ONLY from the ship-select menu and the public header — never from the
 * live terminal. Closing the socket is canon's warhupa (GEMAIN.C:1397), which
 * destroys the hull when cantexit > 0. Reaching ship-select means `x` already
 * ran and enforced cantexit itself, answering CANTEXT when it could not.
 *
 * This mirrors canon's own two levels: `x` leaves Galactic Empire for the menu
 * (GEMAIN.C:2859 mnu_fightsub); logging off the BBS was a separate action.
 *
 * @param assign injected for tests; defaults to a real navigation.
 */
export function logout(assign: (url: string) => void = (url) => window.location.assign(url)): void {
  clearToken();
  try {
    socket?.disconnect();
  } catch {
    // A socket already closed is the normal case from ship-select. Never let it
    // block the navigation — a logout that half-runs is worse than either end.
  }
  assign('/');
}
```

- [ ] **Step 4: Add the option to ShipSelectPrompt**

Add `onLogout?: () => void;` to `Props`, accept it in the signature, and render after the `<input>`:

```tsx
      {onLogout && (
        <p className="mt-4 text-xs text-gray-600">
          <button
            type="button"
            onClick={onLogout}
            className="text-gray-400 underline hover:text-gray-200"
          >
            Log out
          </button>
        </p>
      )}
```

- [ ] **Step 5: Pass it from the terminal**

In `frontend/src/App.tsx`, find where `ShipSelectPrompt` is rendered and add `onLogout={() => logout()}`, importing `logout`.

- [ ] **Step 6: Write SiteHeader for the public pages**

`frontend/src/routes/SiteHeader.tsx`:

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { getToken } from '../auth/tokenStore';
import { logout } from '../auth/logout';

/** Shared nav for the public pages. Not rendered inside the terminal. */
export function SiteHeader(): React.JSX.Element {
  const signedIn = getToken() !== null;
  return (
    <header className="flex items-center justify-between border-b border-gray-800 px-4 py-3 font-mono text-sm">
      <Link to="/" className="uppercase tracking-widest text-yellow-400">Galactic Empire</Link>
      <nav className="flex gap-4 text-gray-400">
        <Link to="/stats" className="hover:text-gray-200">Status</Link>
        {signedIn ? (
          <>
            <Link to="/play" className="hover:text-gray-200">Play</Link>
            <button type="button" onClick={() => logout()} className="hover:text-gray-200">Log out</button>
          </>
        ) : (
          <>
            <Link to="/login" className="hover:text-gray-200">Log in</Link>
            <Link to="/register" className="text-yellow-400 hover:text-yellow-200">Enlist</Link>
          </>
        )}
      </nav>
    </header>
  );
}
```

- [ ] **Step 7: Run the tests — expect green**

```bash
cd frontend && npx vitest run test/routes/logout.spec.tsx && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src frontend/test
git commit -m "$(cat <<'EOF'
feat(web): log out — from the ship menu, not the bridge

The port had no logout at all. `x` is canon's mnu_fightsub exit
(GEMAIN.C:2859), which drops you to the ship-select menu; logging off the
BBS was a separate action at the outer menu, and only the inner half was
ever built.

Logout is offered from ship-select and the public header, and
deliberately nowhere inside the live terminal: it closes the socket, which
is warhupa (GEMAIN.C:1397), and with cantexit > 0 that destroys the hull.
Reaching ship-select means `x` already ran and enforced cantexit itself.

A socket that is already closed does not block the navigation — a logout
that half-runs is worse than either end of it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz
EOF
)"
```

---

### Task 12: Landing and Stats pages

**Files:**
- Create: `frontend/src/routes/Landing.tsx`, `frontend/src/routes/Stats.tsx`, `frontend/src/content/port-notes.ts`
- Modify: `frontend/index.html`
- Test: `frontend/test/routes/landing.spec.tsx`, `frontend/test/routes/stats.spec.tsx`

**Interfaces:**
- Consumes: Task 7's `/public/stats` shape, `SiteHeader`.
- Produces: `Landing`, `Stats`; `FAITHFUL: readonly string[]`, `CHANGED: readonly string[]`, `PORT_RELEASE = '3.2e'`, `PORT_RELEASE_DATE = '1994-08-06'`.

- [ ] **Step 1: Write the failing tests**

`frontend/test/routes/landing.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from '../../src/routes/Landing';
import { PORT_RELEASE, PORT_RELEASE_DATE, FAITHFUL, CHANGED } from '../../src/content/port-notes';

function renderLanding() {
  return render(<MemoryRouter><Landing /></MemoryRouter>);
}

describe('Landing', () => {
  it('names the game and its author', () => {
    renderLanding();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/galactic empire/i);
    expect(screen.getByText(/Mike Murdock/i)).toBeInTheDocument();
  });

  it('states exactly which release was ported', () => {
    // "a port of the BBS game" is not a claim anyone can check. The release and
    // its date are, and GEREADME.DOC is where they come from.
    renderLanding();
    expect(screen.getByText(new RegExp(PORT_RELEASE))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(PORT_RELEASE_DATE))).toBeInTheDocument();
  });

  it('lists what is faithful and what changed', () => {
    renderLanding();
    FAITHFUL.forEach((item) => expect(screen.getByText(item)).toBeInTheDocument());
    CHANGED.forEach((item) => expect(screen.getByText(item)).toBeInTheDocument());
  });

  it('offers a way in', () => {
    renderLanding();
    expect(screen.getByRole('link', { name: /enlist/i })).toHaveAttribute('href', '/register');
  });
});

describe('port-notes', () => {
  it('is honest about the galaxy size, which is the deviation players feel', () => {
    expect(CHANGED.join(' ')).toMatch(/201/);
  });
});
```

`frontend/test/routes/stats.spec.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Stats } from '../../src/routes/Stats';

function mockStats(body: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok, status: ok ? 200 : 500, json: async () => body,
  }) as unknown as typeof fetch;
}

function renderStats() {
  return render(<MemoryRouter><Stats /></MemoryRouter>);
}

const BODY = {
  commanders: 9,
  online: 2,
  roster: [
    { rank: 1, username: 'rick', score: '15345', kills: 31, planets: 3 },
    { rank: 2, username: 'vraskcmdr', score: '900', kills: 2, planets: 0 },
  ],
};

describe('Stats', () => {
  it('shows the counts', async () => {
    // Scoped to the counts block on purpose: '2' is also the rank cell of the
    // second roster row, and an unscoped getByText('2') matches both and throws.
    mockStats(BODY);
    renderStats();
    const counts = await screen.findByTestId('stat-counts');
    expect(counts).toHaveTextContent('9');
    expect(counts).toHaveTextContent('2');
  });

  it('renders every roster row', async () => {
    mockStats(BODY);
    renderStats();
    expect(await screen.findByText('rick')).toBeInTheDocument();
    expect(await screen.findByText('15345')).toBeInTheDocument();
    expect(await screen.findByText('vraskcmdr')).toBeInTheDocument();
  });

  it('says so plainly when nobody has scored yet', async () => {
    // A launch-day board is empty. An empty table with headers reads as broken.
    mockStats({ commanders: 1, online: 0, roster: [] });
    renderStats();
    expect(await screen.findByText(/no one has scored yet/i)).toBeInTheDocument();
  });

  it('shows an error instead of hanging when the server is down', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    renderStats();
    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable|could not/i);
  });

  it('polls rather than freezing on first paint', async () => {
    vi.useFakeTimers();
    mockStats(BODY);
    renderStats();
    await vi.advanceTimersByTimeAsync(30_000);
    await waitFor(() => expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1));
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run them and read the red**

```bash
cd frontend && npx vitest run test/routes/landing.spec.tsx test/routes/stats.spec.tsx
```

Expected: FAIL — `src/content/port-notes` does not exist; `Landing`/`Stats` are Task 9 placeholders.

- [ ] **Step 3: Write the content module**

`frontend/src/content/port-notes.ts`:

```ts
/**
 * Landing-page copy about the port itself.
 *
 * Sourced from docs/DECISIONS.md (119 entries, curated to these) and
 * GE/DOCS/GEREADME.DOC. Kept in one module so the claims can be reviewed as a
 * set rather than hunted through JSX — every line here is a promise to a player.
 */

/** @see reference/ge-upstream/mbmgemp/GE/DOCS/GEREADME.DOC */
export const PORT_RELEASE = '3.2e';
export const PORT_RELEASE_DATE = '1994-08-06';

export const FAITHFUL: readonly string[] = Object.freeze([
  'Every balance constant is read from the original C source and pinned by a test that re-reads it.',
  'The ship class table is generated from MBMGESHP.MSG, the same file the 1994 server loaded at boot.',
  'Combat math — phaser falloff, tonnage division, shield absorption, torpedo bleed-through — is ported line for line.',
  'The 6-second physics tick and the 1-second movement tick are the original timings, including the quirk that shields regenerate on the slow one.',
  'Cybertrons escalate with your kill count exactly as GECYBS.C does, and go mean at 30 kills.',
  'The text you read in play is the original message file, not a rewrite.',
]);

export const CHANGED: readonly string[] = Object.freeze([
  'The galaxy is 201 sectors square rather than 601 — a smaller world so players can find each other.',
  'Colonists eat as well as troops, so a planet has to be fed to grow.',
  'Function keys are typed commands (fset f1 pha 0 0, then f1) because a browser cannot claim F11 or F12.',
  'You log in with an email address; the original used a BBS account.',
  'There is a web terminal instead of a modem, and the game runs continuously rather than while the BBS is up.',
  'A handful of messages the original never printed have been added where silence read as a bug; each is listed in the project decision log.',
]);
```

- [ ] **Step 4: Write Landing.tsx**

Terminal aesthetic, `SiteHeader` at the top, an `<h1>`, the history paragraph naming Mike Murdock and MajorBBS, a line stating `PORT_RELEASE` and `PORT_RELEASE_DATE`, two `<ul>`s over `FAITHFUL` and `CHANGED`, a short command primer (`sca`, `war 5`, `pha 75`, `hel`), and an `<a href="/register">Enlist</a>` — a plain `Link` to `/register` so the test's `href` assertion holds. Wrap body text in `max-w-3xl mx-auto px-4` and use `border-gray-800` rules rather than box-drawing characters for the section dividers, so the layout survives narrow screens.

- [ ] **Step 5: Write Stats.tsx**

```tsx
import React, { useEffect, useState } from 'react';
import { SiteHeader } from './SiteHeader';

interface RosterEntry {
  rank: number; username: string; score: string; kills: number; planets: number;
}
interface PublicStats { commanders: number; online: number; roster: RosterEntry[] }

/** Server caches for 15s; polling faster would only re-read the same cache. */
const POLL_MS = 20_000;

export function Stats(): React.JSX.Element {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const res = await fetch('/public/stats');
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as PublicStats;
        if (!cancelled) { setStats(body); setError(null); }
      } catch {
        // Keep the last good numbers on screen; a transient blip should not
        // blank a page someone is reading.
        if (!cancelled) setError('Status is unavailable right now.');
      }
    }

    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  return (
    <div className="min-h-screen bg-black font-mono text-gray-100">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-lg uppercase tracking-widest text-yellow-400">Galaxy status</h1>

        {error && <p role="alert" className="mb-4 text-sm text-red-400">{error}</p>}

        {stats && (
          <>
            <dl className="mb-8 flex gap-12" data-testid="stat-counts">
              <div>
                <dt className="text-xs uppercase text-gray-500">Commanders</dt>
                <dd className="text-2xl text-yellow-400">{stats.commanders}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">In flight now</dt>
                <dd className="text-2xl text-yellow-400">{stats.online}</dd>
              </div>
            </dl>

            <h2 className="mb-2 text-sm uppercase tracking-widest text-gray-400">Roster</h2>
            {stats.roster.length === 0 ? (
              <p className="text-sm text-gray-500">No one has scored yet. The galaxy is wide open.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="py-1 text-left">#</th>
                      <th className="py-1 text-left">Commander</th>
                      <th className="py-1 text-right">Score</th>
                      <th className="py-1 text-right">Kills</th>
                      <th className="py-1 text-right">Planets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.roster.map((r) => (
                      <tr key={r.username} className="border-t border-gray-900">
                        <td className="py-1">{r.rank}</td>
                        <td className="py-1 text-yellow-400">{r.username}</td>
                        <td className="py-1 text-right">{r.score}</td>
                        <td className="py-1 text-right">{r.kills}</td>
                        <td className="py-1 text-right">{r.planets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests — expect green**

```bash
cd frontend && npx vitest run test/routes/landing.spec.tsx test/routes/stats.spec.tsx
```

- [ ] **Step 7: Set the document title**

In `frontend/index.html`:

```html
    <title>Galactic Empire Reborn — the 1988 BBS game, rebuilt</title>
    <meta name="description" content="A faithful web port of Galactic Empire, Mike Murdock's 1988 MajorBBS game. Command a starship in a persistent galaxy that never stops running." />
```

- [ ] **Step 8: Full suite, both sides**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
cd ../backend && npx tsc --noEmit && npx jest
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src frontend/test frontend/index.html
git commit -m "$(cat <<'EOF'
feat(web): landing page and public galaxy status

The landing page states which release was ported — 3.2e, 1994-08-06, per
GEREADME.DOC. "A port of the BBS game" is not a claim anyone can check;
that is.

Faithful and changed are curated from 119 DECISIONS.md entries into one
content module rather than scattered through JSX, so the claims can be
reviewed as a set. Every line is a promise to a player, and the changed
list leads with the 201-square galaxy because that is the deviation a
player actually feels.

Stats keeps the last good numbers when a poll fails — a transient blip
should not blank a page someone is reading — and says the board is empty
in words, because an empty table with headers reads as broken.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz
EOF
)"
```

---

### Task 13: Deployment notes and living docs

**Files:**
- Create: `docs/DEPLOYMENT.md`
- Modify: `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`

**Interfaces:** consumes everything above; produces no code.

`DECISIONS.md` and `PROGRESS.md` are **append-only**. Add new dated entries; annotate anything superseded in place with CORRECTION or AMENDED. Never rewrite history.

- [ ] **Step 1: Write docs/DEPLOYMENT.md**

Cover: the two processes (Nest on `:3000`, static `frontend/dist`); nginx with `try_files $uri $uri/ /index.html;`; proxying `/auth`, `/public`, `/socket.io` (the last needing `Upgrade`/`Connection` headers for WebSockets); required env (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `MIDNIGHT_*`); `npx prisma migrate deploy` on release, never `migrate dev`; and **`GE_DEBUG_ENDPOINTS` must be unset in production** — `main.ts` warns that those routes are unauthenticated and can teleport or bankroll any ship. Mark the file as a first draft to be corrected against the real server.

Example nginx block:

```nginx
location / { try_files $uri $uri/ /index.html; }

location ~ ^/(auth|public)/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location /socket.io/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
```

- [ ] **Step 2: Append to docs/DECISIONS.md**

One dated entry per the file's format (`**Context:** / **Decision:** / **Reason:** / **Alternatives rejected:**`) for each of: email as the credential with a partial lower() index; two-step registration and the nullable username guarded by `WsAuthGuard`; logout as site chrome rather than a game command, with the `warhupa` reasoning; the roster query extracted from `ros` — including the CORRECTION that the design first named `rank-roster.ts` and was wrong; and the 10-day abandoned-signup sweep as PORT-ORIGINAL.

- [ ] **Step 3: Append to docs/PROGRESS.md**

One dated entry: what was built, tests added at each level, decisions made, what comes next, and the known issues — no email is ever sent, the marketing copy is not crawlable, and `PresenceService` is process-local so a restart shows zero online until players reconnect.

- [ ] **Step 4: Update ARCHITECTURE.md and DATA_MODEL.md**

Add `PublicModule` (StatsController → StatsService → PresenceService, fed by GameGateway) and the frontend route table to the module map. In `DATA_MODEL.md`, describe `User.email`, `emailVerifiedAt` and the now-nullable `username` in plain English, including what a null username means and that midnight sweeps it at 10 days.

- [ ] **Step 5: Verify the whole stack once more**

```bash
cd backend && npx tsc --noEmit && npx jest
cd ../frontend && npx tsc --noEmit && npx vitest run && npm run build
```

The frontend `build` must pass — it is the artefact nginx serves, and it type-checks more strictly than `vitest`.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "$(cat <<'EOF'
docs: deployment notes and living docs for the public web presence

DEPLOYMENT.md is a first draft to be corrected against the real <panel>
server. It records the two things easiest to get wrong: try_files, without
which every deep link 404s, and the Upgrade headers, without which the
socket silently falls back to polling.

It also states that GE_DEBUG_ENDPOINTS must be unset in production. Those
routes take a ship name, have no authentication, and can teleport,
re-hull or bankroll anything in the galaxy.

DECISIONS.md records the roster-query correction: the design said to reuse
midnight/rank-roster.ts, which neither ranks for `ros` nor is used by it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz
EOF
)"
```

---

## Self-Review

**Spec coverage.** §1 routing → Task 9. §2 email/schema → Tasks 1–2. §3 two-step + `WsAuthGuard` → Tasks 3–4, 10. §3 sweep → Task 8. §4 logout → Task 11. §5 stats (roster/counts/presence/cache) → Tasks 5–7, 12. §6 landing → Task 12. §7 testing → distributed. §8 out-of-scope → nothing implements it, as intended. Deployment → Task 13.

**Type consistency.** `AuthResult.user.username` is `string | null` from Task 2 and used as such in Tasks 3 and 10. `verifyJwt` widens in Task 4 while `WsJwtPayload.username` stays `string`. `ROSTER_WHERE`/`ROSTER_ORDER_BY` are named identically in Tasks 5 and 7. `PublicRosterEntry.score` is a string in Task 7 and consumed as one in Task 12. `PresenceService.count()` is the only method Task 7 calls.

**Known risks, called out rather than papered over.**
1. Task 1 splits the schema change and the raw index across two migrations specifically to avoid `migrate reset`. The database holds a live playtest (rick: 15,345 score, 31 kills, 3 planets). If Prisma ever offers to reset, stop.
2. The real name of the username unique index is discovered in Task 1 step 3; Tasks 3 and 8 use `user_username_lower_key` as a placeholder and must be corrected to whatever that grep returns.
3. Task 3 step 6 depends on how `jwt.strategy.ts` names the userid on `req.user`; the step says to match it rather than rename the strategy.
4. Task 9 creates placeholder route components so the tree compiles before Tasks 10–12 fill them in — deliberate, and each is replaced in its own task.
