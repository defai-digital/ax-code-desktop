# Desktop branch and worktree consolidation

Date: 2026-10-11

The user explicitly requested merging every branch and worktree into main,
committing the result, and pushing main to the active private repository
`defai-digital/ax-code-desktop`. This supersedes the earlier source-snapshot
decision to leave remote main on v1.4.3. The existing v7.24.4 tag is retained.
No force push, branch deletion, worktree deletion, or public release is required.

## Inventory and resolutions

| Source                                                      | Resolution                                                                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local main / remote release/v7.24.4 at `62731ef4`           | Current independent Desktop workspace and launch animations retained.                                                                                                                      |
| Local feat/embedded-webmcp-v1 at `13e42633`                 | The existing committed history was already contained in main. Remaining authored changes were committed separately at `70e1f6c18bc9102a66112c0b8a47d1583173fba2`, then merged.             |
| Remote main at `deb42aa970f53853d113d8fff91558e77842f03c`   | Historical v1.4.3 root layout is superseded by the independent `desktop/` layout. A history-preserving merge retains main's current tree rather than introducing a second GUI source tree. |
| Remote fix/drop-better-sqlite3-native-dep at `2dc387a9`     | Already an ancestor of remote main; its history is included by the historical merge.                                                                                                       |
| Remote migrate/bun-to-node-pnpm at `663dbf38`               | Already an ancestor of remote main; its history is included by the historical merge.                                                                                                       |
| Remote issue-42-chat-retry-history-screenshot at `037baf3f` | The only unmerged legacy change is a screenshot. Merge the original commit and retain its `issue-assets/42/` file.                                                                         |
| Detached markdown worktree at `2835ca94`                    | All 41 authored source/evidence files match main byte-for-byte. No second code change is needed. Dependency/build symlinks remain local.                                                   |
| Detached localization Grok/Muse worktrees at `2835ca94`     | Complete drafts and source catalogs from both worktrees are retained in hash-verified archives. Keep main's newer reviewed translations and additional keys.                               |

The four linked worktrees still referenced the old `ax-coder-old` location.
`git worktree repair` restored their Git metadata links before inspection.
No worktree contents were reset, stashed, cleaned, or deleted.

The translation archives contain 15 complete files, not selected excerpts.
The inventory, original SHA-256 hashes, catalog differences, and 41 matching
Markdown source hashes are in `worktree-merge-2026-10-11/manifest.json`.
Draft translation values differ from reviewed main in 86 places; the drafts
also omit newer keys. They are evidence inputs, not runtime dependencies.

## WebMCP integration

The source worktree includes accepted implementation PRD/ADR/spec records and
an isolated native browser adapter. Their acceptance changes are merged from
the author's worktree; historical feasibility reports remain unchanged.
No sibling AX Code source or runtime implementation is imported.

Resolve the old Electron 44.7.0 proposal in favor of the already qualified
local candidate 45.0.0-beta.1. Add the exact public SDK 2.6.7 dependency to
Electron main and regenerate the frozen workspace lock. Retain the signed
runtime 7.24.4 pin, startup recovery, local IPC policy, and paired animations.

Move native browser teardown into the shared service shutdown path so normal
quit, restart, and update installation revoke browser access. Close all guest
windows concurrently before waiting for provider revocation acknowledgments.
The agent browser negotiates capability and stays disabled if the selected
signed runtime lacks the provider contract; it does not load sibling code.

## Validation and limits

- Frozen installation passed with the resolved lockfile.
- Full test suites: 2,988 passed, one pre-existing skipped test.
- Focused native-browser, native-adapter, quit, and animation suites: 22 passed.
  New regressions cover cross-window ownership, absent runtime capability,
  and concurrent guest teardown with slow provider acknowledgments.
- Typecheck, lint, boundary/release identity checks, and all 14 locales passed.
- Both translation archives were re-read and checked against every recorded
  original file hash.
- Desktop build and ASAR animation playback passed. All six representative
  clips ended normally with 72 decoded frames each.
- Native Electron control / enabled / enabled-repeat probes passed on the
  retained Electron 45.0.0-beta.1 / Chromium 156.0.8078.12. The new records
  are in `worktree-merge-2026-10-11/native-electron-45/`.

Native and media evidence is local macOS arm64. The merge does not establish
signed Windows/Linux package qualification or publish a new producer runtime.
Public release and updater cutover remain disabled. Remote and local branch
ancestry and main SHA parity are checked after the push.
