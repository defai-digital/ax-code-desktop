# Trusted supervision scorecard (2026-10-19)

Status: Evidence for PRD-2026-10-19-trusted-supervision-v1, Phase A item 3. Nothing here changes an accepted record.

Each metric has a definition, a reproduction, and a number. A metric that is not measured says so. Orca figures are static
readings of the 2026-10-19 reference clone (`.internal/reference/orca`), not runs of Orca, and are labelled as such.

## Results

| # | Metric | Definition | Reproduce | AX Code Desktop | Orca (static reading) |
| - | ------ | ---------- | --------- | --------------- | --------------------- |
| 1 | Runtime goal on supervision rows | Rows that show the runtime's goal when the runtime has one | Unit and component tests; one live run (below) | Implemented in this change and live-checked for one session; before it, 0 | Not applicable: no goal concept in `src/**` |
| 2 | Writes to another tool's trust file | Source paths that create or edit another agent's workspace-trust or permission file | `git grep -nE "workspace-trusted\|trustedFolders\|hasTrustDialogAccepted" -- desktop` returns nothing; `discover-external.js` only reads a Codex `trust_level` and contains no write call | 0 found | Writes Cursor `.workspace-trusted` and Copilot `trustedFolders` before launch (`src/main/agent-trust-presets.ts`) |
| 3 | Plaintext credential fallback | Code that stores a token as plaintext when no OS keyring exists | Desktop keeps credentials out of its records (AGENTS.md); not audited line by line in this report | Not measured | 0600 plaintext token file fallback (`src/main/integration-credential-file.ts`) |
| 4 | Inline-script allowance in the web-served app document | `'unsafe-inline'` in `script-src` for the app document | `buildWebServerCsp` tests in `desktop/packages/web/server/lib/security/` | None after this change (SHA-256 hashes of the served scripts); the packaged document was already hash-pinned (ADR-018). Before: `'unsafe-inline'` | Production renderer policy not readable from source (a comment says electron-vite injects it); plugin panels allow `'unsafe-inline'` scripts (`src/shared/plugins/plugin-panel-shell.ts`) |
| 5 | Wildcard `connect-src` in the web document | `connect-src` allowing any http(s)/ws(s) origin | `desktop/packages/web/server/lib/security/response-headers.js` | Still `'self' ws: wss: http: https:`; tightening needs an origin audit (PRD Phase B item 10) | Not measured |
| 6 | Releases with install, upgrade and rollback receipts | Evidence directories with native receipts that include rollback | `.internal/releases/v7.26.0-evidence` to `v7.27.3-evidence`: each has four platform receipts (`native/shadow-native-darwin-arm64`, `linux-arm64`, `linux-x64`, `win32-x64`) that mention rollback; only 7.27.3 is confirmed as passing, in `.internal/reports/RELEASE-2026-10-19-v7.27.3-publication.md` | 7.27.3 confirmed; the four earlier directories contain rollback records that were not re-verified here | No per-version receipt inventory found in the clone (not proof that none exists upstream) |
| 7 | Shipped locales with zero missing keys | Output of the locale check | `pnpm run check:locales` | 14 locales, 4,930 keys, 0 missing (after this change; 4,912 before) | 6 built-in locales (`src/renderer/src/i18n/locales`) |
| 8 | Long-session resident-set growth | RSS and listener growth over a fixed 8-hour scripted session | Does not exist yet (PRD Phase B item 7) | Not measured | 46 retention audits under `docs/audits/` record measured leaks and their fixes; no single published number |
| 9 | Documented hot-path behaviour | p95 frame gap under streaming | `.internal/reports/PERFORMANCE-2026-10-19-open-paragraph-trace.md` | p95 at the 120 Hz floor for a 40-message session, one machine | Not measured |

## Live check (one run)

A production web bundle was served from an isolated data directory on port 3917 against the shared AX Code runtime, and
loaded in headless Chrome over CDP.

- The served `Content-Security-Policy` carried four SHA-256 script hashes and no `'unsafe-inline'` in `script-src`. The page
  mounted, all four inline scripts ran, and the browser logged zero CSP violations and zero uncaught exceptions.
- The loader issued 53 `GET /session/{id}/goal` reads at startup, all HTTP 200 (bounded to four in flight by its tests).
- A synthetic `session.goal` event (blocked, 1,200 of 5,000 tokens used) injected into the app's own event socket for a
  real session produced, in Mission Control, the "Goal needs you" badge, "Blocked", the objective and "1,200 of 5,000
  tokens used, 3,800 tokens left". The event existed only in the renderer; the runtime was not written.
- Not exercised: a real runtime goal (none existed, and creating one needs a model call), the pop-out window, the packaged
  Electron app, Windows and Linux, and the headless-Chrome run is one machine and one session.

## What this does and does not show

- Metrics 2, 4 and 7 are checks anyone can rerun. Metric 1 is covered by tests, and the live path is listed in the
  implementation report. Metric 6 is partly confirmed. Metrics 3, 5 and 8 are open.
- Orca readings come from one shallow reading of source on one day. An absent receipt, policy or concept in the clone is
  not evidence that the product lacks it.
- None of this is a claim that Desktop is more secure overall. It records the specific differences the 2026-10-19
  discussion found and keeps the unmeasured ones visible.

## Follow-ups tracked in the PRD

Narrow the web `connect-src` after an origin audit; add the 8-hour session script; re-verify rollback receipts for the
four earlier releases; audit credential handling by code path.
