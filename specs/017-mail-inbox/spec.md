# Feature Specification: Mail Inbox

**Feature Branch**: `017-mail-inbox`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: "Add the player mail inbox: list mail, read a message by index, delete a message."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - List inbox (Priority: P1)

A player wants to see what mail has accumulated for them — production reports from their planets and distress signals from planets under attack. They type `mai` and get a numbered list of every message currently stored for them, sorted with newest first.

**Why this priority**: Without listing, the other operations have no entry point. The midnight job and planet attack code already write `MailStat` rows; they are invisible to players until this command exists.

**Independent Test**: Seed two `MailStat` rows for a player (one production report, one distress) and verify `mai` displays both with 1-based indices, mail type label, sender, topic, and date — newest first.

**Acceptance Scenarios**:

1. **Given** a player has zero `MailStat` rows, **When** they type `mai`, **Then** they see a "no mail" message and no list.
2. **Given** a player has 3 `MailStat` rows of mixed classes, **When** they type `mai`, **Then** they see a numbered list (1, 2, 3) with each row showing type label (e.g. "Production Report" / "Distress Signal"), sender, topic, and date — sorted newest first.
3. **Given** a player has mail from a sender whose ship/account is no longer reachable, **When** they type `mai`, **Then** the list still renders that row using the stored sender userid as a fallback display.
4. **Given** a player types `mai <password>`, **When** the password matches the maintenance gate (FR-210, feature 014), **Then** the maintenance gate handles the command and the inbox list is NOT shown.

---

### User Story 2 - Read a message (Priority: P1)

A player has run `mai` and sees mail #2 is a distress signal. They type `rea 2` and see the full details — attacker ship name, planet name, sector coordinates, timestamp — formatted appropriately for the message class.

**Why this priority**: Listing without reading delivers no information. Players need the body of each message to act on it.

**Independent Test**: With two seeded messages of different classes, `rea 1` and `rea 2` each render a class-appropriate detail view including all stored fields relevant to that mail type.

**Acceptance Scenarios**:

1. **Given** a player has 2 messages and types `rea 1`, **When** message 1 is a production report, **Then** the detail view shows planet name, financial figures (cash/debt/tax), item quantities, and the date.
2. **Given** a player has 2 messages and types `rea 2`, **When** message 2 is a distress signal, **Then** the detail view shows attacker ship name, planet name under attack, sector coordinates, and the date.
3. **Given** a player types `rea` with no index, **Then** the system shows usage guidance.
4. **Given** a player types `rea 99` and has only 3 messages, **Then** the system shows an "invalid message" error and no detail.
5. **Given** a player types `rea 0` or `rea -1`, **Then** the system rejects the index (1-based only).

---

### User Story 3 - Delete a message (Priority: P2)

After reading a message and acting on it, a player wants to clear it from their inbox. They type `del 2` and the message is permanently removed; subsequent `mai` calls renumber remaining messages.

**Why this priority**: Inboxes grow unbounded otherwise. The midnight job purges mail older than 7 days globally, but per-message deletion is the primary user-driven housekeeping action.

**Independent Test**: With 3 seeded messages, `del 2` removes the second; the next `mai` shows 2 remaining messages with new 1-based indices, and the deleted row is gone from `MailStat`.

**Acceptance Scenarios**:

1. **Given** 3 messages, **When** the player types `del 2`, **Then** the second message is permanently removed and a confirmation is shown.
2. **Given** 3 messages and a successful `del 2`, **When** the player runs `mai`, **Then** the remaining 2 messages are displayed with renumbered indices 1 and 2.
3. **Given** the player types `del 99` with only 3 messages, **Then** the system shows an "invalid message" error and no row is deleted.
4. **Given** the player types `del` with no index, **Then** the system shows usage guidance.

---

### Edge Cases

- Player has many messages (e.g. 50+) — list must remain readable; assume no pagination is required at this scale, but ordering must be deterministic.
- Two messages share the same `msgno` value across different `class` values — indexing is by the player's combined sorted view, not per-class.
- Sender userid in `dtime` no longer corresponds to any active ship or account — display falls back to the raw userid string.
- A `MailStat` row for the player is deleted by the midnight 7-day purge between the `mai` listing and a follow-up `rea`/`del` — operation reports "invalid message" rather than crashing.
- Concurrent commands: player runs `del 2` twice in rapid succession — second invocation reports "invalid message" against the renumbered list.

## Clarifications

### Session 2026-05-07

