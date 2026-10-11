# Post-consolidation branch and worktree cleanup

The user explicitly requested cleanup after merging all branches and worktrees,
followed by a commit and push. This extends the earlier consolidation scope;
`MAIN-CONSOLIDATION-2026-10-11.md` records the original integration decisions.

Before cleanup, main and origin/main both pointed to
`328a267e0b152fc6bba16e1619a0f06baed4d0d5`. Every local and fetched remote branch
was an ancestor of main, as were all four linked worktree heads. GitHub had no
open pull requests, and no running command referenced the linked worktree paths.

All 41 Markdown source/evidence files were rechecked against main and their
recorded SHA-256 hashes. All 15 localization source/draft files were rechecked
against their committed recovery archives. The newer reviewed translations
remain active; the older drafts are preserved as evidence. The WebMCP worktree
had no tracked or untracked source changes. Ignored files were dependencies,
generated builds, build logs, and runtime placeholders.

## Recovery backup

The verified local backup is outside the checkout:

```text
/Users/akiralam/.codex/backups/ax-code-desktop/20261011T234730Z-cleanup/
```

It contains a complete pre-cleanup Git bundle, the original reference inventory,
and four hash-verified archives containing all 61 changed/untracked source,
draft, evidence, and symlink entries. Archives preserve symlinks without following
their targets. Generated dependencies and build output are reproducible and were
not copied. Git bundle verification passed before deleting any worktree or branch.

```text
64ec4e552841d0cf8875a0477fc5c26d8769fac0ecb492ffd43da39cd5d44b21  pre-cleanup.bundle
9937d557d9491f5f72e59e483f4cb03f7433973659aab444ba5fa7e674a72253  ax-coder-markdown-completion.tar.gz
362480ec5123d28687a385b4a9927bcbe188380e7238ff189f4ca739eada9b41  .ax-coder-localization-grok-20261011.tar.gz
88c92bab24a62ba623446f695c6c83a444686b7f84080cc7c1ae53cb7cc5309c  .ax-coder-localization-muse-20261011.tar.gz
2f420b1863a3f4fd863d83eebb89811878ad43eaf267485a88faa3e9b55428fb  ax-coder-webmcp.tar.gz
```

## Removed items

- Worktree `/private/tmp/ax-coder-markdown-completion`.
- Worktree `/Users/akiralam/code/.ax-coder-localization-grok-20261011`.
- Worktree `/Users/akiralam/code/.ax-coder-localization-muse-20261011`.
- Worktree `/Users/akiralam/code/ax-coder-webmcp`.
- Local merged branch `feat/embedded-webmcp-v1`.
- Remote merged branches `fix/drop-better-sqlite3-native-dep`,
  `migrate/bun-to-node-pnpm`, `issue-42-chat-retry-history-screenshot`,
  and `release/v7.24.4`.

After cleanup, only the main checkout and main branch remain. The annotated
`v7.24.4` tag, committed research evidence, and other repositories are retained.
Existing dependency symlink targets were not removed.

## Verification

The source commit above passed all seven jobs in Desktop CI run `38184697340`
and CodeQL analysis run `38184697324`. Code scanning upload was unavailable
because the private repository has not enabled Code Security. Local full suites
passed 2,990 tests with one skipped. This cleanup changes only this report and
Git/worktree metadata; it introduces no application or release-policy change.

The final checks verify one worktree, local and remote main only, preserved
`v7.24.4`, a clean working directory, and local/remote main SHA parity after push.
