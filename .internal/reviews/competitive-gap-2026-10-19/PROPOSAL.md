# Competitive Gap Review and Improvement Proposal (2026-10-19)

Status: Evidence. Accepted as PRD-2026-10-19-competitive-quality-v1 on 2026-10-19; the PRD is authoritative where they
differ. Nothing here changes an accepted PRD, ADR or spec. Each workstream lists the
governance record that must be accepted before implementation, following the order in `AGENTS.md`
(PRD, then ADRs in every affected repository, then specs, then implementation).

Scope: AX Code Desktop (`desktop/packages/*`) and the AX Code runtime TUI (`../ax-code/packages/ax-code/src/cli/tui`)
compared with Orca, OpenCode, Hermes Agent and OpenChamber (`.internal/reference/*`).

## 1. Method

- Static read-only scoring of 11 GUI products on 8 weighted criteria (breadth 20, supervision 15, UX 15,
  architecture 15, testing 10, release 10, performance 5, security 10).
- Gap review by nine independent reviewers using the briefs in `raw/`: Codex, Grok, Muse, and AX Code with
  DeepSeek Flash, GLM 5.3, MiniMax M3, MiMo v2.6 Pro and Qwen 3.8 Flash. Qwen 3.8 27B failed twice with a
  provider error.
- Governance audits of `.internal/{prd,adr,spec}` in both repositories.
- Contested claims were checked by hand against the code (section 3).

Reviewer reliability: Codex, Grok and Muse were the most accurate. DeepSeek, GLM and Qwen were mostly correct.
MiniMax and MiMo made several false claims (for example "no editor", "English only", "no fusion dialog",
"no TUI themes"), so their unique findings are not used unless another reviewer confirmed them.

## 2. Baseline scores

| Rank | Product | Total /100 |
|---|---|---|
| 1 | Orca | 88 |
| 2 | OpenCode desktop | 83 |
| 3 | Hermes Agent desktop | 79.5 |
| 4 | OpenChamber (upstream) | 77.5 |
| 5 | **AX Code Desktop** | **76.5** |
| 5 | deepseek-harness | 76.5 |
| 7 | OpenHands | 72 |
| 8 | Cline | 70.5 |
| 9 | Goose | 61.5 |
| 10 | Kimi Code | 58.5 |
| 11 | Continue | 58 |

AX Code Desktop criterion scores: breadth 9, supervision 8, UX 8, architecture 6, testing 7, release 7,
performance 7, security 8. TUI (separate 10-point scale): AX 7.85, OpenCode 7.40. AX leads on i18n,
permission UX, frame checks and release; OpenCode leads on session tabs, embedded terminal pane, TUI plugin
API, review route and rendered tests.

All reviewers agreed that the deficit is verification and structure, not feature count.

## 3. Verified facts (corrections to earlier claims)

| Topic | Verified state | Evidence |
|---|---|---|
| Locales | 14 (English plus 13), direction hard-coded to LTR | `ui/src/lib/i18n/messages/`, `ui/src/lib/i18n/context.tsx:14` |
| Main-window sandbox | Not set explicitly; guests, wiki viewer and WebMCP browser set `sandbox: true` | `electron/src/webview-policy.js` |
| CSP | Packaged renderer allows `script-src 'unsafe-inline'`; web server also allows `'unsafe-eval'` and a wildcard `connect-src 'self' ws: wss: http: https:` | `electron/src/desktop-renderer-protocol.js:108`, `web/server/lib/security/response-headers.js:47` |
| `runAsNode` fuse | Enabled on purpose: the packaged desktop CLI uses Electron as its Node launcher | `electron/electron-builder.yml:13-22` |
| Worktree creation | **Desktop runs `git worktree add` itself**, although the runtime owns worktree execution and already exposes create/list/remove/reset | `web/server/lib/git/service.js:3826-3846`; runtime `src/server/routes/experimental.ts` |
| Multi-run grouping | Groups lanes by parsed session titles; the runtime already stores `SessionMetadata.multiRun` | `ui/src/lib/supervision/multiRunGroups.ts`; runtime `src/session/metadata.ts:74` |
| Present features | Editor (CodeMirror), browser pane, preview console, fusion dialog, mini-chat, PR section, Mission Control, Needs You queue | `ContextPanel-impl.tsx`, `MultiRunFusionDialog.tsx`, `supervision/` |
| Tests | No Playwright suite; a few `*.source.test.ts` files assert source text; TUI has 348 test files | repository search |
| Release | 7.27.3 is published; `electron-builder.yml:197` still says publishing is disabled | `config/desktop-release-policy.json`, `.internal/releases/v7.27.3-evidence/` |
| Platforms | macOS arm64, Windows x64, Linux AppImage/deb. Windows arm64 is retired (runtime ADR-185, Desktop ADR-010) | `electron-builder.yml` |
| SSH / remote instances | Deliberately closed (`desktop_ssh_*` fail-closed, `remote-instances` retired) | `electron/src/main.js:1579`, `ui/src/lib/settings/metadata.ts` |

