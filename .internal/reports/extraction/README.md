# Desktop History Extraction Evidence

## Result

Phase 1 completed on 2026-09-02. AX Coder contains the reviewed `desktop/**` history, and the live AX Code
repository remains unchanged.

| Measure                              | Value                                                              |
| ------------------------------------ | ------------------------------------------------------------------ |
| AX Code source commit                | `1c3eb8cbfa1160c35ec3dbc8d05561b4df248d8c`                         |
| Filtered history commit              | `8a045fc0ad71ef9f768a695e242fabcbec6ebcd3`                         |
| AX Coder import merge                | `a1d62422f150cb775875e58f22db171b91e9d0be`                         |
| Governance parent                    | `59463612903871422ca1de53b6ab3b9daab9769d`                         |
| Desktop Git tree                     | `efea35037e5c25ada3fdf4b20f479cb6534b68ec`                         |
| Tracked Desktop files                | 2,750                                                              |
| Desktop manifest SHA-256             | `a16bbd689f1b688c4a9f1c68e14e73e241cd60bd9a178744a258ec4e91b684b7` |
| Pre/post governance digest           | `0e53f6eec4d3f5adc6772652c514c8cdb34b69cd3c4cfbef8fad39bea8de15d0` |
| `git-filter-repo` version identifier | `a40bce548d2c`                                                     |

The merge commit has governance commit `59463612903871422ca1de53b6ab3b9daab9769d` as its first parent and
filtered Desktop commit `8a045fc0ad71ef9f768a695e242fabcbec6ebcd3` as its second parent.

## Procedure

The extraction used a disposable `--no-local` clone. The live AX Code repository was never rewritten.

```bash
git clone --no-local /Users/akiralam/code/ax-code <work>/source
git -C <work>/source checkout -B ax-coder-desktop-extraction 1c3eb8cbfa1160c35ec3dbc8d05561b4df248d8c
git -C <work>/source filter-repo --force \
  --refs refs/heads/ax-coder-desktop-extraction \
  --path desktop/
git remote add source-extraction <work>/source
git fetch source-extraction refs/heads/ax-coder-desktop-extraction
git merge --no-ff --allow-unrelated-histories -m "Import AX Code Desktop history" FETCH_HEAD
git remote remove source-extraction
```

The first disposable source was
`/private/tmp/ax-coder-extraction.x6mvP9/source`. The independent reproducibility run used
`/var/folders/_k/7sc0bwc55zq_t81br51f6xn40000gn/T/ax-coder-repro.XXXXXX.RQYuzrqNrG/source`.
These paths are diagnostic records, not repository dependencies.

## Commit mapping

[`commit-map.txt`](commit-map.txt) is the exact `git-filter-repo` map from the first disposable extraction.
[`retained-commit-map.txt`](retained-commit-map.txt) keeps the header and mappings whose target is not the zero
object for focused review.

| Map      | Lines |   Bytes | SHA-256                                                            |
| -------- | ----: | ------: | ------------------------------------------------------------------ |
| Full     | 3,601 | 295,245 | `7310ddc92641d3f954782c63fb9d69364baa1d6a5b1efb9402087b36b1892b29` |
| Retained |   798 |  65,399 | `87c3f63b79e1990edb05c1c212c8c1cd39345d31ecf219265c3e30e9d0a27acd` |

The filtered branch contains 797 commits. AX Coder contains 799 commits immediately after the unrelated-history
merge: 797 filtered commits, one governance commit, and the merge commit.

## Verification

- Source, first filtered run, target import, and second filtered run all report the exact Desktop tree, file
  count, and NUL-safe manifest digest above.
- The filtered branch contains only paths below `desktop/`.
- `desktop/LICENSE`, `desktop/LICENSE-MIT`, `desktop/NOTICE`, `desktop/CHANGELOG.md`, and
  `desktop/SECURITY.md` have identical Git blob IDs at the source and target.
- Representative Electron, web, and UI history retains authors, dates, and commit messages through
  `git log --follow`.
- Current-tree and added-history scans found zero matches for the repository's provider, cloud, GitHub, Slack,
  and private-key secret patterns.
- The current tree and imported history contain no tracked `.env`, `node_modules`, `dist`, `out`, staged AX Code
  runtime, or TypeScript build-info paths.
- The tracked `desktop/packages/electron/build/` entries are the five reviewed application icons and macOS
  entitlement source. They are source inputs, not generated build output.
- `git fsck --full` passed for the filtered clone and AX Coder repository.
- AX Code remained clean at the exact source commit, with `main` still three commits ahead of `origin/main`.
- AX Coder has no configured remote after removing the temporary extraction remote.

## Reproducibility

The second disposable run produced the same filtered commit
`8a045fc0ad71ef9f768a695e242fabcbec6ebcd3`, not only the same tree. This closes the Phase 1 reproducibility gate.
