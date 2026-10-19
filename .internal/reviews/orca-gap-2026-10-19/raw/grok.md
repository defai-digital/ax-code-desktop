我先讀今天的提案、兩份 PRD 和參考說明，再對照兩邊程式，不改任何檔案。先前文件已讀完。接下來對照 Orca 程式與 Desktop 現況，核對宣稱能力是否真的做深。AX Code Desktop does not beat Orca by becoming Orca. Orca is a deep agent-neutral host plus a cloud relay. The boundary forbids that product. The score that can move in 90 days is verification, structure, and supervision trust. Matching Orca's reach cannot.

## 1. Ground truth

Read from the clone at `.internal/reference/orca` (snapshot noted in `.internal/reference/README.md`). Marketed depth that is real:

- **PTY host plus a structured fallback.** `src/main/agent-launch/agent-launch-executor.ts` creates a workspace, asks the host for chat, and on refusal starts a terminal agent. Flagship adapters are large: `src/main/codex` (453 files), `src/main/claude` (295), `src/main/native-chat` (842), `src/main/opencode` (94). The long tail is a hook installer, not a product: `src/main/gemini/` is two files (`hook-service.ts`).
- **Worktree safety.** `src/main/worktree-removal-safety.ts` refuses unregistered paths, the main worktree, the home directory, and nested worktrees.
- **Browser design mode.** About 50 files under `src/renderer/src/components/browser-pane/annotate/`, including markup, accessibility names, and send-to-agent. `src/main/browser/browser-guest-shortcut-dispatch.ts` toggles annotate mode. Not a stub.
- **Issue trackers.** `src/main/linear/linear-project-models.ts` maps projects, issues, and custom views. GitHub store is a large cache and review client under `src/renderer/src/store/github/`. GitLab, Jira, Bitbucket, Azure DevOps, and Gitea each have their own trees.
- **Automations.** `src/main/automations/service.ts` ticks every 60 seconds, prechecks, dispatches headless, and fences SSH and WSL.
- **Mobile is a real app on a real relay.** `mobile/app/` has session, review, files, PR, tasks, and pairing. `mobile/src/transport/pairing-relay-candidate.test.ts` talks to `https://relay.onorca.dev`. `cloud/apps/relay/` is 265 files.
- **Computer use is deep on macOS.** `native/computer-use-macos/` is 30 Swift files and `src/main/computer/sidecar-client.ts` drives a sidecar. Linux and Windows are two files each. `tests/e2e/computer-mac.e2e.ts` is `describe.skipIf(!isMac || !e2eOptIn)`.
- **Accounts and usage.** `src/main/codex-accounts/` (119 files), `src/main/claude-accounts/` (56), plus usage stores. Credentials are Desktop-owned.

Shallow or weaker than the marketing:

- **Built-in locales are 6, not ~7.** `src/renderer/src/i18n/supported-languages.ts` and `locales/{en,es,fr,ja,ko,zh}.json`. Pseudo-locale exists. No RTL catalog.
- **`tests/e2e` is 981 files (955 `.ts`), not ~1,100 always-on tests.** Many `test.skip` on platform, missing fixtures, or opt-in benches. `.github/workflows/` is 95 files; about 20 are `cloud-*` relay deploy and operate jobs, so the CI count overstates product tests.
- **Desktop shell CSP is not a policy in source.** `src/renderer/index.html` sets only `img-src` and comments that electron-vite injects a stricter policy. `electron.vite.config.ts` has no CSP setting. Plugin panels allow `script-src 'unsafe-inline'` (`src/shared/plugins/plugin-panel-shell.ts`). Whether a production injection exists is **UNVERIFIED**. The main window sets `sandbox: true` and `webviewTag: true` (`src/main/window/createMainWindow.ts`).

Five concrete weaknesses:

1. **It forges vendor trust so the agent's own prompt never appears.** `src/main/agent-trust-presets.ts` writes Cursor `.workspace-trusted` and Copilot `trustedFolders` before first launch, explicitly so a paste is not eaten by the trust menu.
2. **Integration tokens fall back to plaintext.** `src/main/integration-credential-file.ts` writes the raw token when the OS keyring is unavailable. `src/main/credential-file-protection.ts` says speech, Linear, Jira, and Bitbucket files can be ciphertext or a bare token with nothing on disk to tell them apart.
3. **Long-session retention is a product class, not a one-off.** `docs/audits/` holds dozens of measured leaks (PTY carry, SSH writers, browser guests, daemon streams). `docs/audits/pty-detector-retention/README.md` records about 32 MiB retained per case before the fix. The patches show they fix leaks. The volume shows the architecture keeps producing them.
4. **The process model is the product.** `src/main` is 13,467 files, `src/renderer/src` is 12,576, `src/main/ipc` is 1,184, `src/main/browser` is 602. A supervision window should not need a relay terraform estate (`cloud/infra/terraform/`).
5. **Mobile looks connected while it is dead.** `mobile/issue-5049-unresponsive-session-findings.md` (2026-06-09): after 12 reconnect attempts the Android client stays `'reconnecting'` forever, and paste black-holes on a half-open socket for up to about 28 seconds. Recovery was "kill the app."

