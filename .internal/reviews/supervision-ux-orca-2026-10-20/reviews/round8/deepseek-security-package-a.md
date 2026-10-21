## Security review — round 8 package A: verdict “no blocking issue” (no HIGH/CRITICAL)

Basis: I read the current file contents (no shell tool in this session, so I could not run `git diff HEAD`; line numbers are from the working tree). No files modified.

### [SEVERITY: MEDIUM] — Enrollment trusts a renderer-supplied (directory, sessionID) pair
**Location:** `desktop/packages/electron/src/desktop-webmcp-browser.js:411-421, 445-492`
**Category:** Broken access control / confused deputy
**Why:** `create` only format-checks `sessionID`, and `enable`/`resume` require merely that `entry.sessionID` is non-null. Nothing binds that session to `entry.directory`, or proves it still exists.
**Scenario:** any script running in the app origin calls `desktop_webmcp_browser {action:"enable", id, }` after creating a browser with a *victim* `sessionID` plus an attacker-chosen page. Main then POSTs `/provider` for that session, so an agent working in session X drives this pane. Exploitability depends on the local runtime rejecting a mismatched pair — unverifiable from this repo, hence MEDIUM not HIGH.
**Fix:** before `POST /provider`, confirm the session belongs to `entry.directory` (reuse the runtime’s session lookup), and reject unknown sessions instead of enrolling an orphan provider.

### [SEVERITY: LOW] — Pause does not cancel an already-dispatched page operation
**Location:** `desktop/packages/electron/src/native-webmcp.js:113-118` vs `:270-274, 307`
**Why:** `revoke()` cancels only `this.pending` (native invokes); page `read`/`act`/`wait` live in `activePageRequestId`, and `assertActive()` only consults `canceledPageRequests`. `revoke()` never populates it.
**Scenario:** hide/minimize/zero-bounds (`pause` → `disconnect` → `revoke`) while a `wait` (bounded by `request.deadline`) or an `act` script is in flight: the provider, polling and element refs are revoked synchronously, but that one script keeps running and only its reply is suppressed.
**Fix:** in `revoke()` add `activePageRequestId` to `canceledPageRequests`, and have `assertActive()` also compare `this.generation` to `request.generation`.

### [SEVERITY: LOW] — Unbounded `sessionID` length at the IPC boundary
**Location:** `desktop-webmcp-browser.js:416-417`
**Why:** main accepts `^ses_[A-Za-z0-9_-]+$`; the renderer validates `{1,200}` (`useWebMcpBrowserStore.ts:152`). A multi-MB id is stored and forwarded to the runtime.
**Fix:** use `^ses_[A-Za-z0-9_-]{1,200}$`.

### [SEVERITY: LOW] — Persisted address keeps path-borne tokens
**Location:** `desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts:131-142`
**Why:** query, fragment and userinfo are stripped (as documented) and only http/https pass, but magic-link paths (`/reset/<token>`) still land in `localStorage` for 64 entries.
**Fix:** accept as documented residual risk, or drop path segments with high-entropy/base64 shapes before storing.

**Direct answers:** tampered storage cannot inject `javascript:`/`file:`/`data:` (protocol allowlist on read, re-checked by `allowedUrl` on `create`), cannot break the app (all reads `try`/parsed, invalid entries dropped), and is bounded at 64 entries/200 KB re-validated on every read. Cross-project injection requires write access to the app renderer’s storage (no page in the guest partition can reach it) and is keyed by exact normalized directory + session. Error reporting uses a fixed code allowlist — no native message text or URL crosses IPC; full `status.url` (query/fragment included) goes only to the trusted renderer and is stripped before persistence. `pause` revokes provider, polling and element refs before returning; the only gap is finding 2.
## Disposition (Claude)

1. MEDIUM, deferred to the runtime (proposal R6): enrollment trusting the renderer's (directory, session) pair predates package A.
   The renderer is the app's own code under the strict renderer CSP; session ownership is the runtime's to enforce, so the runtime
   should reject a provider enrollment whose session does not belong to the directory. Recorded in the PRD runtime proposals.
2. LOW, fixed: withdrawing access (`disconnect`, which pause uses) now marks a running read/act/wait canceled, so its next checkpoint
   stops it; a navigation the act itself caused still does not cancel it. Test "withdrawing access stops an act that is already
   running before it can type"; mutation probe (no cancel) fails it.
3. LOW, fixed: the IPC session id is limited to 200 characters, matching the renderer.
4. LOW, accepted residual risk: path segments can carry tokens (magic links). Query, fragment and user info are already removed and
   the history is bounded; heuristics on path entropy would misfire on ordinary paths.
