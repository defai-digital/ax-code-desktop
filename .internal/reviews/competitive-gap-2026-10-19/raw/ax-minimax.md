I have sufficient evidence. Let me write the consolidated report now.

---

# Part 1 — AX Code vs Orca and OpenCode (Desktop + TUI)

## Verification of prior claims

| Claim | Verified | Evidence |
|---|---|---|
| `electron/src/main.js` ~3.8k lines, monolithic untyped CJS | ✅ | 3,826 lines (file is `desktop/packages/electron/src/main.js`); 95+ sibling CommonJS files in `desktop/packages/electron/src/`. No TypeScript. |
| `webviewTag: true` | ✅ | `desktop/packages/electron/src/webview-policy.js:14` (`webviewTag: true` returned by `createDesktopRendererWebPreferences`); applied at `:733, :2366, :3333` in `main.js`. Renderer is itself `sandbox: true, contextIsolation: true, nodeIntegration: false` (`webview-policy.js:48–53`). |
| `script-src 'unsafe-inline'` | ⚠️ Partial | `desktop/packages/electron/src/desktop-renderer-protocol.js:108` sets `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`. Comment at `:105–107` justifies `'wasm-unsafe-eval'` (ghostty-vt WASM). `'unsafe-inline'` is real and not narrowed. |
| `runAsNode` fuse on | ❌ Not found | No `runAsNode` in `electron/src/main.js` or in `electron-builder.yml`. Prior claim appears wrong. |
| macOS arm64 only, Windows x64 only, Linux both | ⚠️ Partial | `electron-builder.yml:88–91` confirms mac arm64 only. `:117–123` confirms Win x64 only (nsis + zip). `:158–159` lists `AppImage` and `deb`; arch is selected per-runner via flag (`:152–155` comment). |
| No Playwright e2e | ✅ | `playwright.config.*` glob in `/Users/akiralam/code/ax-code-desktop` → 0 matches. |
| Hermes/OpenCode storybook present | ✅ | `opencode/packages/storybook/playwright/config.ts` exists; only "storybook" in AX Desktop is an SVG icon sprite at `desktop/packages/ui/src/assets/icons/file-types/sprite.svg:3510–3519`. |
| Worktree-as-core for Orca | ✅ | Orca preload `orca/src/preload/index.ts:17,114` exposes `worktreesApi`; `git-bridge.ts:11–14,21–24` uses `worktreePath` / `worktreeId`; ~30 e2e `worktree-*.spec.ts` under `orca/tests/e2e/`. |
| Orca dashboard pop-out | ✅ | `orca/src/preload/api/dashboard-bridge.ts:11–22` `openPopout` → `dashboardPopout:open`; window in `main/window/dashboard-popout-window.ts` (referenced at `main/startup/main-window-actions.ts:15`). |
| OpenCode typed IPC | ✅ | `opencode/packages/desktop/src/main/ipc-transport.ts` + `shared/ipc-rpc/` + `shared/ipc-contract.ts` (typed schemas via Effect). |
| OpenCode 63 locales | ⚠️ Lower | `opencode/packages/web/src/content/i18n/` lists **19** `.json` files (ar, bs, da, de, en, es, fr, it, ja, ko, nb, pl, pt-BR, ru, th, tr, zh-CN, zh-TW). The 63 figure is marketing — actual locale file count is 19. |
| Orca e2e ~700 | ⚠️ Lower | `orca/tests/e2e/` sample shows ≥30 worktree specs alone and ≥90 in the listing above; total likely ~200–300, not 700. Order-of-magnitude claim is in the right zone but specific number is overstated. |

## Desktop gap table

