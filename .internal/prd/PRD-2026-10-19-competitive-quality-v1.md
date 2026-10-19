# Competitive Quality Program v1

Status: Accepted. Phases 0 and 1 are authorized for implementation by the user's 2026-10-19 instruction to plan, implement,
test and commit the competitive-gap improvements. Phases 2 and 3 are accepted as requirements only; each item needs the
listed ADR or specification before implementation.
Related: ADR-002; ADR-004; ADR-012; ADR-015; ADR-018; SPEC-2026-10-19-renderer-security-baseline-v1;
SPEC-2026-10-19-desktop-e2e-harness-v1. Evidence: `../reviews/competitive-gap-2026-10-19/`.

## Problem

A static review of eleven GUI coding products ranked AX Code Desktop fifth with 76.5/100, behind Orca (88), OpenCode (83),
Hermes Agent (79.5) and the OpenChamber upstream (77.5). Nine independent reviewers agreed that feature breadth is already
competitive. The deficit is verification, structure and boundary hygiene:

- No end-to-end test drives the real renderer. Some tests assert source text instead of behavior.
- The renderer security baseline is implicit: the main window relies on Electron's default sandbox, the packaged CSP allows
  inline scripts, and the web-server CSP allows `'unsafe-eval'`.
- Desktop runs `git worktree add` itself although the AX Code runtime owns worktree execution.
- Several files exceed 3,500 lines, and the Electron IPC contract is untyped.
- Governance indexes and `AGENTS.md` still describe a release freeze after 7.27.3 shipped publicly.

## Goals

Raise the static score to about 85 by fixing verification and structure first, without adding a second runtime, new
credential custody or new external services.

## Phase 0: governance re-baseline

1. `AGENTS.md` describes the live ADR-012 release channel, the current plan and the current status of each phase.
2. The PRD, ADR and spec indexes list every live record with a status that matches the code and release evidence.
   Accepted ADR bodies are not edited; indexes record interpretation and supersession scope.
3. A dated governance report records each correction and the evidence for it.

## Phase 1: verification and hardening

4. **Renderer security baseline (ADR-018).** Every Desktop `BrowserWindow` sets `sandbox: true` explicitly. The packaged
   renderer CSP permits only the inline scripts it serves, by SHA-256 hash, and no `'unsafe-inline'` scripts. The web-server
   CSP drops `'unsafe-eval'`. `runAsNode` stays enabled until the packaged CLI has its own Node launcher.
5. **End-to-end harness (SPEC-2026-10-19-desktop-e2e-harness-v1).** A repeatable command launches the built app with an
   isolated profile and a stub runtime, drives the real renderer over the Chrome DevTools Protocol, and fails on renderer
   boot failure, a missing preload bridge, or any CSP violation. It runs locally and in a manual CI workflow first; release
   gating is a later decision under ADR-012.
6. **Source-text test ratchet.** A boundary check lists the existing tests that read component source and fails when a new
   one is added. Existing entries are replaced by behavior tests over time.
7. **Accurate release metadata.** Builder comments and documented platform targets match ADR-010 and ADR-012.

## Phase 2: structure and supervision (requirements only)

| #   | Requirement                                                                                                             | Owner                 | Required record                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------- |
| 8   | Worktree execution moves to a stable runtime worktree API; Desktop calls the SDK                                        | AX Code, then Desktop | AX Code ADR (stable worktree contract); Desktop ADR (Desktop git scope)         |
| 9   | Typed IPC: schemas generate the IPC contract; `main.js` splits into window, IPC, updater and runtime modules. No Effect | Desktop               | ADR + SPEC                                                                      |
| 10  | Behavior-based splits of `ChatInput-impl.tsx`, `FilesView-impl.tsx` and `git/service.js`                                | Desktop               | none, after item 5 covers the flows                                             |
| 11  | Supervision pop-out window over the existing Mission Control and Needs You projections                                  | Desktop               | PRD supervision v3; process-model spec amendment                                |
| 12  | Multi-run identity from runtime `SessionMetadata.multiRun`; lane actions                                                | Desktop               | SPEC                                                                            |
| 13  | TUI session tabs; TUI review route                                                                                      | AX Code               | AX Code ADRs amending ADR-047 D3 and ADR-104, and replacing the missing ADR-035 |
| 14  | Direction-aware layout (RTL)                                                                                            | Desktop               | Localization SPEC v2                                                            |

## Phase 3: product decisions (requirements only)

TUI plugin slots, code-aware fusion, a canary update channel, a bounded diagnostics pane, external issue links, webhook
routines, remote or mobile supervision, a component story catalog, scheduled-task templates and cross-session search.
Each needs a product decision and the paired records listed in the evidence proposal before work starts.

## Non-goals

- No Rust migration, event shedding or open-paragraph DOM change (settled performance decisions, 2026-10-19 reports).
- No Effect dependency, SSH manager, isolated Spaces backend, tunnels, messaging gateway or fleet profiles.
- No new Windows arm64 target (ADR-010; AX Code ADR-185).
- No change to the compatibility identity, signing identity or updater feed.

## Acceptance for Phases 0 and 1

- Unit tests cover the explicit sandbox preference, CSP hashing for every served inline script, the web-server CSP and the
  source-test ratchet.
- The end-to-end harness passes against a local build and reports zero CSP violations.
- Typecheck, lint, tests, build, locale and boundary checks pass for the committed candidate.
- Commits are scoped by path and preserve concurrent work in this repository and in `../ax-code`.
