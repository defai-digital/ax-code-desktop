# Orca gap discussion (2026-10-19)

Status: Evidence for PRD-2026-10-19-trusted-supervision-v1. Nothing here changes an accepted record.

Method: the author read the Orca reference clone (`.internal/reference/orca`, snapshot of 2026-10-19) and today's
competitive review, then asked Grok and Muse the same read-only questions (`raw/brief.md`). Their full answers are in
`raw/grok.md` and `raw/muse.md`. Neither changed a file. The author re-checked the claims below against the code.

## Agreement

- Do not try to be Orca. It is an agent-neutral terminal host with a hosted relay and a phone client; that breaks the
  boundary in AGENTS.md. The winnable category is supervision a team can audit.
- Odds of passing Orca's 88 on the eight-criterion review within 90 days: about 25% (Grok) and 30% (Muse). On the
  six-dimension score the gap is reach, and the odds are about 10% (Grok).
- Start with the goal state on supervision rows, end-to-end journeys for approve, deny and refused worktree creation, and
  the remaining web-document CSP allowance. Read-only phone supervision comes after them.

## Re-checked by the author

| Claim | Result |
| --- | --- |
| The pinned SDK 2.6.37 exposes the goal route | Confirmed: `session.goal` route and `EventSessionGoal` in the SDK types |
| Desktop has no caller for it | Confirmed: no `goal` consumer in `desktop/packages/ui/src` outside prompts |
| The goal is a verification contract | Narrowed: the SDK exposes objective, status, budgets and plan path, not verification |
| Orca falls back to a plaintext token file without a keyring | Confirmed: `src/main/integration-credential-file.ts`, 0600 plaintext |
| Orca writes other vendors' trust files | Confirmed: `src/main/agent-trust-presets.ts` (Cursor `.workspace-trusted`, Copilot `trustedFolders`) |
| Orca has about 45 retention audits | Confirmed in `docs/audits/` (dozens of measured leaks) |
| Orca has about 1,100 e2e files | Overstated: reviewers counted 554 specs and 981 files, many skipped by platform |
| Orca ships 7 locales | Wrong: 6 built-in locales |
| The web document still allows `'unsafe-inline'` scripts | Confirmed: `response-headers.js` `buildWebServerCsp` |
| The renderer direction is hard-coded LTR | Wrong: `1601929f` sets the document direction from the locale |

## Not resolved

Orca's production renderer CSP could not be read from source (a comment says electron-vite injects it). Whether Orca
publishes per-version rollback receipts is unverified. The 8-hour resident-set number for Desktop does not exist yet.
