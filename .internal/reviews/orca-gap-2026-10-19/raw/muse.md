# How AX Code Desktop closes the gap to Orca and wins

Scope note: read-only. Evidence below is from code I opened in both trees; estimates are marked **UNVERIFIED**.

## 1. Ground truth: Orca, deep vs shallow vs weak

**Genuinely deep.** Parallel-agent hosting: [agent-launch executor](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/main/agent-launch/agent-launch-executor.ts>) plus per-vendor account/home juggling in [codex-accounts](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/main/codex-accounts/>) and [claude-accounts](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/main/claude-accounts/>). GitHub integration: dozens of tested clients in [src/main/github](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/main/github/>). Usage scanning: [claude-usage/scanner.ts](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/main/claude-usage/scanner.ts>). Browser/computer use: [agent-browser-bridge](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/main/browser/>) and [computer providers](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/main/computer/>). Mobile: real Expo app with pairing in [mobile/app/pair.tsx](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/mobile/app/pair.tsx>).

**Shallow.** Supervision semantics: Orca infers state from terminals and files ([agent-state-file-reader.ts](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/main/agent-state-file-reader.ts>)); there is no goal, contract, or verification concept. Account switching is largely managed-home copying/mirroring ([runtime-home-service*.ts](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/main/codex-accounts/>)) — deep code, brittle idea. Task boards dispatch prompts; they do not verify outcomes (**UNVERIFIED** beyond file names for Linear).

**Weaknesses (verified paths).**

- **W1 Reliability churn.** [docs/audits](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/docs/audits/>) holds ~45 retention audits (PTY, daemon, browser, SSH). That is a leak-history, not a footnote.
- **W2 Credential custody.** Orca stores provider keys itself in [encrypted-api-key-file-store.ts](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/main/credentials/encrypted-api-key-file-store.ts>) under `~/.orca`. Our boundary (AX Trust) forbids this; it is also Orca's largest enterprise blocker.
- **W3 Permissive agent sandbox.** [codex-structured-permission-policy.ts](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/main/codex/codex-structured-permission-policy.ts>) maps modes to `danger-full-access`.
- **W4 Estate complexity.** 574 files in `src/main`, plus `orcad`, ephemeral VMs ([ephemeral-vm-runtime-service.ts](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/main/ephemeral-vm-runtime-service.ts>)), relay and `cloud/`. Every release must keep all of it alive.
- **W5 Test volume ≠ signal.** 554 e2e specs and ~95 workflows, but [package.json](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/package.json>) needs a dozen ratchets (max-lines, ts-nocheck, unproven-PTY) — debt managed by fences.
- **W6 Locales.** 6 catalogs in [i18n/locales](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/renderer/src/i18n/locales/>) vs our 15 in [ui messages](</Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/i18n/messages/>).

## 2. Gap table (12)

Class: A = Desktop-only now, B = runtime/SDK first, C = boundary-blocked, D = not worth copying.

| # | Gap | Orca / Ours | Class |
|---|---|---|---|
| 1 | Multi-vendor PTY host | `src/main/agent-launch` / [terminalApi.ts](</Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/terminalApi.ts>) | C/D |
| 2 | Runtime-owned worktrees | `src/main/worktree-*` / [git/service.js](</Users/akiralam/code/ax-code-desktop/desktop/packages/web/server/lib/git/service.js>) | B |
| 3 | Mobile companion | `mobile/` / none | B |
| 4 | Automations depth | `src/main/automations` / [scheduledTasksApi.ts](</Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/scheduledTasksApi.ts>) | A |
| 5 | GitHub/Linear/GitLab tasks | `src/main/github` / GitHubBoardView | B |
| 6 | Usage $ / account switching | `src/main/claude-usage` / none | C/D |
| 7 | Browser + computer use | `src/main/browser,computer` / [desktop-webmcp-browser.js](</Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js>) | B |
| 8 | Standalone CLI | `src/main/cli` / Electron `runAsNode` | A |
| 9 | E2E + CI breadth | `tests/e2e` (554) / [scripts/e2e](</Users/akiralam/code/ax-code-desktop/desktop/packages/electron/scripts/e2e>) (7) | A |
| 10 | Modularity | 574 small files / [main.js](</Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/main.js>) (3,860 lines) | A |
| 11 | Remote/web access | `vite.web.config.ts` / [packages/web](</Users/akiralam/code/ax-code-desktop/desktop/packages/web/>) | A/B |
| 12 | Locales / RTL | 6 locales / 15 locales, LTR-only | A |

## 3. Where we win, measurably

