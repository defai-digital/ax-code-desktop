I'll verify the prior scores against the four codebases and then write the gap tables and a ranked plan. Starting with governance and the claimed desktop gaps.Governance confirms the ownership split. Next I’ll check the claimed file sizes, security flags, tests, and the TUI surfaces against the reference trees.The security notes are only partly current. I’ll measure file sizes and check updater, platforms, and the TUI feature surfaces next.The prior desktop scores are mostly right, with four corrections. The file-size count is exact: **58** non-test sources at or above 1,000 lines, including `desktop/packages/ui/src/components/chat/ChatInput-impl.tsx` (4,903), `desktop/packages/web/server/lib/git/service.js` (5,049), `desktop/packages/ui/src/components/views/FilesView-impl.tsx` (3,930), and `desktop/packages/electron/src/main.js` (3,826). The `-impl` files are the real modules.

The platform line is too narrow. `desktop/packages/electron/electron-builder.yml` builds macOS arm64 (dmg, zip), Windows x64 (nsis, zip), and Linux AppImage and deb. `.github/workflows/desktop-shadow.yml` already packages `darwin-arm64`, Windows, and `linux-x64` / `linux-arm64`. Missing arches are macOS x64 and Windows arm64. The runtime already rejects Windows ARM (`ax-code/AGENTS.md`, ADR-185).

The updater is approved and still frozen. `config/desktop-release-policy.json` is `cutover-approved` with `publicRelease.enabled: true` and the feed pointed at `defai-digital/ax-code-desktop` (`config/desktop-identity.json`). `electron-builder.yml` still says publishing stays disabled until ADR-009 gates pass. `AGENTS.md` says ADR-012 authorizes cutover, while live activation still needs signed install, upgrade, rollback, and continuity receipts.

Sandbox is unset on the app window, and on for guests. `createDesktopRendererWebPreferences` in `desktop/packages/electron/src/webview-policy.js` sets `webviewTag: true`, `contextIsolation: true`, `nodeIntegration: false`, and does not set `sandbox`. Electron 44.9.0 defaults sandbox on, so this is an explicitness gap. Guest webviews, the wiki viewer, the launch animation, and the WebMCP browser set `sandbox: true`. `runAsNode: true` is real (`electron-builder.yml`), with inspect arguments and `NODE_OPTIONS` fused off. CSP in `desktop-renderer-protocol.js` allows `script-src 'unsafe-inline'` and `style-src 'unsafe-inline'`. `wasm-unsafe-eval` is limited to the Ghostty WASM terminal.

There is no Playwright project. Source-text tests are a small set (`DashboardPanel.source.test.ts`, `pendingToastWiring.source.test.ts`, `context-panel-source.test.ts`), not the whole suite. Orca’s `tests/e2e` has **955** TypeScript files, not ~700. OpenCode’s `packages/app/e2e` has **156**.

Desktop already has a browser pane (`ContextPanel-impl.tsx`, `useWebMcpBrowserStore.ts`), CodeMirror (`CodeMirrorEditor.tsx`), worktree create (`NewWorktreeDialog.tsx`, `lib/worktrees/worktreeManager`), a portfolio exception list (`NeedsYouQueue.tsx`), extra windows and a mini-chat (`main.js` `createAdditionalWindow`, `createMiniChatWindow`), GitHub routes (`web/server/lib/github/routes.js`), and **13** UI catalogs under `ui/src/lib/i18n/messages`. OpenCode’s native list is **63** locales (`packages/app/src/runtime/i18n/desktop-native.ts`).

## 1. Desktop gaps

