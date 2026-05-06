# Contract — HTTP Auth

Two endpoints. Both return JSON. Both reject with `application/json`
problem-shaped errors (`{ code, message }`).

## POST /auth/register

Create a new user. Returns a JWT bound to the new user's id.

**Request body**:
```json
{ "username": "Goliath", "password": "correct horse battery staple" }
```

**Validation**:
- `username`: 3–16 printable ASCII (`/^[\x21-\x7E]{3,16}$/`); 400 on
  violation with `code: "INVALID_USERNAME"`.
- `password`: 8–72 bytes; 400 on violation with `code: "INVALID_PASSWORD"`.

**Responses**:

| Status | Body | When |
|--------|------|------|
| 201 | `{ "token": "<jwt>", "user": { "id": "<userid>", "username": "Goliath" } }` | Created |
| 400 | `{ "code": "INVALID_USERNAME" \| "INVALID_PASSWORD", "message": "..." }` | DTO validation |
| 409 | `{ "code": "USERNAME_TAKEN", "message": "Username already taken." }` | Case-insensitive collision |

**Side effects**:
- Inserts a `User` row with `passwordHash = bcrypt.hash(password, 12)` and
  `userid = <generated>` (collision-free; e.g. uuid-style or username-based
  with case suffix). The `userid` is the persistent PK; `username` is the
  display handle.
- No ship is created. `cmd_new` runs at first WebSocket connect.

## POST /auth/login

Authenticate an existing user. Returns a JWT.

**Request body**:
```json
{ "username": "goliath", "password": "correct horse battery staple" }
```

**Validation**: Same DTO rules as `/auth/register`.

**Responses**:

| Status | Body | When |
|--------|------|------|
| 200 | `{ "token": "<jwt>", "user": { "id": "<userid>", "username": "Goliath" } }` | OK — note casing returned is the stored verbatim casing, not the request casing |
| 400 | `{ "code": "INVALID_USERNAME" \| "INVALID_PASSWORD" }` | DTO validation |
| 401 | `{ "code": "INVALID_CREDENTIALS", "message": "Invalid username or password." }` | Wrong username OR wrong password — same error to avoid user enumeration |

**Constant-time semantics**: The handler MUST run a bcrypt compare even
when the user does not exist (against a fixed dummy hash) so that timing
does not leak existence.

## JWT shape

```text
Header:  { "alg": "HS256", "typ": "JWT" }
Payload: { "sub": "<userid>", "username": "Goliath", "iat": ..., "exp": iat + 30d }
```

- `sub` is the canonical identifier used everywhere downstream.
- Secret comes from `ConfigService.get('JWT_SECRET')`; missing/empty at
  boot → fail-fast (process refuses to start).
- No refresh token, no revocation list.

## Out of scope

- Password reset / forgot-password flow.
- Email verification.
- Account deletion.
- Rate limiting (operationally added at the reverse proxy).