- **Verified supervision.** Our rows already carry runtime diff evidence ([needsYouSurface.ts](</Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/supervision/needsYouSurface.ts>)). Publish: “% of Done rows with linked verification evidence” — target 100%; Orca: 0% by construction (no verification in [supervision equivalent — terminal state only](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/src/main/agent-state-file-reader.ts>) ).
- **Governed approvals.** Risk-ordered queue ([requestRisk.ts](</Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/supervision/requestRisk.ts>), [missionControl.ts](</Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/supervision/missionControl.ts>)). Publish: approval-audit completeness and “0 raw credentials in Desktop” (grep gate). Orca holds keys itself (W2).
- **Signed update + rollback proof.** [desktop-release-policy.json](</Users/akiralam/code/ax-code-desktop/config/desktop-release-policy.json>) requires signed-shadow, upgrade, rollback, continuity receipts ([v7.27.3-evidence](</Users/akiralam/code/ax-code-desktop/.internal/releases/v7.27.3-evidence/>)). Publish receipt completeness per release; Orca equivalent **UNVERIFIED** (updater code exists, no public receipt inventory found).
- **Leak-free long sessions.** Publish an 8-hour soak (RSS growth, retained listeners). Our lossless drain is already measured in [.internal/reports](</Users/akiralam/code/ax-code-desktop/.internal/reports/PERFORMANCE-2026-10-19-supervision.md> equivalent: `PERFORMANCE-2026-10-19-*.md`). Orca's counter-evidence is W1.
- **Locale quality.** 15 shipped catalogs vs 6; publish catalog-completeness % and pseudo-locale screenshot pass. Orca has pseudo-localization tooling but fewer languages.

## 4. Sequenced plan (score gain per effort)

Start this week: **P1, P2, P3**.

- **P1 (D, SPEC, S)** — Promote [e2e harness](</Users/akiralam/code/ax-code-desktop/desktop/packages/electron/scripts/e2e>) to release gate; exit: packaged + update smoke green, 0 CSP violations. Moves Testing, Release.
- **P2 (D, ADR-018 verify, S)** — Finish renderer baseline: hash CSP in [desktop-renderer-protocol.js](</Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-renderer-protocol.js>), drop `unsafe-eval` in [response-headers.js](</Users/akiralam/code/ax-code-desktop/desktop/packages/web/server/lib/security/response-headers.js>); sandbox already pinned in [webview-policy.js](</Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/webview-policy.js>). Exit: CSP tests pass. Moves Security.
- **P3 (D, none, S)** — Burn down `*.source.test.ts` to behavior tests; exit: ratchet count strictly decreasing. Moves Testing.
- **P4 (R→D, ADR+SPEC, L)** — Runtime worktree API; delete Desktop `git worktree add`. Moves Architecture.
- **P5 (D, ADR+SPEC, M)** — Typed IPC split of [main.js](</Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/main.js>) around [desktop-ipc-contract.json](</Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-ipc-contract.json>). Moves Architecture, Security.
- **P6 (D, SPEC, M)** — Goal-evidence supervision: verification state on every Mission Control row. Moves Supervision — our differentiator.
- **P7 (D, SPEC, M)** — Soak/perf budgets as CI gates. Moves Performance, Testing.
- **P8 (D, SPEC, M)** — RTL + Arabic with complete catalog. Moves UX.
- **P9 (D, none, M)** — Automations parity from scheduled-task families. Moves Breadth (allowed slice only).
- **P10 (R→D, PRD+ADR, L)** — Read-only mobile supervision (§5). Moves Breadth/Reach.

## 5. Mobile/remote

Smallest credible version: **no native app**. A read-only supervision web view served from [packages/web](</Users/akiralam/code/ax-code-desktop/desktop/packages/web/>) — Mission Control + Needs You, approve/deny only if AX Trust issues scoped tokens. Needs from runtime: a stable read-only run/attention feed over the SDK (today supervision is a renderer projection in [sync-context-impl.tsx](</Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/sync/sync-context-impl.tsx>)). Orca's [mobile/](</Users/akiralam/code/ax-code-desktop/.internal/reference/orca/mobile/>) is a full terminal client — do not match it. **Worth it? No, not before P1–P6.** It buys reach points but zero trust points, and it is the easiest item to cut.

## 6. Honest odds

Probability of overtaking Orca's 88 within 90 days: **~30% (UNVERIFIED estimate)**. The static score rewards host breadth (gap rows 1, 3, 6) that our boundaries forbid copying, so we must gain ~12 points from Testing/Architecture/Security/Supervision alone while Orca keeps shipping. Biggest blocker: cross-repo latency — P4/P6 depend on runtime ADRs and an SDK release before Desktop code starts.

“Beat Orca at being Orca” is the wrong goal. Right goal: **be the supervision surface an enterprise can audit** — verified done, governed approvals, rollback-proven updates. Win that category outright; let Orca keep the terminal-host category.

## 7. Disagreements with prior work

- [PROPOSAL.md](</Users/akiralam/code/ax-code-desktop/.internal/reviews/competitive-gap-2026-10-19/PROPOSAL.md>) §5 claims ~85 is reachable from Phases 1–2; it under-weights that breadth (20 pts) is structurally capped for us. Expect ~82–84.
- Both PRDs are stale on security: sandbox is already explicit ([webview-policy.js:14](</Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/webview-policy.js>)); remaining work is CSP only. Re-baseline before scheduling.
- [Supervision v3](</Users/akiralam/code/ax-code-desktop/.internal/prd/PRD-2026-10-19-supervision-v3.md>) (pop-out, multi-run) is accepted/shipped work — carrying it as future score gain double-counts.
- File-size splits (PROPOSAL #8) are hygiene, not user value; sequence them *behind* P6, not beside it.
- RTL/Arabic (PROPOSAL #13) is mis-prioritized ahead of soak/perf evidence; our locale lead is already a win axis — depth (completeness, a11y) beats a 16th language.
- Missing from all three documents: a published falsifiable metric set (§3). Without it, “close the gap” cannot be checked, only asserted.