| Capability | AX state | Reference | Score / user impact |
|---|---|---|---|
| App-window sandbox and CSP | Main window omits `sandbox`; CSP allows inline script and style. Guests are locked down in `webview-policy.js`. `runAsNode: true` keeps the Electron binary as a Node launcher. | OpenCode sets `sandbox: true` in `packages/desktop/src/main/windows/early.ts` and `appearance.ts`. | Security. A renderer bug is one step closer to Node. Inline script weakens CSP. |
| Typed IPC | `desktop-ipc-contract.json` lists commands with `"args": "object"`. Handlers live in untyped `main.js`. | `packages/desktop/src/main/ipc.ts` serves `DesktopRpcs` through Effect `RpcServer` on a `MessageChannel`. | Architecture. Contract drift is a review problem, not a type error. |
| Main-process shape | Many extracted modules, but `main.js` is still the 3,826-line composition root. | `packages/desktop/src/main/{windows,ipc-handlers,lifecycle,storage,service,extension}`. | Architecture and release risk. Window, update, and IPC changes collide. |
| Oversized UI and local git | 58 files ≥1,000 lines. The git implementation is a desktop Node service, `web/server/lib/git/service.js`. | Orca tracks a max-lines baseline (`config/max-lines-baseline.txt`) and still has huge trees. OpenCode splits session UI into `packages/session-ui`. | Architecture. Reviews miss behavior inside `ChatInput-impl.tsx` and `FilesView-impl.tsx`. |
| Worktree as the supervision unit | Sessions carry `worktreeRoot` / `worktreeStatus` (`stores/types/sessionTypes.ts`). The portfolio unit is the project. | Orca CLI is worktree-native: `src/cli/handlers/worktree.ts`, `worktree-ps-program-status.ts`, GitLab and Linear link flags. | Supervision. Users supervise projects and sessions, not “the worktree that is running.” |
| Agent dashboard pop-out | Mini-chat and extra windows load the same UI. No status pop-out. | `src/main/window/dashboard-popout-window` and `src/preload/api/dashboard-bridge.ts`. | Supervision across a multi-project day. |
| Exception inbox | `NeedsYouQueue.tsx` ranks permission, question, error, and uncommitted work and can answer the first two. | Orca’s pop-out is the always-on surface for that queue. | AX is closer than the old score said. The missing piece is a window that stays up. |
| Browser and editor | Webview pane plus CodeMirror exist. `webviewTag: true` is the cost. | Orca CLI: `src/cli/handlers/browser-tab.ts`, `browser-capture.ts`, `browser-cookie.ts`. OpenCode: `packages/app/component-tests/browser-pane.spec.ts`. | Depth, not absence. Do not grow a second browser-automation runtime in desktop. |
| Task integrations | GitHub routes and git UI. No Jira or Linear product surface. GitLab shows up as a skill-catalog host. | Orca: `src/cli/handlers/jira.ts`, `linear.ts`, `worktree-gitlab-link.ts`. | Project-management UX. High for teams that live in those trackers. |
| Tests | Vitest unit tests are real, especially under `electron/src`. No Playwright. Three source-string tests. | Orca: `tests/e2e` (955 files) and `.github/workflows/performance-contracts.yml`. OpenCode: `packages/app/e2e` plus `packages/storybook`. | Testing and release. Regressions in portfolio, permissions, and update install are unguarded. |
| Release | Shadow matrix includes Linux. Builder comment still freezes publish. | OpenCode `electron-builder.config.ts`: dmg, zip, nsis, AppImage, deb, rpm. | Release score stays capped until upgrade and rollback receipts exist. |
| Locales and design system | 13 catalogs, `styles/design-system.css`. No Storybook. | 63 locales in `desktop-native.ts`. `packages/ui`, `packages/storybook`, `packages/session-ui/src/pierre/virtualizer.ts` and `worker.ts`. | UX polish and long-transcript performance. Locale count is not the first gap. |
| Mobile | None. | `orca/mobile` (Expo, its own store and lockfile). | Companion access. Large product, easy to copy badly. |

## 2. TUI gaps

Orca has no TUI. Its CLI supervises agents without a full-screen UI: worktree process status, orchestration (`src/cli/handlers/orchestration.ts`), a terminal daemon, browser handlers, and Jira and Linear commands.

AX TUI is a SolidJS app on `ax-tui` with home and session routes only (`src/cli/tui/context/route-util.ts`), **34** theme JSON files, mouse on by default (`renderer.ts`), leader keybinds (`context/keybind.tsx`), **14** locale modules, and **348** test files under `packages/ax-code/test` whose path contains `tui`. OpenCode’s `packages/tui/test` has **181** files. Count is not the gap.