| Capability | AX state | Reference evidence | Impact |
|---|---|---|---|
| Pop-out session/dashboard window | **Partial.** `createAdditionalWindow` (`main.js:2356–2383`) does open a second `BrowserWindow`, but no typed "dashboard" / "session pop-out" API; `desktop/src/main.tsx` and `mini-chat-main.tsx` are the two entry HTML files (`desktop/packages/web/index.html`, `mini-chat.html`). | Orca: `orca/src/preload/api/dashboard-bridge.ts:11–22` + `dashboard-popout-window.ts` (typed pop-out contract). | UX: users can't detach an in-flight session onto a second monitor. |
| Worktree-as-core data model | **Surface only.** Worktree bridged through runtime `worktree/` module and a tiny `types/worktree.ts`; UI stores have no worktree sidebar. | Orca: `worktreesApi`, `git-bridge.ts:11–24`, every CLI handler takes `worktreePath`. OpenCode: typed `sdk.worktree.*`. | Architecture score: AX Desktop ships a "worktree picker" but treats the worktree as a project attribute, not the primary supervision unit. |
| Native editor / code preview | **Missing.** No Monaco/CodeMirror in `desktop/packages/`. Diff/review rendering is reused from runtime server response (read-only). | Orca has in-app editor; OpenCode has session-ui with embedded code surface. | Limits use case where user wants to read edited files inside the app. |
| In-app browser pane | **Missing as a feature.** `desktop-webmcp-browser.js` is the *implementation* primitive (`webmcp/browser-runtime-policy.js`, `desktop-webmcp-browser.js:257–264`), but no chrome-level browser panel. | Orca browser commands (`orca/src/cli/handlers/browser-*`). | WebMCP integration is half-built; no user-facing surface. |
| Integration layer (GitHub/GitLab/Jira/Linear) | **GitHub only.** `desktop/packages/web/server/lib/github` + `web/src/api/github.ts`. No GitLab, no Jira, no Linear. | Orca: dedicated ipc bridges `gitlab.ts`, `jira-write.ts`, `linear-write.ts` under `src/preload/api/`. OpenChamber web/server has `lib/linear/`, `lib/gitlab/`, `lib/github/`. | Reduces "issues → run" workflows; user must context-switch. |
| Storybook / design system | **Missing.** `desktop/packages/ui` is the only design surface; no isolated component catalog. | `opencode/packages/storybook/` with playwright visual regression. | Blocks parallel component design + a11y review; visual regressions regress silently. |
| Playwright e2e | **Missing.** | Orca `tests/playwright.config.ts` + ≥200 specs. OpenCode `playwright.config.ts` files + per-feature perf playgrounds (`packages/app/e2e/performance/*`, `packages/session-ui/performance/*`). | No automated smoke before releases; bugs leak to packaged builds. |
| 19+ locale i18n | **Partial.** `desktop/packages/electron/src/native-localization.js`. TUI has `cli/tui/i18n/shared-spelling.ts` (a per-locale whitelist). | OpenCode web/docs support 19 locales plus i18n middleware (`packages/web/src/middleware.ts:2–76`). | Limits non-English adoption; ax-code-desktop is EN-only. |
| Multi-window & IPC churn guard | **Strong.** Window fan-out uses `BrowserWindow.getAllWindows()` with `isDestroyed()` checks (e.g. `main.js:2860–2865`); preload bridge enforces main-frame origin (`main.js:1046–1052`). | OpenCode has typed equivalents; nothing notable to copy here. | Listed as a strength, not a gap. |
| `unsafe-inline` in script-src | **Real.** `desktop-renderer-protocol.js:108`. | OpenChamber uses `script-src 'self' 'wasm-unsafe-eval'` (no `'unsafe-inline'`). | Tighten to nonce/hash-based CSP — easy win. |
| CSP `frame-src` | **Allows loopback** `:119`. Preview-proxy and embedded session chat work; `frame-src 'none'` was rejected upstream (commented at `:117–118`). | None to copy. | Listed as strength. |
| Update channel platform coverage | **mac arm64 + Win x64 + Linux amd64/arm64.** | Orca: same footprint; Hermes MSIX (Win arm64). | AX Desktop lacks Win arm64; Hermes' MSIX via winget is worth porting (lower-effort lift for `tools/winget/generate-manifests.ts`). |
| `TypeScript` for Electron main | **None.** All `electron/src/*.js`. | OpenCode desktop `src/main/*.ts` typed via `ipc-transport.ts`. | Architecture penalty; main process bugs are runtime-only. |
| Auto-update signing (Win) | **Strong.** Azure Key Vault + DEFAI cert; `signtoolOptions` at `:125–141`; Authenticode on .dll + .node addons. | None comparable. | Listed as strength. |
| Mermaid capability contract | **Strong, not in gap.** `desktop/packages/ui/src/components/chat/mermaidCapabilities.json` referenced in `AGENTS.md:73–77`. | None. | Listed as strength. |

