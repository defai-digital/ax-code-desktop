# Browser Entrypoint Routing Implementation

Date: 2026-10-13.
Authorization: user requested planning, implementation, tests, commits and merging all branches;
the embedded WebMCP design takes precedence over overlapping browser compatibility changes.

## Behavior

AX Code captures browser routing from its launcher once. CLI/TUI defaults to external Chrome.
Desktop explicitly selects embedded mode and retains the existing launcher-only provider token.
Canonical WebMCP profiles and recognizable legacy Chrome DevTools commands are blocked before
transport creation in embedded mode, including dynamic registration and reconnect. Unrelated MCP
tools continue to work. Chrome-mode runtimes cannot enroll a Desktop provider, even if an inherited
Desktop token exists. Agent access, permission prompts, leases and runtime-owned receipts remain
unchanged. Normal links and OAuth retain their existing opening behavior.

The authenticated native capability additionally attests `browserMode: embedded`. Desktop requires
that attestation before reporting compatibility or enrolling the native browser. A missing field is
incompatible; the permissive legacy behavior introduced by `5572b0c3` is superseded for this feature.
The pane remains usable for human browsing; AI access reports a compatible-worker requirement.
Arbitrary third-party shell/plugin behavior is outside the canonical WebMCP routing contract.

## Source and branch evidence

The producer change is committed as `3cfbd858e` in AX Code. It was integrated with the existing
`main` at `16613c817` using merge `c9f29e2bd`, retaining its snapshot-store repair and release metadata.
The producer's bughunt and sandbox-auto-approval branches already pointed at `16613c817`; those
commits are therefore included without duplicate merges. SDK/OpenAPI types were regenerated in the
producer repository. Producer PRD/ADR-187/spec and index records remain local-only according to
that repository's `.internal` policy; Desktop's corresponding PRD/ADR-013/spec are tracked here.

Concurrent Desktop work had already committed the launcher environment changes in `64f27aa3`.
The routing worktree retains those changes, adds launcher and strict-compatibility regressions,
and resolves browser compatibility conflicts in favor of this design. Other feature commits remain
in history. Task-owned dirty source/governance copies were preserved with SHA-256 manifests under
`/Users/akiralam/.codex/backups/browser-routing-20261013/` before clearing only those paths for merge.
Sibling active release/test worktrees were preserved.

## Validation

- Producer focused routing/provider/default-Chrome tests: 27 passed.
- Producer complete deterministic run on the routing change: 14,216 total, zero failures,
  23 skipped. This run preceded integration of the already-committed snapshot/release update.
- Producer typecheck and SDK generation passed; SDK tests: 272 passed.
- Producer structure check and script suite: 398 passed, 96 skipped.
- Desktop launcher/provider regressions: 11 passed. Full Electron suite: 484 passed.
- Desktop typecheck, ownership/release boundaries and production build passed. Lint passed
  with one pre-existing unused eslint-disable warning in UI test setup.
- Final integrated producer `c9f29e2bd`: typecheck passed; deterministic suite
  14,201 passed, 23 skipped (14,224 total), zero failures. SDK tests also passed again (272).
- Final Desktop integration `b5296f82`: full Electron suite passed again (484).
- After fetching both remotes, `git branch --no-merged main` and its remote equivalent
  returned no branches in either repository. Every current branch tip is contained in main.
  Active sibling worktrees remain intact; only the two task-owned routing worktrees are disposable.

## Rollout boundary

No signed worker/SDK publication, version-tag replacement or consumer pin to an unpublished
artifact occurs in this task. Desktop still consumes SDK 2.6.12 and signed worker 7.25.1. That
worker does not attest this routing field, so strict embedded AI access requires a subsequently
published matching producer and exact Desktop repin/package qualification. Source-level commits
and unit tests do not prove the currently installed application has adopted the new policy.