Settled performance decisions remain closed: no Rust migration, no event shedding at the 512 mark, and no DOM
change for long open paragraphs (`.internal/reports/PERFORMANCE-2026-10-19-*.md`).

## 4. Workstreams

Owner: **D** = ax-code-desktop, **R** = ax-code. "Votes" is the number of the eight reviewers that proposed
the item independently. Score deltas are estimates against the 76.5 baseline and overlap.

### Phase 0: governance re-baseline (first, about 1 week)

| # | Item | Owner | Why |
|---|---|---|---|
| G1 | Re-baseline Desktop records after 7.27.3 | D | `AGENTS.md`, ADR-009/010/011/012 and several specs still describe a release freeze |
| G2 | Fix index and numbering | D, R | Two Desktop ADR-009 files; runtime ADR-211/212 duplicates; about a dozen unindexed specs |
| G3 | Record shipped but ungoverned features | D | Mission Control, multi-run, scheduled-task convergence and the git service have no ADR or spec |
| G4 | Restore missing runtime ADRs cited by code | R | `renderer-contract.ts` cites ADR-031 and ADR-035, which do not exist |
| G5 | Mirror the ADR-015 naming note in the runtime repo | R | 37 runtime files still say "AX Coder"; `../ax-coder` and `../ax-computer` paths are wrong |

Detail is in section 6.

### Phase 1: next 2 weeks (single-repo, no SDK release)

| # | Item | Owner | Votes | Effort | Gate needed | Impact |
|---|---|---|---|---|---|---|
| 1 | Playwright Electron suite: boot, open project, Needs You queue, permission approve, worktree create, update toast; packaged and update smoke in `desktop-shadow.yml` | D | 8 | M | SPEC (test harness, CI gate) | Testing 7 to 8.5, release +0.5 |
| 2 | Renderer hardening: explicit `sandbox: true`, nonce or hash for inline scripts, drop `'unsafe-eval'` after a Mermaid/worker audit; keep `runAsNode` until the CLI launcher is separate | D | 8 | S-M | ADR: renderer security baseline | Security 8 to 9 |
| 3 | Replace `*.source.test.ts` assertions with behavior tests | D | 4 | S | none | Testing quality |
| 4 | Promote the automated TUI performance criteria to CI gates as report-only, then enforce after flake data | R | 6 | S | spec amendment to `performance-criteria.ts` | TUI perf |
| 5 | Fix `electron-builder.yml` publish comment; document the platform matrix | D | 2 | S | none | Accuracy |
| 5a | Locale completeness test and pseudo-locale (Hermes `overlay-completeness.test.ts`, Orca `pseudo-localization.ts`) | D | 1 | S | none | UX quality |
| 5b | Cross-window notification dedup (Hermes `electron/notification-ipc.ts`) | D | 1 | S | none | Supervision polish |
| 5c | Freeze the TUI pixel-art scenes (about 90 `component/*-pixels.ts` files with paired tests); no new scenes | R | 3 | S | none | Maintenance cost |

