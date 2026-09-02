# ADR-003: Extract Desktop with Filtered Git History

| Field          | Value                                                 |
| -------------- | ----------------------------------------------------- |
| Status         | Accepted                                              |
| Implementation | Pending Phase 1                                       |
| Date           | 2026-09-02                                            |
| Deciders       | User; AX Coder and AX Code maintainers                |
| Related        | Active PRD; SPEC-2026-09-02-desktop-source-extraction |

## Context

The live AX Code `desktop/` directory contains ignored dependencies and build output in addition to 2,750 tracked
files. A recursive filesystem copy would import non-source state and discard meaningful Git history. Rewriting the
working AX Code repository would risk user work and invalidate release provenance.

## Decision

Use `git-filter-repo` only in a disposable local clone pinned to the recorded clean AX Code commit. Filter the approved
Desktop paths and support files, retain original author, timestamp, and commit messages, and preserve the generated
`commit-map`. Merge the filtered history into AX Coder with unrelated-history support after its governance baseline is
committed.

The first import preserves `desktop/**` paths. Root support files are included only when the extraction inventory marks
them `move` or `duplicate-temporarily`; they are adapted in later focused commits. Ignored files, local data, secrets,
dependencies, caches, and build output are excluded by construction.

AX Code is not rewritten and its Desktop source is not deleted during Phase 1. Source removal requires the separate
cutover gates in the active PRD.

## Verification

- Record source and target commits, filter-repo version, exact command, and commit map.
- Compare the approved path manifest and SHA-256 content digest at the import boundary.
- Verify representative `git log --follow` history and license/notice files.
- Scan the imported tree and history for credentials and forbidden sibling dependencies.
- Require clean worktrees before and after extraction.

## Rejected alternatives

- Recursive copy, archive extraction, or Finder move: no history and unsafe ignored-file scope.
- Rewriting the live AX Code repository: unnecessary destructive risk.
- Maintaining a permanent subtree sync: creates dual source ownership.