| Capability | AX state | OpenCode | Impact |
|---|---|---|---|
| Session switching | Modal list: `component/dialog-session-list.tsx`, `navigation/navigation-model.ts`. One route at a time. | Persistent tabs: `component/session-tabs.tsx`, `context/session-tabs.tsx`, `session-tabs-rail.tsx`. | Users cannot watch two sessions in one terminal. |
| Sub-agents | `routes/session/subagent-status-panel.tsx` lists, opens, and stops, including stale items. | `routes/session/composer/subagents-tab.tsx`, `mini/stream-v2.subagent.ts`, `mini/footer.subagent.tsx`. | AX is adequate for status. OpenCode also streams the child in a compact footer. |
| Diff and review | `component/dialog-diff-viewer.tsx`. Permission UI embeds `SessionDiffRenderer` (`routes/session/permission.tsx`). | `feature-plugins/system/diff-viewer.tsx` with a mouse file tree. `config/keybind.ts` marks diff tree keys deprecated because the tree is mouse-driven. | Review of a multi-file turn is dialog-scoped. |
| Permissions | Full surface: persist rules, WebMCP allowlist, diff, SDK `PermissionRequest`. | `routes/session/permission.tsx`, `mini/footer.permission.tsx`, `context/permission.tsx`. | Near parity. Keep AX’s persist rules. |
| Themes and keybinds | 34 themes, leader map, `tui.json`. | `theme/discovery.ts` plus `theme/assets/v2`. `config/keybind.ts`. | No meaningful gap. |
| Mouse | Default on, hard off via `AX_CODE_DISABLE_MOUSE`, context menu, click and drag criteria in `performance-criteria.ts`. | `app.tsx` sets `renderer.useMouse = config.mouse`. Diff tree is mouse-first. | AX mouse works. It is not the review UI. |
| Long sessions | Criteria exist: 2,000-message projection p95 25ms, scroll at least 45 fps (`performance-criteria.ts`). Most gates are `manual`. `util/elide-part-snapshot.ts` and `coalesce-stream-events.ts` help. | `routes/session/mount-budget.ts` budgets mounted entries. Desktop highlighting uses a worker pool (`session-ui/src/pierre/worker.ts`) and Playwright benches. | AX can claim a budget it does not enforce in CI. |
| Multi-session / multi-project | Workspace dialog (`dialog-workspace-list.tsx`) plus the session dialog. Still one foreground session. | Tabs plus `component/dialog-workspaces.tsx`. Orca CLI `worktree-ps` is the non-TUI version of this. | The terminal cannot supervise a portfolio. Desktop `NeedsYouQueue` can. |
| Plugins | `renderer-contract.ts` `extension.plugin-slots` gate is `"adr"`. No `plugin/` tree. | `packages/tui/src/plugin/{api,discovery,render}.tsx` and `@opencode/plugin/tui`, including plugin routes. | Real gap, and it is intentionally not built. |
| Tests | Large Vitest set around dialogs, navigation, and permissions. Perf criteria are mostly manual. | `packages/tui/test` plus TUI storybook fixtures under `feature-plugins/system/storybook`. | Add CI for the automated criteria before adding more UI. |

## 3. Ranked proposals

1. **Explicit app-window sandbox and a CSP plan.** Owner: `ax-code-desktop`. Set `sandbox: true` in `createDesktopRendererWebPreferences` and keep the guest policy. Remove `'unsafe-inline'` from `script-src` only after the renderer no longer needs it. Leave `runAsNode` until the desktop CLI has its own Node launcher. No SDK change. Effort S. Security +1. Risk: preload breakage. Electron 44 already defaults sandbox on, so this mostly pins the default.

2. **Close the updater paperwork.** Owner: `ax-code-desktop`. Make `electron-builder.yml` match ADR-012. Keep publish off until the five receipts in `desktop-release-policy.json` exist. No runtime change. Effort M. Release +1. Risk: shipping a feed that cannot roll back.

3. **Write down the platform matrix.** Owner: `ax-code-desktop`. Treat Linux x64 and arm64 as shadow targets to qualify, not as surprise gaps. Do not add macOS x64 or Windows arm64 without an ADR that matches ADR-185. Effort S to document, M to sign Linux. Release +0.5 once Linux smoke is signed.

4. **Playwright smoke, and delete source-string tests.** Owner: `ax-code-desktop`. One smoke: launch, open a project, see `NeedsYouQueue`, open a session, render a permission card. Replace the three `*.source.test.ts` files with behavior tests. Effort M. Testing +1. Risk: Electron flake. Keep the suite under twenty tests.

5. **Typed desktop IPC, without Effect.** Owner: `ax-code-desktop`. Zod schemas for `desktop-ipc-contract.json`, starting with update, window, and file commands. Handlers move out of `main.js` the way `ipc-handlers/` is split in OpenCode. Do not import Effect. The runtime SDK stays the server contract. Effort M. Architecture +1. Risk: a big-bang rewrite of `preload.js`.

6. **Cut `main.js` at window factories.** Owner: `ax-code-desktop`. Move `createAdditionalWindow`, `createMiniChatWindow`, and update wiring into siblings that already exist (`desktop-window-chrome.js`, `desktop-update-feed.js`). The `-impl` re-export is not a split. Effort M. Architecture +0.5.

7. **TUI session tabs.** Owner: `ax-code`. A tab strip beside `dialog-session-list.tsx`, using the session list the SDK already returns (`@ax-code/sdk/v2` in that dialog). Cap open tabs. No new endpoint. Effort M. TUI supervision, not the desktop score. Risk: sync bootstrap (`context/sync-session-*.ts`) assumes one foreground session.