No `goal contract` or `session goal` string exists under Orca `src/**/*.ts`.

## 2. Gap table

| Gap | Orca | AX Code Desktop now | Class |
|---|---|---|---|
| Any installed CLI in a PTY | `src/main/agent-launch/agent-launch-executor.ts` | One supervised runtime; no second agent host | C |
| Structured Codex/Claude/OpenCode chat | `src/main/native-chat/`, `codex/`, `claude/` | Runtime owns the coding UX | C |
| Worktree is the only session unit | `src/main/worktree-removal-safety.ts` | Project registry; worktrees are inside projects | D |
| Desktop still runs `git worktree add` | Orca owns this on purpose | `desktop/packages/web/server/lib/git/service.js:3846` | B |
| Design-mode annotate canvas | `src/renderer/src/components/browser-pane/annotate/` | WebMCP browser exists (`desktop-webmcp-browser.js`); no markup studio | D |
| GitHub review workstation | `src/renderer/src/store/github/` | PR picker only: `GitHubPrPickerDialog.tsx` | D |
| Linear/Jira/GitLab live boards | `src/main/linear/`, `jira/`, `gitlab/` | No connector. Tokens would be AX Trust | C |
| SSH and remote worktrees | `src/renderer/src/startup/ssh-startup-reconnect.ts` | Fail closed: `electron/src/main.js:3318-3321` | C |
| Headless automations that launch agents | `src/main/automations/service.ts` | Scheduled-task families in the UI (`scheduledTaskFamilies.ts`); dispatch stays in the runtime | B for richer schedules; C for Orca's dispatcher |
| Per-vendor account switcher and usage dollars | `src/main/codex-accounts/`, `claude-usage/` | No cost dashboard; credentials are not Desktop records | D |
| In-app computer-use sidecar | `native/computer-use-macos/`, `src/main/computer/` | Packaged macOS only points the runtime at bundled `ax-computer` (`computer-use-server-env.js`) | C |
| Phone companion on a relay | `mobile/`, `cloud/apps/relay/` | No mobile client. Read-only supervision is an unwritten product PRD | C for Orca's shape |

## 3. Where we can win

1. **Frozen goal progress.** The runtime already freezes a goal contract (`../ax-code/packages/ax-code/src/session/goal-plan-orchestration.ts`) and the SDK source has `GET /session/{id}/goal`. Desktop has no caller (search of `desktop/` for `/goal` is empty). Orca has no equivalent type. Metric: every Mission Control row shows contract state `absent | frozen | failed`, and a failed check is on the Needs You queue within one sync. Whether pin `config/ax-code-sdk.json` (2.6.37) already exposes that route is **UNVERIFIED**.
2. **Approvals that do not impersonate the agent.** `PermissionCard.tsx` and `RequestActionCard` approve or deny through the runtime. Orca writes the agent's trust file (`agent-trust-presets.ts`). Metric: zero Desktop writes to vendor trust files; every Needs You decision has a runtime permission id. Orca's current behavior fails that metric by design.
3. **A release does not move until rollback is proven.** `.internal/reports/RELEASE-2026-10-19-v7.27.3-publication.md`: fresh install, upgrade, rollback, and profile continuity on macOS arm64, Windows x64, and Linux x64/arm64, notarized (`electron-builder.yml`). Orca notarizes hourly, daily, and adhoc channels (`config/scripts/electron-builder-mac-channel-config.test.mjs`) and does not show a per-version rollback receipt in this clone (**UNVERIFIED** that none exists upstream). Metric: public versions with a four-platform rollback receipt, divided by public versions. Ours can be 1.0 for 7.27.3. Theirs is a ship-rate channel.
4. **Catalog quality.** 14 locales in `desktop/shared/locales.json`, with `localeDirection()` already returning `rtl` for ar/he/fa/ur (`desktop/shared/localization.mjs`). Orca ships 6. Metric: `pnpm run check:locales` missing-key count stays 0 across 14. Theirs is 6 catalogs.
5. **A published long-session budget.** Our open-paragraph trace holds p95 at the 120 Hz floor (`.internal/reports/PERFORMANCE-2026-10-19-open-paragraph-trace.md`). Orca's `performance-contracts.yml` gates scanner and markdown microbenchmarks, and its audits document multi-megabyte retains. Metric we can publish and they have not as one number: resident-set growth under a fixed 8-hour session script. We do not have that number yet.

## 4. Sequenced plan

Score math: breadth 9, supervision 8, UX 8, architecture 6, testing 7, release 7, performance 7, security 8. Weights make architecture and supervision the expensive points. Breadth is already 9/10 on this rubric, so copying features barely moves it.

