# SPEC: Desktop Source Extraction and Provenance

| Field           | Value                                         |
| --------------- | --------------------------------------------- |
| Status          | Accepted implementation contract              |
| Source baseline | `1c3eb8cbfa1160c35ec3dbc8d05561b4df248d8c`    |
| Related         | Active PRD; ADR-002; ADR-003; AX Code ADR-067 |

## 1. Baseline

The extraction source is the clean AX Code commit
`1c3eb8cbfa1160c35ec3dbc8d05561b4df248d8c`. It contains the Desktop package-integrity fix, JSR publication
workflow, public app contracts, and removal of Desktop's private `ax-code` package dependency.

The canonical `desktop/**` baseline is:

| Measure                   | Value                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| Tracked files             | 2,750                                                              |
| Git tree                  | `efea35037e5c25ada3fdf4b20f479cb6534b68ec`                         |
| NUL-safe manifest SHA-256 | `a16bbd689f1b688c4a9f1c68e14e73e241cd60bd9a178744a258ec4e91b684b7` |

The manifest digest is computed over the raw output of:

```bash
git ls-tree -r -z <commit> -- desktop | shasum -a 256
```

This includes path, mode, object type, and blob identity without newline-sensitive parsing. The Git tree ID is an
additional exact repository-native check.

## 2. Path classification

| Source                                                       | Classification                  | Target timing          | Verification                                                     |
| ------------------------------------------------------------ | ------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| `desktop/**`                                                 | move                            | Phase 1 history import | Exact tree, manifest, license, and representative history checks |
| `.github/workflows/desktop-ci.yml`                           | move and adapt                  | Phase 2                | Independent CI contract tests                                    |
| `.github/workflows/desktop-release.yml`                      | duplicate temporarily and adapt | Phase 3 shadow         | No public publish before cutover                                 |
| `.github/actions/setup-ax-code-toolchain/**`                 | duplicate temporarily and adapt | Phase 2                | Clean runner setup                                               |
| Desktop fragments in shared CodeQL and structure workflows   | generate                        | Phase 2                | AX Coder-owned workflows cover equivalent paths                  |
| Root Desktop boundary/store/version scripts and tests        | move and adapt                  | Phase 2                | Target script tests pass                                         |
| Shared changelog and GitHub release helpers                  | duplicate temporarily           | Phase 3                | Provenance recorded; AX Code copy retained until cutover         |
| Desktop Winget generator behavior                            | duplicate temporarily and adapt | Phase 3                | Generated manifest contract tests                                |
| Root `package.json`, workspace, Turbo, catalog, and lockfile | generate                        | Phase 2                | No AX Code package graph or sibling paths                        |
| AX Code CLI/TUI/runtime/SDK/native source                    | remain                          | Always                 | Absent from imported source history                              |
| AX Code Desktop source and release entries                   | delete after cutover            | Phase 4 only           | Paired commits and AX Code gates                                 |
| `ax-code webui` or equivalent compatibility launcher         | remain or redirect              | Cutover                | Explicit compatibility test and expiry                           |

Phase 1 filters only `desktop/**`. Support files are ported in focused Phase 2 or Phase 3 commits so root AX Code
workspace history does not pollute the independent repository.

## 3. Filter procedure

Use `git-filter-repo` version identifier `a40bce548d2c` in a disposable directory created with `mktemp -d`. Never run
the filter in either live repository.

```bash
git clone --no-local /Users/akiralam/code/ax-code <work>/source
git -C <work>/source checkout -B ax-coder-desktop-extraction 1c3eb8cbfa1160c35ec3dbc8d05561b4df248d8c
git -C <work>/source filter-repo --force \
  --refs refs/heads/ax-coder-desktop-extraction \
  --path desktop/
```

The target governance baseline must be committed before import. Import with a temporary local remote and an explicit
unrelated-history merge. Do not flatten `desktop/`.

```bash
git remote add source-extraction <work>/source
git fetch source-extraction refs/heads/ax-coder-desktop-extraction
git merge --no-ff --allow-unrelated-histories FETCH_HEAD
git remote remove source-extraction
```

Preserve `<work>/source/.git/filter-repo/commit-map` as implementation evidence under `.internal/reports/`; do not
commit the disposable clone.

## 4. Gates

1. Source and target worktrees are clean at operation boundaries.
2. Source HEAD, Desktop file count, tree ID, and manifest digest match section 1.
3. The filtered branch contains only `desktop/**`.
4. Target `desktop/**` has the same count, tree ID, and manifest digest immediately after import.
5. `desktop/LICENSE`, `LICENSE-MIT`, `NOTICE`, `CHANGELOG.md`, and `SECURITY.md` match byte-for-byte.
6. Representative Electron, web, and UI files retain author/date history through `git log --follow`.
7. The imported history and tree contain no credentials, `.env`, dependencies, caches, build output, or staged runtime.
8. AX Coder governance paths have the same manifest digest before and after the merge.
9. AX Code HEAD, worktree, and refs are unchanged by filtering and import.
10. A second disposable run produces the same filtered HEAD tree.

Any mismatch aborts the import. No cleanup command may delete either live repository or rewrite its history.
