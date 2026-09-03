# PRD: Local Desktop Source-Ownership Cutover

| Field   | Value                                                                      |
| ------- | -------------------------------------------------------------------------- |
| Status  | Complete                                                                   |
| Date    | 2026-09-02                                                                 |
| Decider | User                                                                       |
| Related | Product and Desktop extraction PRD; ADR-008; source-ownership cutover spec |

## Problem

The reviewed Desktop source builds independently in AX Coder, but AX Code still tracks the same production GUI tree,
workspace entries, checks, and release workflow. The temporary duplication makes ownership unclear and conflicts with
the requested boundary: AX Code owns the coding runtime and terminal experience, while AX Coder owns the GUI.

The original extraction sequence delayed source removal until signed release, upgrade, and rollback evidence passed.
Those external gates remain unavailable because AX Coder has no authorized remote or CI secret store. The user has now
explicitly directed the local source cutover to proceed without claiming that the public release cutover is complete.

## Goal

Make AX Coder the only current production Desktop GUI source tree while preserving AX Code's runtime, CLI, TUI,
headless server, SDK producer, native modules, integrations, and intentional compatibility launcher.

## Requirements

1. AX Coder retains the complete reviewed `desktop/**` tree, filtered history, independent workspace, JSR SDK pin,
   signed runtime pin, CI, shadow packaging, and release-policy guards.
2. AX Code removes `desktop/**`, Desktop workspace/Turbo entries, Desktop-only root checks, and Desktop CI/publication
   workflow entry points.
3. AX Code retains contracts consumed by external GUI clients and may retain a launcher that invokes an independently
   installed AX Coder compatibility application.
4. AX Code's CLI/TUI changelog and node-pty installation fix move to runtime-owned paths before `desktop/**` is
   removed.
5. AX Coder remains `shadow-only`; no tag, GitHub Release, updater mutation, package publication, or rebrand occurs.
6. Both repositories receive regression gates that reject a return to duplicate in-tree Desktop ownership.
7. The cutover is recorded as linked commits and is reversible with ordinary Git reverts.

## Non-goals

- Public Desktop release ownership or updater migration.
- Signing, notarization, credential-continuity, upgrade, or rollback claims.
- Application rebranding or compatibility-identity changes.
- Portfolio supervision features beyond the already accepted product plan.
- Removing AX Code's HTTP, SDK, native-host, or computer-use contracts.

## Acceptance criteria

- `git ls-files desktop` is empty in AX Code and non-empty in AX Coder.
- AX Code has no Desktop package workspace, Turbo task, build command, CI workflow, or public Desktop publisher.
- AX Coder independently passes frozen install, boundaries, typecheck, lint, tests, and build.
- AX Code passes frozen install, repository structure, root script tests, SDK tests/build, core typecheck, and the
  relevant deterministic test group after lockfile pruning.
- Public Desktop publication remains fail-closed in AX Coder.
- Both worktrees are clean at the recorded commits.

## Rollout and rollback

Land the AX Coder ownership contract first, then the AX Code removal commit, then record both commit IDs in AX Coder.
If a runtime regression is found, revert the AX Code removal commit; do not rewrite either repository's history or
copy generated output back from AX Coder.

Public Desktop releases remain frozen until the existing signed shadow, update, data-continuity, and rollback gates
pass and a separate human approval enables release ownership.

## Completion evidence

The local source cutover completed on 2026-09-02. AX Coder ownership guards landed in
`0a354744ca81f1ac90a1a4f8f11b8697d2e30268`, the Desktop Winget generator landed in
`7e92a80736d3e36534df9109dc04d742098d1c1f`, and AX Code removed its Desktop tree in
`6a2e03d90411ddd7141047baa59d4a754f1c4107`. The complete verification ledger is
`.internal/reports/PHASE-4A-2026-09-02-local-source-cutover.md`.

This completion applies only to source ownership. Public release ownership, signing, update, upgrade, data
continuity, and rollback evidence remain open under the original Phase 3 and Phase 4 release gates.
