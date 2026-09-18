# The public site — landing page, stats, and the player's guide

Scoped to `backend/src/public/`.

## The guide — only one part of it can rot

The public guide at `/guide` is GENERATED from `CANON_HELP`, the same help the
game serves to `hel`. Command and concept pages need no maintenance and must
not be hand-edited: two hand-written descriptions of one game is how a wiki
ends up contradicting the game it documents.

**The one hand-maintained part is `GUIDE_DEVIATIONS`** in
`backend/src/public/guide.ts` — the notes saying where this port differs from
the original, which canon cannot know.

**When you add a deviation to `docs/DECISIONS.md`, ask whether a player would
notice it. If they would, add it to `GUIDE_DEVIATIONS` on the page they would
be reading when it bites.** A deviation a player meets in play and cannot find
documented makes every other claim on the site less believable — and the
landing page explicitly promises we are honest about these.

Keep the notes short and concrete: what differs, and the original's value. A
test asserts every entry attaches to a slug that exists, because a note on an
unreachable page is a note nobody reads.

`GUIDE_CORRECTIONS`, in the same file, is a SEPARATE list for where the
original's help is wrong about the original's own code. Keep the two apart:
one says "we changed this", the other says "the original was wrong about
itself and we follow its code". Conflating them either accuses the original of
our change or claims credit for behaviour that was always canon. A page can
carry both — `planets` does.

That list exists because canon's help states INTENT and its C source states
truth. `HLPPLANT` claims items transferred to a planet "cannot" be transferred
back; `HLPTRA` documents `transfer up` and `GECMDS.C trans_up` implements it.
When play turns up another of these, check the C source, follow it, and add
the note rather than editing canon's text — the text is the historical record.

If a new canon help topic becomes reachable, add it to `CONCEPTS` or `COMMANDS`
in the same file — those lists decide what appears, not `CANON_HELP` itself.


## The changelog — hand-written, and the one file that must not go stale

`changelog.ts` is the second hand-maintained file here, and unlike the guide it
has no generator behind it. **Write the entry in the same commit as the change,
next to the `VERSION` bump**, in the language of somebody who plays the game
rather than somebody who reads the diff.

Pick the category deliberately; they exist to stay apart, for the same reason
`GUIDE_DEVIATIONS` and `GUIDE_CORRECTIONS` do above:

| category | means |
|---|---|
| `port-bug` | we broke it, we fixed it — nothing to do with the original |
| `corrected-to-canon` | we had drifted; this matches the original again |
| `deliberate-deviation` | we knowingly differ, and the entry says what the original did |
| `canon-was-wrong` | the original's help contradicts its own code, and we follow the code |
| `port-original` | something the 1988 game never had — the guide, the calculators, f-keys, this page |

A release with nothing to tell a player goes in `SILENT_RELEASES` with a reason.
`test/public/changelog.spec.ts` fails on a `VERSION` that appears in neither, so
forgetting is loud rather than silent — which is the entire point, because a
changelog that lags is worse than none.

Entries are rendered as PLAIN TEXT. Backticks and markdown reach the browser as
literal punctuation; a backtick did exactly that on the first run.

## Known limits of this directory, deliberately accepted

- **The marketing copy is not crawlable.** The landing page ships as
  client-rendered JavaScript inside the existing SPA. There is a real `<title>`
  and description meta in `index.html`, but no server-rendered HTML for a search
  crawler. Accepted as the cost of reusing the frontend rather than standing up
  a separate static site.
- **`PresenceService` is process-local.** The online count is an in-memory
  `Set<userid>` fed by socket connect and disconnect. A backend restart empties
  it, so every connected player reads as offline in `/public/stats` until they
  reconnect. There is no restart-surviving presence store, deliberately: the
  root `CLAUDE.md` rules out Redis and any external cache layer.
- **`/public/stats` reports `VERSION` and the short git SHA.** Both are baked in
  at build time. If you add a new deployable image or build path, wire `GIT_SHA`
  and `APP_VERSION` through it. A version that silently falls back to `dev` in
  production is worse than none, because it looks like it is working.