8. **Enforce the TUI perf criteria that are already automated.** Owner: `ax-code`. Run `transcript.large-append` and `scroll.long-cjk-wrapped` in CI. Add a mount budget modeled on `mount-budget.ts` inside `routes/session/transcript.tsx`. Effort S for the gate, M for the budget. Risk: flaky timing. Pin fixtures, not wall clocks, if the machine varies.

9. **Needs-you pop-out.** Owner: `ax-code-desktop`. A small window on the mini-chat path that renders `NeedsYouQueue` and `RequestActionCard`. Data already comes from `useAllPendingRequests`. No new server route. Effort M. Supervision +0.5. Risk: a second copy of session state. Keep it a view over the same sync store.

10. **Portfolio worktree projection.** Owner: desktop, runtime only if the session payload lacks the path. Read `worktreeRoot` and `worktreeStatus` into the project list. Do not grow `git/service.js`. Worktree create and execute stay in the runtime. Effort M. Supervision +0.5. Dependency: confirm the published SDK session type already includes those fields before adding an endpoint.

11. **Shrink the three giants by behavior, not by filename.** Owner: `ax-code-desktop`. Split `ChatInput-impl.tsx` at submit, mentions, and slash commands. Split `FilesView-impl.tsx` at tree, editor, and preview. Split `git/service.js` at status, diff, and GitHub. Effort L. Architecture +1. Risk: the desktop git service starts calling runtime git and the two diverge. Pick one owner per operation.

12. **TUI diff file tree.** Owner: `ax-code`. Extend `dialog-diff-viewer.tsx` with a file list and mouse selection, reusing `diffDisplayView` in `routes/session/view-model.ts`. Effort M. Depends on nothing in desktop. Risk: duplicating the permission dialog’s diff. One renderer, two call sites.

13. **Plugin slots stay behind the ADR.** Owner: `ax-code`, later. `extension.plugin-slots` is gated `"adr"`. When an ADR exists, copy OpenCode’s slot map (`packages/tui/src/plugin/api.tsx`) only for header, sidebar, transcript, and footer. No plugin routes in the first cut. Effort L. Dependency: ADR. Risk: a third extension surface beside runtime plugins.

14. **Storybook for the portfolio primitives.** Owner: `ax-code-desktop`, later. Stories for `NeedsYouQueue`, permission cards, and session rows. Effort M. UX +0.5. Do this after the file splits so stories do not import 4,900-line modules.

15. **Jira and Linear as links, if the runtime stores them.** Owner: both, runtime first. A session field for external issue URLs, rendered in the desktop session header and the TUI sidebar. Do not port `src/cli/handlers/jira.ts` or `linear.ts`. Effort M after a runtime release. Dependency: SDK publish before desktop reads it.

## 4. Sequencing

**Next two weeks.** Items 1, 2, 3, and 8. All are inside one repo. No SDK release. Item 6 can start by moving the mini-chat window out of `main.js` with no behavior change.

**Next six weeks.** Items 4, 5, 7, 9, 10, and 12. TUI tabs and the diff tree ship in the ax-code CLI release and do not block desktop. The pop-out and the worktree projection wait on one SDK check: if session info already carries worktree and pending-request data, desktop proceeds. If not, add the field in ax-code, publish the SDK, then bump `config/ax-code-sdk.json`. Item 11 starts only after item 6, so two splits are not in flight in `main.js` and `ChatInput` together.

**Later.** Items 13, 14, and 15. Linux signing if shadow stays green. Locales stay at the current 13 until the English catalog stops moving. Mobile is out of this sequence.

## 5. Do not copy

- Orca’s tree size and e2e volume. `src/main` is about 13,000 files and `src/renderer` about 12,000. A 955-file e2e suite will not fix a 5,000-line git service.
- Orca’s mobile app, relay, and computer-use natives (`native/computer-use-macos`). Desktop computer-use stays on the pinned runtime. `packages/ax-computer` is unreleased.
- Effect in the ax-code core. `ax-code/AGENTS.md` forbids it. OpenCode’s IPC is a good boundary to copy. The Effect implementation is not.
- Sixty-three locales. The catalog in `desktop-native.ts` is a native-string list, not proof of translated product UI.
- A second agent loop, git engine, or browser-automation stack in `desktop/packages/web/server`. `git/service.js` is already the warning.
- OpenCode’s plugin routes and TUI storybook as a first plugin release. The AX contract says the slot gate is an ADR.
- SSH remotes. `main.js` already fail-closes `desktop_ssh_*`. Leave that closed.
- Worktree-as-a-desktop-database. Orca’s CLI can be the idea. The implementation stays in the runtime, with desktop as a projection.
