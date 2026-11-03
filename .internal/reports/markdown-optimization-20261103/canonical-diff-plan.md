# Canonical AX Code diff integration plan

Status: proposed integration plan, not a shipped Desktop adapter. Source reviewed:
AX Code `912c8f92c4d66d0ad8a2887251c3325bbf8b5718`, Desktop `86fed71500347e9878219c2b98d23abd52d7f8f8`.
This supersedes the earlier duplicate-only WASM assessment. The owner has implemented the required pure kernels.

## Existing capability and required delivery

`@ax-code/diff-wasm` exports an async browser `createDiffEngine` with `diff`, `applyHunks`, `applyPatch`, `compare`,
and `close`. The canonical shared Rust kernels own computation; Desktop retains presentation and existing host actions.
The API already supports abort, timeouts, bounded input/output, strict stale-context rejection and Worker recreation.
There is no reason for Desktop to create another diff kernel or migrate Git/filesystem operations into WASM.

The checked package is private 0.1.0 and references `@ax-code/util: workspace:*`. Its generated `dist/` and `wasm/`
are ignored. The user reports GitHub publication in progress; remote source and CLI/SDK preparation are confirmed,
but the timestamped GitHub query did not yet locate a diff package. A versioned GitHub Release tarball is sufficient;
public npm publication is unnecessary. Consumption needs an independently installable exact-version artifact with
integrity, runtime dependencies resolved or bundled, browser worker/WASM assets and NOTICE. Verify by unpacking and
installing outside the canonical workspace. An SDK/CLI release alone does not establish this artifact exists.

Do not use sibling source, ignored build output or a mutable main-branch URL. Do not publish or change the owner's
release work as part of this Desktop commit. Once an artifact exists, pin it through pnpm (never hand-edit the lockfile),
record provenance and follow the repository's accepted PRD -> ADR -> spec order for source/boundary changes.

## Concrete Desktop integration points

| Current consumer | Integration work |
| --- | --- |
| `components/views/diffHunkRevert.ts:getFileHunks` | Move cache misses behind the canonical async engine; preserve bounded cache and exact input revision identity. |
| `DiffHunkReviewList.tsx` and `usePublishReviewHunks.ts` | Replace synchronous reads with one shared loaded/error/pending snapshot; publish anchors only for the matching directory, file, sides and revision. |
| `PierreDiffViewer.tsx` and its library renderer | Prove a supported precomputed-patch path; avoid adding WASM while Pierre recomputes the same diff on the main thread. |
| `diffHunkRevert.ts:revertHunk` / `useDiffHunkRevert.ts` | Qualify inverse/subset reconstruction and an authoritative stale-file check before any write. Keep write transport and serialization outside WASM. |
| `DiffHunkReviewList.tsx` / `gitHunkPatch.ts` | Preserve actual Git patch identity; same starting line alone cannot certify equal hunk extent/content across engines. |
| `toolDiffUtils.ts` | Retain unified-patch parsing; canonical `applyHunks` does not parse arbitrary Git patch files. |

The canonical engine admits only one in-flight request and rejects overlap. Use bounded host scheduling/coalescing,
not an unbounded Worker per mounted file or unbounded queue. Distinguish superseded queued work from running work;
cancel/terminate running work when needed, and measure recreation cost. UI owner/revision checks remain necessary even
though the engine protects its own request IDs. Close idle engines on owner disposal. An error or cap rejection must
never look like an empty diff; use the existing qualified fallback or explicit large-file/error state.

## Hunk semantics to qualify

Canonical hunks use one-based `oldStart`, `oldLines`, `newStart`, `newLines`, and prefixed lines with four context lines.
Pierre additionally supplies grouped `hunkContent`, separate changed-line counts, complete side spans and header/context
metadata. `reviewHunkNavigation.ts` derives the first changed line from these segments. An adapter must construct the
correct semantics, not simply rename count fields or cast the canonical object to Pierre's `Hunk`.

- Whole forward application must reproduce the target byte-for-byte, including CRLF, Unicode and absent final newline.
- Forward subsets need destination-coordinate rebasing for omitted preceding hunks; full-diff coordinates are not
  automatically valid for a subset.
- Revert uses the modified snapshot as input. Swapping sides/signs and rebasing inverse coordinates requires separate
  tests for each selected hunk, multiple selections, insertions/deletions at start/end and nearby changes. Do not assume
  a newly computed reverse diff has indices identical to the displayed forward diff.
- Do not apply LF-normalized hunks to raw CRLF content. Preserve newline-marker semantics and reject stale context.
- Fixed context width/algorithm choices may split or merge displayed and Git hunks differently. Navigation, rendering,
  staging and revert must agree on the selected change. Compare both side spans and change content, not just an index
  or `newStart`. Hide/reject actions for a proven mismatch.
- Strict kernel validation checks the supplied string. The host still must reject an on-disk snapshot changed after
  preview; a second async compute interval must not widen a stale-write window without protection.

## Qualification and rollout sequence

1. **Delivery:** verify the independently installable artifact, exports, licenses, dependency closure and exact pin.
2. **Read-only comparison:** run canonical and existing results on a bounded corpus without changing user actions.
   Cover real repositories, repetitive/fragmented and long-line files, empty sides, CRLF, CJK/emoji, missing newline,
   boundary limits, invalid data and cancellations. Record segmentation, action identity and byte-exact round trips.
3. **Async preview:** use a shared computed snapshot and a supported renderer adapter only after parity. Test project,
   file and staged/working-tree switches, revision races, Worker load/crash/restart and disposal. Prevent stale paints.
4. **Actions:** qualify inverse/subset reconstruction and host stale-file rejection; migrate actions only when they
   identify exactly the displayed change. Git/staging ownership stays in the existing host path.
5. **Packaged/performance:** prove Vite and packaged asset resolution, MIME, existing CSP (no weakened permissions),
   cold initialization, warm p50/p95 compute, serialization, memory, long tasks and cancellation/recreation. Compare
   total user-visible latency; a kernel win with duplicate rendering work is insufficient. Verify supported platforms.

No Desktop WASM diff adapter, new dependency or staging/revert behavior is included in this Markdown correctness commit.
The complete kernel's existence materially improves feasibility; it does not by itself prove hunk parity, packaged
loading or a Desktop speed gain. Grok/Muse advisory evidence and the GitHub check are retained in `diff-update/`.