| # | Scope | Owner | Gate | Effort | Exit | Criterion |
|---|---|---|---|---|---|---|
| 1 | E2E journeys for Needs You approve, deny, and a refused worktree create. Today `journeys.mjs` is boot, bridge, CSP, settings, pop-out, errors, reload | Desktop | Amend the e2e spec | S | Those three journeys fail the command on regression | Testing |
| 2 | App-document CSP drops `'unsafe-inline'`; preview proxies may keep a wider policy. `response-headers.js:56-60` still sends `'unsafe-inline'` on our document and a wildcard `connect-src` | Desktop | ADR-018 already exists | S | Packaged and web app documents have zero CSP violations in the harness | Security |
| 3 | Mission Control goal row from the existing goal route | Runtime pin, then Desktop | Desktop supervision spec if the pin has the route; runtime ADR plus SDK release if it does not | M | A fixture session shows frozen vs failed without a new store | Supervision |
| 4 | Fill `params` on every IPC command. Many entries in `desktop-ipc-contract.json` still pass through. Then split `main.js` | Desktop | ADR-019 / IPC spec v2 already exist | M | Contract check rejects a command without `params` | Architecture |
| 5 | Delete `git worktree add` from `service.js`; call the runtime | Runtime, then Desktop | Runtime worktree ADR, Desktop git-scope ADR | L | Desktop test proves no `worktree add` spawn | Architecture |
| 6 | 8-hour session leak script, report-only CI | Desktop | None until it becomes a gate | M | One published heap delta for a fixed fixture | Performance |
| 7 | Keyboard approve/deny and an automated name check on Mission Control and Needs You. Row grid already exists (`MissionControlRow.test.tsx`) | Desktop | None | S | The check fails if approve has no accessible name | UX |
| 8 | Pseudo-locale overlay, copied as an idea from `src/renderer/src/i18n/pseudo-localization.ts` | Desktop | None | S | A dev locale renders every catalog key expanded | UX |
| 9 | Read-only Needs You phone view. Not this quarter | Runtime, AX Trust, Desktop | New product PRD, remote-access ADR | L | A phone lists queue rows and cannot send | Reach, later |
| 10 | Governance index repair | Desktop | None | S | Indexes match shipped status | Score 0. Do beside 1, not instead of it |

Start this week: **1, 2, and the pin check for 3.** Pop-out and `metadata.multiRun` are already in the tree (`ElectronSupervisionApp.tsx`, `useMultiRunStore.ts`, `multiRunGroups.test.ts`). Do not schedule them as unstarted.

## 5. Mobile

Smallest credible version: a read-only list of Needs You rows and goal state for projects already running on this desktop, opened with an AX Trust grant, no PTY, no worktree create, no token in a Desktop record, no relay fleet.

It needs a runtime read model: session id, reason (`permission | question | error | review`), and goal status. Not terminal bytes.

It is not worth doing before items 1–5. Orca's advantage is the relay and the full phone IDE. That is a hosted control plane with a documented stuck-session failure. A thin read-only view will not move a reach score that compares us to that app, and it will delay the supervision metric that can.

## 6. Odds

About **25%** to pass 88 on the 8-criterion rubric within 90 days, and only if items 1–5 land and a rescoring treats them as architecture 8 and testing 9. About **10%** on the 6-dimension score (Orca 8.6, AX 7.6), because that gap is reach.

The single biggest blocker is the product Orca is: an agent-neutral host and a relay. Building that is forbidden, and it is most of what a breadth-and-reach judge rewards.

The right goal is to be the supervision desk a team can audit: frozen goals, governed approvals, a release that can roll back, and a session that does not leak. Second place at about 85, with a higher trust score than Orca, is a success. First place at being Orca is a boundary violation.

## 7. Disagreements

The proposal and both PRDs are right that verification and structure are the deficit, and right about the do-not-copy list. Several facts in the proposal are already stale, and Phase 3 is aimed at the wrong gap.

- **"Direction is hard-coded LTR"** (`PROPOSAL.md` §3) is wrong. `localeDirection()` and `applyDocumentLocale` already set `dir`. No RTL catalog ships (`locales.json` `"directions": {}`). Item 13 is a catalog, not a missing function. Deprioritize it.
- **"IPC is untyped"** is stale. `desktop-ipc-contract.json` version 2 and `ipc-args.js` validate declared params. The hole is pass-through commands and a still-monolithic `main.js`.
- **"Main-window sandbox is not set"** is stale. `webview-policy.js` `createDesktopRendererWebPreferences` sets `sandbox: true` (ADR-018). Packaged script hashes live in `desktop-renderer-protocol.js`. What remains is the web app document's `'unsafe-inline'` and wildcard `connect-src`.
- **Supervision v3 is partly implemented**, not a future phase. Pop-out, metadata-first multi-run, and `journeySupervisionPopout` exist. The PRD's acceptance bar (e2e opens the pop-out) is in the harness. Lane actions are still correctly a non-goal.
- **Neither PRD mentions the goal route.** That is the missing win. "Breadth is already competitive" matches the 8-criterion 9/10 and contradicts the 6-dimension reach gap. Phase 3 issue links, webhooks, and plugin slots will not close the second score and are mostly class C or D.
- **Governance-first (G1–G5) does not move the score.** It is necessary so the next ADR is unambiguous. It must not consume the week that should start the three journeys, the CSP remainder, and the goal-pin check.
- **Expected 85 and "still behind Orca" is the honest outcome** of Phases 1 and 2. I agree. I do not agree that Phase 3 breadth is how you pass them.