- Q: Should `mai` track read/unread state, or list all messages every time? → A: Show all messages every time; no read-state tracked (matches original BBS)
- Q: How should production reports vs distress signals differ in the `mai` LIST view? → A: Only the type label differs; sender/topic/date columns are class-agnostic
- Q: What sort key yields "newest first" given `msgno` is per-class? → A: Sort by stamp desc, then `msgno` desc as tiebreaker

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `mai` command that lists all `MailStat` rows where `userid` matches the issuing player.
- **FR-002**: The list MUST be sorted with newest messages first; sort key is `stamp DESC, msgno DESC, class DESC` — `msgno` descending as the primary tiebreaker and `class` descending as the final tiebreaker for determinism when stamp and msgno collide across classes. `msgno` alone is not a reliable cross-class ordering since it is scoped per (userid, class).
- **FR-003**: The list MUST present 1-based indices stable within a single command invocation.
- **FR-004**: Each list row MUST show: index, mail type label, sender display name, topic, and date.
- **FR-005**: System MUST distinguish at minimum two mail classes in the type label: production report (class 3) and distress signal.
- **FR-006**: System MUST resolve the sender field (`dtime`, which holds a userid) to a human-readable name when possible (e.g. ship name from active state or persistent user record), falling back to the raw userid when no resolution is available. When `dtime` is the empty string, display falls back to the literal `(system)`.
- **FR-007**: System MUST provide a `rea <index>` command that displays the full detail of the message at that 1-based index in the most recent ordering.
- **FR-008**: The `rea` detail view MUST render fields appropriate to the message class — e.g. financial figures and item quantities for production reports, attacker ship name and sector coordinates for distress signals.
- **FR-009**: System MUST provide a `del <index>` command that permanently removes the message at the 1-based index from `MailStat`.
- **FR-010**: After a successful `del`, the next `mai` invocation MUST renumber the remaining messages starting at 1.
- **FR-011**: `rea` and `del` with a missing, non-numeric, zero, negative, or out-of-range index MUST show an error and make no state change.
- **FR-012**: `mai` with a single argument matching the maintenance password MUST defer to the maintenance gate (FR-210, feature 014) and not list mail; `mai` with no argument MUST list mail.
- **FR-013**: System MUST NOT modify `MailStat` rows during `mai` or `rea` (read-only operations on the inbox); only `del` may remove rows.
- **FR-014**: System MUST NOT track per-message read state. `mai` always lists all of the player's `MailStat` rows; deletion is the only mechanism to remove a message from the listing. This matches original BBS behavior and keeps `MailStat` schema unchanged.
- **FR-015**: The `mai` list view MUST use a single class-agnostic column layout (index, type label, sender, topic, date). Class-specific payload fields (financials, sector coordinates, etc.) MUST appear only in the `rea` detail view, not in the list.

### Key Entities

- **MailStat row** (existing): Persistent mail record. Composite primary key is recipient userid + mail class + msgno. Carries class-specific payload fields (financial figures and item quantities for production reports; attacker ship name, planet name, sector coordinates for distress signals). Sender userid is stored in the `dtime` field. Already written by midnight production-report job and planet attack distress signals.
- **Mail listing** (derived, in-memory): The sorted, 1-based-indexed view of a player's `MailStat` rows produced by `mai`. Index is ephemeral — valid only within the player's current session ordering and must be recomputed for `rea`/`del`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player with mail can list, read, and delete a message using only the three commands `mai`, `rea`, `del` — no other commands or interfaces required.
- **SC-002**: 100% of existing `MailStat` rows written by the midnight job and planet attack service are listable and readable via the new commands without schema migration of those writers.
- **SC-003**: After deletion, the row is absent from both subsequent `mai` listings and a direct database query — no soft-delete state remains visible.
- **SC-004**: Indices shown in `mai` are stable and correctly resolve to the same row when used immediately in `rea` or `del`, with no off-by-one errors across mixed-class inboxes.
- **SC-005**: Maintenance-password invocations of `mai` (feature 014, FR-210) continue to work unchanged after this feature ships — no regression in the maintenance gate path.
- **SC-006**: Listing and reading complete fast enough to feel instantaneous on a typical inbox (under ~50 messages); deletion confirms within the same response.

## Assumptions

- The `MailStat` schema is fixed by features 009 (midnight job) and 014 (planet attack distress) and will not be modified by this feature unless FR-014 clarification requires a `readAt` field.
- `MAIL_CLASS_PRODRPT = 3` is established. The `MAIL_CLASS_DISTRESS` numeric value will be confirmed against `GEMAIN.H` / `GECMDS.C` during the planning phase; it is a technical lookup, not a scope question.
- Indices are 1-based, matching the original BBS UX and the rest of this project's command conventions.
- `rea` with no index shows usage rather than defaulting to message 1, to keep behavior unambiguous.
- The `mai` keyword is shared with the maintenance-password gate (FR-210); presence of any argument routes to the maintenance handler, absence routes to the inbox list.
- The midnight job's existing 7-day mail purge remains the global retention policy; this feature does not change retention.
- Only the recipient (the player whose `userid` matches `MailStat.userid`) can list, read, or delete their own mail — no admin or cross-player access in scope.
- Sender display name resolution prefers active `ShipState` ship name, falling back to a persistent user/ship record, and finally to the raw `dtime` userid string when no other source is available.
- No new mail types are added in this feature; only the two existing classes (production report, distress signal) need rendering.
- No frontend-specific UI work is in scope beyond what the existing terminal command pipeline already provides; this is a backend command feature.