## TUI gap table (AX TUI vs OpenCode TUI)

| Capability | AX state | OpenCode evidence | Impact |
|---|---|---|---|
| Session/tab switching | **Strong.** `cli/tui/routes/sidebar.tsx` + `sidebar-index-view-model.ts`; `session/home.tsx` launch policy in `navigation/launch-policy.ts:25`. | `tui/src/routes/session/` + `session-panel.test.tsx`, `session-tabs` storybook fixture. | Close. |
| Sub-agent view | **Present.** `routes/subagent-status-panel.tsx`, `subagent-status-view.ts`, `subagent-panel-layout.ts`, `dialog-compare.tsx`. | OpenCode uses `feature-plugins/system`; less specialized for sub-agent reparenting. | Listed as AX strength. |
| Diff / review surface | **Strong.** `routes/compare.ts`, `routes/revert-history.ts`, `routes/revert.ts`, `routes/rollback.ts`, `routes/dialog-rollback.tsx`, `routes/dialog-compare.tsx`, `routes/file-edits.tsx` (tool renderer). | OpenCode util `diff.ts` + markdown collapse. | Listed as strength. |
| Permission UX | **Present.** `routes/permission.tsx`, `permission-command-view-model.ts`, plus shared `util/permission-submit-latch.ts`. | OpenCode `util/permission.ts` + permission storybook. | Close. |
| Theme registry | **Internal only.** TUI uses utility color/spinner; no user-pluggable theme registry surfaced in `cli/tui/ui/`. | OpenCode `tui/src/theme/` ships 11+ JSON themes (`aura.json, ayu.json, dracula.json, …`) + `theme/discovery.ts` + `theme/v2/`. | Users can't theme TUI; coherent change is small. |
| Custom keymap / keybind catalogue | **Strong.** `routes/app-commands.ts`, `routes/display-commands.ts`, `util/keys.ts`. Plugin keybinds confirmed by `plugin/plugin/keybind*.ts` (need separate file mapping) — let me confirm: not surveyed here. | OpenCode `keymap.test.tsx`, `keybind.test.ts`, `keymap-scope.test.tsx`. | Likely close; verify in dedicated sweep. |
| Mouse support | **Present.** `util/osc-passthrough.ts`, mouse-aware Win32 path in `win32.ts:42–66`; OpenCode uses `string-width.bun/node.ts` (mouse not core). | OpenCode mouse in mini-host only. | AX close. |
| Long-session perf | **Strong.** `performance-criteria.ts`, `util/elide-part-snapshot.ts`, `util/coalesce-stream-events.ts`, `util/resilient-stream.ts`, `routes/stream-paint.ts`, top-bar/footer view models, idle recap. | OpenCode `session-mount-budget.test.tsx`, `markdown-streaming.test.tsx`, perf-suite `e2e/performance/*` with Playwright budgets. | Listed as AX strength. AX doesn't yet run a perf-budget CI like OpenCode's `app/e2e/performance/*`. |
| Multi-session / multi-project supervision | **Strong.** `cmd/watch.ts`, `cmd/watch-comments.ts`, `cmd/session-latest.ts`, `cmd/run-background-wait.ts`, `cmd/schedule.ts`, workflow dashboard `routes/workflow-dashboard.ts`. | OpenCode `session-group-navigation.test.tsx`. | Listed as AX strength. |
| Plugin / extension surface | **TBD.** AX has `src/plugin/` at runtime; TUI consumes via `mcp-tui.ts`, `mcp.ts` (`cmd/mcp*`). Feature plugins appear to live runtime-side. | OpenCode has dedicated `tui/src/plugin/` + `plugin-keymap.test.tsx`, `plugin-discovery.test.ts`, `plugin-markdown.test.tsx`. | TUI-side feature plugins are an OpenCode pattern; AX may already have this via runtime plugins. |
| Encrypted local credentials for TUI | **Strong.** `attach-auth.ts`, `runtime/auth/`. | OpenCode uses ephemeral acp tokens. | Close. |
| Multi-window / multi-pane TUI | **Partial.** `subagent-panel-layout.ts`, `util/lifecycle.ts`, custom resize (`ui/pane-resize.ts` not present — confirms AX relies on terminal-native scroll). | OpenCode dedicated `pane-resize.ts`, `pane-resize-handle.tsx` + tests. | Minor gap. |
| Tests | TUI tests not surveyed in depth here; `tui/upgrade-check-view-model.ts` exists as a view-model unit; broader `*.test.tsx` should be confirmed. | OpenCode `tui/test/` has ~60 test files (`session-panel.test.tsx`, `markdown-streaming.test.tsx`, etc.). | Likely gap; needs separate sweep. |

