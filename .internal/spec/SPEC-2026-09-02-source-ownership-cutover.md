# SPEC: Desktop Source-Ownership Cutover

| Field   | Value                             |
| ------- | --------------------------------- |
| Status  | Implemented and verified          |
| Date    | 2026-09-02                        |
| Related | Local source-cutover PRD; ADR-008 |

## 1. Ownership invariant

At a completed local cutover:

- AX Coder tracks `desktop/**` and all current Electron, web, UI, Desktop documentation, packaging, and shadow-release
  implementation.
- AX Code tracks no `desktop/**` path, Desktop workspace, Desktop Turbo task, Desktop-only root boundary check, Desktop
  CI workflow, or Desktop publication workflow.
- AX Code retains public runtime and SDK contracts used by application hosts. The `webui` compatibility command may
  locate and execute an independently installed application but may not load GUI source from the AX Code checkout.

## 2. AX Code removal set

Remove:

- `desktop/**` after relocating the shared historical changelog and TUI-relevant node-pty permission fix;
- `.github/workflows/desktop-ci.yml` and `.github/workflows/desktop-release.yml`;
- Desktop-only root boundary/version scripts and tests;
- Desktop workspace, Turbo, package scripts, trusted dependency, and workflow path entries;
- public documentation links that resolve into the removed tree.

Prune the lockfile through a reviewed pnpm regeneration. Do not hand-edit dependency snapshots.

## 3. AX Coder retained set

Retain:

- all extracted Desktop source and provenance;
- the exact JSR SDK and signed runtime pins;
- independent CI, CodeQL, manual shadow workflow, source-boundary checks, release policy, and identity manifest;
- compatibility package names and application identity until a separate rebranding decision.

Add an ownership contract check that requires the Desktop packages to exist, rejects sibling AX Code source
dependencies, and requires public release to remain disabled while the release stage is `shadow-only`.

## 4. Verification

AX Coder:

```text
pnpm install --frozen-lockfile
actionlint .github/workflows/*.yml
pnpm run check:boundaries
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

AX Code:

```text
pnpm install --frozen-lockfile
pnpm run check:structure
pnpm run test:scripts
pnpm --dir packages/sdk/js run build
pnpm --dir packages/sdk/js test
pnpm --dir packages/ax-code run typecheck
pnpm --dir packages/ax-code run test:ci -- deterministic
```

Also assert the source tree invariant with `git ls-files desktop` in both repositories and verify both worktrees are
clean after their commits.

## 5. Release freeze

This cutover creates no public artifacts and changes no installed application. AX Coder's existing release-policy gate
must continue to reject public publication. Public release migration remains governed by the release-migration and
user-data-continuity specifications.

## 6. Implementation record

The receiving source-ownership commits are `0a354744ca81f1ac90a1a4f8f11b8697d2e30268` and
`7e92a80736d3e36534df9109dc04d742098d1c1f`. The paired AX Code removal commit is
`6a2e03d90411ddd7141047baa59d4a754f1c4107`. The verification results and rollback anchors are recorded in
`.internal/reports/PHASE-4A-2026-09-02-local-source-cutover.md`.