### Phase 2: next 6 weeks (cross-repo; runtime and SDK release first)

| # | Item | Owner | Votes | Effort | Gate needed | Impact |
|---|---|---|---|---|---|---|
| 6 | Move worktree execution to the runtime: stable worktree contract (existing branch, start ref, bootstrap status, operation ID); Desktop calls the SDK and stops shelling `git worktree` | R then D | 3 | L | R ADR: stable worktree API. D ADR: git operations Desktop may keep | Architecture +1, boundary fix |
| 7 | Typed IPC with zod schemas generated into `desktop-ipc-contract.json`; split `main.js` into windows, IPC, updater and runtime modules. No Effect | D | 7 | M-L | ADR + SPEC: IPC contract | Architecture +1, security +0.5 |
| 8 | Split `ChatInput-impl.tsx`, `FilesView-impl.tsx` and `git/service.js` by behavior behind the e2e net; delete `-impl` re-exports | D | 6 | L | none (after #1) | Architecture +1 |
| 9 | Supervision pop-out window that renders Mission Control and the Needs You queue from the same sync store | D | 8 | M | PRD supervision v3 + process-model spec amendment | Supervision +0.5-1 |
| 10 | Multi-run identity from `SessionMetadata.multiRun`; lane actions (keep, diff, archive, ask other models) from upstream OpenChamber | D | 3 | M | SPEC: multi-run | Supervision +0.5 |
| 11 | TUI session tabs with busy/unread state and a tab cap | R | 7 | M | R ADR amending ADR-047 D3 and ADR-104 | TUI supervision |
| 12 | TUI review route: file tree, hunk navigation, split/unified, one shared diff renderer | R | 6 | M | R ADR replacing missing ADR-035 routing rule | TUI UX |
| 13 | RTL support: direction from locale; add Arabic only with a complete catalog | D | 5 | M | SPEC localization v2 | UX reach |

### Phase 3: later (needs product decisions)

| # | Item | Owner | Gate needed |
|---|---|---|---|
| 14 | TUI plugin slots (header, sidebar, transcript, footer; no plugin routes in the first release) | R | R ADR for `extension.plugin-slots`; ax-tui release if the renderer changes |
| 15 | Code-aware fusion: snapshots and diff context in the runtime; Desktop selects and displays | R then D | R ADR + SDK contract |
| 16 | Canary update channel after signed install, upgrade and rollback receipts | D | ADR extending ADR-012 + distribution SPEC v5 |
| 17 | Bounded diagnostics pane (read-only log tail, health) in Mission Control; no usage dollars | R then D | ADR within AX Telemetry ownership |
| 18 | Jira/Linear as external issue links on sessions; OAuth connectors only through AX Trust | R then D | R ADR (metadata); AX Trust for credentials |
| 19 | Authenticated webhook routines, default off | R | Supersede ADR-055 D1 + network-exposure ADR |
| 20 | Remote or mobile supervision, read-only first | R then D | Product-boundary PRD; remote-access ADR; AX Trust |
| 21 | Component story catalog for supervision rows, permission cards and empty states | D | none (after #8) |
| 22 | Scheduled-task templates in a new table, respecting the `schedule` permission | R then D | R ADR (ADR-059/158 schema rule) |
| 23 | Cross-session message search through a runtime query endpoint | R then D | R ADR + SDK contract |

## 5. Expected outcome

If Phase 1 and Phase 2 land: testing 7 to 9, architecture 6 to 8, security 8 to 9, release 7 to 8, supervision 8
to 9. That gives about 85/100, which would rank second, after Orca and ahead of OpenCode. Closing the remaining
gap to Orca would need breadth and supervision depth from Phase 3, which depends on product decisions.

## 6. Governance corrections

### AX Code Desktop

| Record | Problem | Action |
|---|---|---|
| `AGENTS.md` lines 16, 31, 37-39, 116, 123-124 | Describes a planned product, Phase 3 in progress and unavailable release commands | Rewrite to the ADR-012 live channel; point to a current PRD |
| ADR-009 (release preparation), ADR-010 | Freeze superseded in part by ADR-012, but neither header says so | Add superseded-in-part headers |
| ADR-011, ADR-012, release SPECs (cutover, signed shadow, notarization, migration/rollback, continuity) | Still "pending" | Mark implemented with 7.27.3 evidence after checking receipts |
| Two `ADR-009-*` files | Ambiguous references (for example the builder comment) | Index aliases ADR-009a and ADR-009b; never reuse a number |
| Distribution SPEC v1-v4 | No single current spec | SPEC v5 consolidating v3 and v4; archive v1 and v2 |
| SPEC electron-45-candidate | Pins 45.0.0-beta.1; product ships 44.9.0 | Archive as abandoned |
| PRD streamlit-run v3, usability v2 item 5 | Superseded by analysis-routing v5, links missing | Add supersession notes; archive |
| ADR-005 portfolio service | Never built; supervision shipped as renderer projection | New ADR stating supervision state ownership |
| Shipped WebMCP, browser routing, page interaction, supervision workspace, usability v1, localization, Mermaid | Still "accepted for implementation" | Mark complete; move to `complete/` |
| `prd/`, `adr/`, `spec/` README indexes | Missing entries, wrong statuses, "AX Coder" title | Rebuild indexes |
| Desktop git service and worktree creation | Runtime work without governance | ADR (item 6) |

### AX Code runtime

| Record | Problem | Action |
|---|---|---|
| ADR-031, ADR-035 | Cited by `renderer-contract.ts` but missing | Rewrite as new ADRs |
| ADR-047 D3, ADR-104 | Block TUI tabs | Amend by new ADR (item 11) |
| ADR-103 consequences | Forbid cross-session attention projection | Supersede only if Desktop needs a runtime attention feed |
| ADR-055 D1 | Blocks webhook ingress | Supersede when item 19 is approved |
| ADR-066 D5 vs ADR-183 | Distribution plane conflict | Supersede D5 |
| ADR-163, ADR-155, ADR-211 (hook), ADR-063, ADR-067, PRD-2026-10-07, PRD-2026-10-08 | Status does not match reality | Correct status |
| ADR-256, ADR-108, ADR-055 | Missing superseded-by links | Add links |
| ADR-211, ADR-212 | Duplicate numbers | Annotate in INDEX; refresh "Newest" and "Last reviewed" |
| PRD-2026-10-16 | Non-goals contradict ADR-240/243/252; `../ax-coder` path | Versioned PRD correction |
| Embedded WebMCP spec (both repos) line 123 | Lists Windows arm64 | Correct to x64 |
| Five desktop specs left after the source cutover | Govern removed code | Mark historical, owned by AX Code Desktop |
| `AGENTS.md` | `../ax-computer` should be `../ax-cua`; desktop app name should be AX Code Desktop | Fix |

A backup directory `.internal/backup/adr-prd-pre-audit-2026-10-19/` already exists in the runtime repository,
so another session may be auditing the same records. Coordinate before editing them.

## 7. Do not copy

- Orca's in-desktop orchestration, per-vendor agent adapters, VM and relay estate: duplicate runtime ownership.
- Orca's e2e volume as a target: copy the harness and gating pattern, not the count.
- Effect in the Desktop main process or runtime core: take schema-validated IPC with zod instead.
- Worktree as the only unit: keep the project registry and make worktrees first-class inside projects.
- OpenChamber SSH manager, isolated Spaces backend, tunnels and enterprise mode: boundary or AX Trust ownership.
- Hermes pets, particles, starmap, fleet profiles, messaging gateway, MSIX and the 18k-line `main.ts`.
- 63 machine-generated locales: quality over count.
- OpenCode's mini mode as a third TUI surface: tabs plus the Desktop pop-out cover the need.

## 8. Raw material

`raw/` holds the briefs and every reviewer's full output.