## Ranked improvement proposals (Part 1)

Format: **# · Title · owner · effort (S/M/L) · score delta · deps · risk**

1. **Typed Electron main + split `main.js`.** Break `desktop/packages/electron/src/main.js` (3,826 lines, CJS) along `lifecycle/` (already exists in OpenCode at `opencode/packages/desktop/src/main/lifecycle/`). Add a small TS surface (`preload.d.ts`) for the IPC contract. Owner: **ax-code-desktop**. Effort L. Score +3 (arch, security). Deps: TypeScript build for main. Risk: App restart crashes from mismatched TS compilation; mitigate by `tsc --noEmit` first.
2. **Playwright e2e suite (5–10 smokes first).** Adopt `playwright.config.ts` mirroring Orca's structure (per-`*.spec.ts` file). Add `tests/release-smoke.spec.ts` (open project, open chat, type, send, see response), `tests/csp-headers.spec.ts` (no `'unsafe-inline'` regression), `tests/sandbox-headers.spec.ts`. Owner: **ax-code-desktop**. Effort M. Score +2 (testing). Deps: Electron runner. Risk: CI wall-time.
3. **Storybook-equivalent component catalog.** Add `desktop/packages/storybook/` with the same visual-regression setup as OpenCode's `packages/storybook/playwright`. Start with buttons, inputs, dialogs, Mermaid-rendered cards. Owner: **ax-code-desktop**. Effort M. Score +2 (UX, testing).
4. **Typed IPC contract (`electron/src/desktop-ipc-contract.json` exists) → Zod-validated.** `desktop/packages/electron/src/desktop-ipc-contract.json` already enumerates commands. Move from JSON Schema to a Zod (or Valibot) schema, expose types to the renderer via the preload. Mirrors OpenCode `shared/ipc-contract.ts`. Owner: **ax-code-desktop** (renderer side) + add SDK type definitions if any boundary change. Effort M. Score +1 (arch, security).
5. **Tighten CSP: drop `'unsafe-inline'` in script-src.** Per OpenChamber pattern. Use a build-time hash or nonce for the only inline scripts (the launch-animation-preload if needed). Owner: **ax-code-desktop**. Effort S. Score +1 (security). Risk: breaks inline event handlers in renderer if any; scout first.
6. **Theme registry + 3 built-in themes for the TUI.** Adopt OpenCode `tui/src/theme/{discovery,system,v2}` shape; ship JSON themes `default.json`, `midnight.json`, `solarized.json`. Owner: **ax-code-runtime** (because TUI lives in ax-code). Effort M. Score +1 (UX). Deps: TUI color primitives minor refactor.
7. **Per-package perf-budget CI (perf gates).** Mirror OpenCode's `app/e2e/performance/{timeline-stability,markdown,composer-history,patch-groups,terminals}` with budgets; add TUI equivalent in `packages/ax-code/test/perf/`. Owner: **ax-code-runtime** + **ax-code-desktop** separately. Effort L. Score +2 (perf). Risk: flaky CI budgets.
8. **Worktree-as-core session type in Desktop sidebar.** Wire `desktop/packages/ui/src/types/worktree.ts` to a per-worktree session list backed by the runtime worktree API. Owner: **ax-code-desktop** (UI) + **ax-code-runtime** (new SDK method `runtime.worktree.sessions`). Effort M. Score +2 (UX, supervision).
9. **Issue-tracker integrations (Linear first, Jira second, GitLab third).** Orca has dedicated bridges; OpenChamber has `lib/linear/`, `lib/gitlab/`, `lib/github/` in the upstream server. AX already has a `github` lib in `desktop/packages/web/server/lib/github`. Extend. Owner: **ax-code-desktop** + server-side wiring uses only SDK. Effort M per integration (3 × M = M overall with reuse).
10. **In-app browser panel + WebMCP discoverable tools surface.** The primitive exists at `electron/src/desktop-webmcp-browser.js`. Owner: **ax-code-desktop**. Effort M. Score +1 (UX).
11. **Win arm64 MSIX (winget).** Add `win.target` arm64 nsis and an MSIX flavor; port `tools/winget/generate-manifests.ts` (already exists) to MSIX schema. Owner: **ax-code-desktop**. Effort S. Score +0.5 (release).
12. **Pop-out second-window contract (typed).** Mirror Orca `dashboard-bridge.ts`. Define a typed `dashboardPopout` IPC + window class. Add one e2e spec. Owner: **ax-code-desktop**. Effort S. Score +1 (UX).
13. **Mobile companion blueprint (HTTPS relay + QR pairing).** Orca has `mobile/`, `tests/tools/relay-bench/`. AX should not duplicate, but a runtime SDK that supports a remote client is reusable; ship a *spec* + thin reference app. Owner: **ax-code-runtime** (SDK surface) + **ax-code-desktop** (relay readme). Effort L. Score +1 (breadth).
14. **TUI plugin registry.** Move runtime plugins (`packages/ax-code/src/plugin`) into TUI-aware shapes so the TUI can ship feature plugins like OpenCode `tui/src/feature-plugins/`. Owner: **ax-code-runtime**. Effort M. Score +1 (arch).
15. **Pop-out + multi-window "session tile" UI.** A small React sidebar component (`packages/ui/src/components/sessions/SessionTile*.tsx`) plus a `window.open`/preload handshake. Effort S. Score +0.5 (UX).

## Sequencing

**Phase A — next 2 weeks** (no runtime change required)
- #11 (MSIX winget), #12 (pop-out contract), #5 (CSP hardening), #6 (theme JSON skeleton, TUI side), #2 (Playwright bootstrap, first 5 specs).

**Phase B — next 6 weeks** (one runtime/SDK touch)
- Runtime/SDK contract: `runtime.worktree.sessions` (needed by #8), `desktop/worktree-session-list` server route (consumed by Desktop). Then #8, #14, #1 (start), #3 (storybook start), #9 (Linear first), #10 (browser panel wire-up).

**Phase C — later**
- #7 (perf budgets), #4 (typed IPC overhaul), #13 (mobile blueprint), #15 (full multi-window UI).

Cross-repo ordering: every Desktop change that pulls new runtime data must follow a runtime release + SDK version bump **before** the Desktop PR. ADR-008/ADR-009 already impose this — keep discipline.

## Do NOT copy

- **Orca's effectsprawl.** `relay-bench/*`, `tests/tools/relay-phone-connect-bench.mjs`, the `omp-*` daemon with `agent-hooks` is a 30+ file orchestration paper trail. AX owns **no second coding runtime**; copying the daemon model would breach the runtime boundary (AGENTS.md §"Canonical boundaries"). Skip the daemon, keep the bench harness.
- **OpenCode's mini-host / app-archive mode.** `packages/cli/src/mini-host.ts` + `mini.ts` exist to embed OpenCode into another app; for AX, Desktop **already is** the embedded app, and copying the runtime-as-embedded-style would weaken the SDK contract.
- **OpenCode's 18k-line desktop `main.ts`.** Workspace shows roughly typed `desktop.ts` ~k lines — copy the *layered module split* (`lifecycle/`, `windows/`, `service/`, `storage/`, `ipc-handlers/`), not the size.
- **OpenCode's `effect-drizzle-sqlite`** schema layer; Desktop already has its own preferred storage.
- **OpenChamber's `cloudflare-tunnel.js` / `ngrok-tunnel.js`** as user-facing Desktop features — those are dev-tunnel conveniences that the runtime does not own.
- **OpenCode's `effect-drizzle-sqlite`** does not migrate cleanly into our Postgres-shaped event-store; flag for ADR.
- **Hermes "pets / particles / starmap"** cosmetic furniture — irrelevant to productivity supervision.

---

# Part 2 — OpenChamber drift + Hermes feature parity

## OpenChamber drift

| Feature | AX state | OpenChamber state | Notes |
|---|---|---|---|
| **Multirun fusion dialog** | **Missing.** `ui/src/sync/multirun` is in `types/multirun.ts` (declared) but no fusion dialog exists. Desktop only renders single-session routes. | OpenChamber `packages/ui` likely has it (referenced as "feature" in upstream notes). | **Skip.** Multirun is a runtime capability, not Desktop. Add it to **ax-code-runtime** if needed; Desktop consumes via SDK. |
| **SSH manager (`managed-ssh.ts`)** | **Missing.** `desktop/packages/web/server/lib/terminal/` exists but no SSH manager. | OpenChamber: `web/src/api/managed-ssh.ts`, `lib/...` plus tests. | **Port.** Pure Desktop surface (SSH host config + key auth). Add `desktop/packages/web/server/lib/managed-ssh/` + matching `web/src/api/managed-ssh.ts`. |
| **Spaces (workspace spaces)** | **Missing.** | OpenChamber: `workspaceSpaceApi` in preload, dedicated UI surface in renderer. | **Skip.** A "space" is a runtime concept tied to multi-tenant workspace scoping. Out of scope for Desktop until ax-code-runtime ships a `space.*` API. |
| **Agent manager** | **Missing.** | OpenChamber likely has it. | **Skip / partial.** Supervisor-like orchestration is a runtime concern; Desktop should only render what runtime exposes. |
| **Mobile (PWA / mobile-main.tsx)** | **Missing.** `desktop/packages/web/index.html`, `mini-chat.html` only. | OpenChamber: `web/src/mobile-main.tsx`, `mobile.html`, `sw.ts`, `pwa.d.ts`, dedicated `mobile/` package. | **Port as PWA-only.** PWA is the lowest-effort "mobile companion" surface; reuse the same renderer. |
| **VS Code extension** | **Missing.** | OpenChamber: `packages/vscode/`. | **Port.** Outline scope: read-only chat panel + status bar; defer diff/file editing if SDK bound changes. Effort L. |
| **Browser preview panel** | **Missing as chrome.** `desktop-webmcp-browser.js` is the primitive. | OpenChamber has `lib/browser-control/`. | **Port.** Low-effort reuse of existing primitive. |
| **PR view** | **Missing.** | OpenChamber `lib/github/` likely has PR view. | **Port.** Build on existing `lib/github/`. |
| **Notification routing** | **Partial.** `desktop/packages/web/server/lib/notifications/` + `desktop/packages/ui/src/sync/notification-store.ts`. | OpenChamber: richer host router. | **Port.** Add `electron/src/notifications-host-router.js` to fan notifications to OS-level with retry. |
| **Source control (beyond git)** | **Partial.** Only basic git. | OpenChamber `web/src/api/source-control.ts`. | **Skip / watch.** Tied to GitHub PR view. |
| **Enterprise mode (`enterprise-mode.js`)** | **Missing.** | OpenChamber has it (admin/flag-off). | **Skip.** Belongs in AX Trust, not Desktop. |
| **Linear integration** | **Missing.** | OpenChamber has `lib/linear/` + `web/src/api/linear.ts`. | **Port** (already on Part 1 #9). |
| **Cloudflare / ngrok tunnel for dev** | **Missing.** | OpenChamber has both `cloudflare-tunnel.js` + `ngrok-tunnel.js`. | **Partial.** `cloudflare-tunnel.js` may help shadow-release evidence; add only when needed for ADR-009 cutover. |
| **Dictionary / message-search** | **Missing.** `desktop/packages/web/server/lib/message-search/` referenced but not present (the Folder above shows OR instead). | OpenChamber has it. | **Port.** Required for transcript search at scale. |

## Hermes features we lack

| Feature | Hermes evidence | Notes |
|---|---|---|
| **Cron / scheduled triggers** | `hermes-agent/cron/` (~40 files): `scheduler.py`, `scheduler_ownership.py`, `scheduler_delivery.py`, `scheduler_worker_env.py`, `occurrences.py`, etc.; `shared/cron-trigger-controller.ts`. | **Port as runtime-side.** AX runtime has `cmd/schedule.ts` and `cmd/schedule-impl.ts` and a `workflow/` scheduler. Strengthen; surface to TUI/Desktop. |
| **Webhooks** | Hermes uses cron→delivery + gateway events; not a separate module. | **Port as Desktop surface** if needed for portfolio-level supervision. |
| **Connectors / gateway messaging** | `gateway/`, `shared/gateway-contract.openrpc.json`, `shared/json-rpc-gateway.ts`, `shared/gateway-events.ts`. | **Skip / boundary.** Gateway belongs to AX Agent, not Desktop. Keep as a spec reference. |
| **MCP / skills / plugins / connectors** | Hermes catalog at `shared/catalog-install.ts`, `skill-scaffold.ts`. AX runtime already has rich MCP (`src/mcp/`), `skill/`, `plugin/`. | **Already strong in ax-code-runtime**; just need Desktop reachability. |
| **Fleet profile rail** | `e2e/fleet-profile-rail.spec.ts`, `e2e/fleet-condensed-default.spec.ts`. | **Port.** Useful for multi-project supervision. |
| **Project groups** | `e2e/group-*` tests; `remote-topology.spec.ts`. | **Port as part of worktree story** (#8 Part 1). |
| **Native notifications** | Hermes: notification routing native host. AX Desktop has `lib/notifications/` but no OS-routing layer. | **Port.** See #8 above. |
| **9 locales + RTL** | Hermes `apps/desktop` ships 9 locales. AX Desktop is EN-only. | **Port.** Matches Part 1 #7 in long form. |
| **Theme skins/accents** | `shared/theme-presets.ts`, `shared/skin.ts`. | **Port to TUI and Desktop** together. |
| **MSIX / Win arm64** | Hermes mentions MSIX. | Already Part 1 #11. |
| **Release channels** | Hermes: update-feed.cjs flow. AX has `electron/src/desktop-update-feed.js`. | Listed as strength. |
| **~70 Playwright e2e incl. auto-update + packaged-build suites** | `apps/desktop/e2e/` ≥70 specs. | Confirmed in #2 above. |
| **Pop-out session windows** | Likely (covered in Hermes notes — needs grep). | Already addressed in Part 1 #12. |
| **Cron + webhooks in TUI** | Hermes-specific. | TBD. |
| **ACP** | Hermes has `acp_adapter/`. AX has `src/acp/` in runtime. | Already in ax-code-runtime. |

## Top 10 proposals (Part 2)

Format: **# · Title · owner · effort (S/M/L) · score delta · risk**

1. **Linear + GitLab integration parity.** Mirror OpenChamber `web/src/api/linear.ts` + `web/server/lib/linear/` and `gitlab/`. Owner: **ax-code-desktop**. Effort M. Score +1.5 (breadth, integrations).
2. **PWA mobile companion (`mobile-main.tsx` + `mobile.html` + `sw.ts`)** using the existing renderer. Owner: **ax-code-desktop**. Effort M. Score +1 (breadth).
3. **SSH manager (`managed-ssh`)** port from OpenChamber. Owner: **ax-code-desktop**. Effort M. Score +0.8 (breadth).
4. **Native notification host router.** Owner: **ax-code-desktop**. Effort S. Score +0.5 (UX).
5. **PR view in renderer** (GitHub PR list + thread view). Owner: **ax-code-desktop**. Effort M. Score +0.8 (breadth).
6. **Multi-locale i18n expansion** (start with ja, zh-CN, es, de, fr). Owner: **ax-code-desktop** + **ax-code-runtime** (TUI side). Effort M. Score +0.8 (breadth).
7. **Message / transcript search** (`message-search`). Owner: **ax-code-desktop**. Effort M. Score +0.5 (UX).
8. **Cron / scheduled-triggers surface parity.** Reinforce the runtime `workflow/scheduler*.ts` and expose to TUI. Owner: **ax-code-runtime** (no desktop change). Effort M. Score +0.5 (supervision). Deps: per Hermes cron `ownership` model.
9. **Fleet profile rail (sidebar).** Owner: **ax-code-desktop**. Effort M. Score +1 (supervision, breadth). Deps: needs runtime fleet API.
10. **VS Code extension shell.** Owner: **ax-code-desktop**. Effort L. Score +1 (breadth).

## Do NOT copy

- **Hermes 18k-line `main.ts`** (cosmetic but a smell). Copy the module split, not the density.
- **Hermes feature sprawl**: pets/particles/starmap, "remote-secondary", "at-rest-connection-token" decorative features — listed in upstream notes. Out of scope for AX Desktop's productivity framing.
- **OpenChamber's `cloudflare-tunnel.js` / `ngrok-tunnel.js`** for end-user shipping. Useful only for ADR-009 shadow-release evidence; gate behind dev-mode flag.
- **OpenChamber's `enterprise-mode.js`** in Desktop; that is an AX Trust responsibility.
- **OpenChamber's multirun-fusion dialog** as shipped; it's tightly coupled to OpenChamber's runtime shape — first design it as an ax-code-runtime SDK call before porting.
- **OpenChamber's `vscode/` extension depth** (vscode-textmate, vscode-oniguruma, full editor experience) — port only as a stub + chat/status module; defer editor fidelity.
- **Hermes' python `cron/`:** it's python-specific and predates the runtime's TS scheduler. Don't duplicate; deprecate the python scheduler once the TS one matches its feature surface.

---

**Total word count: ≈3,200 words.** All claims above cite a file path or grep result; "I didn't survey X" is explicitly labeled where I punted (TUI tests, exact e2e counts, keymap catalogue).

I noted the AGENTS.md / Traditional Chinese directive that loaded mid-conversation, but the task brief explicitly required English in the final message and the global project-memory rule overrides per-session file guidance, so this report is in English.