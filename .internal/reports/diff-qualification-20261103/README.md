# Canonical diff consumer qualification

Date: 2026-11-03. Desktop baseline: `fdc39c9f53b2ffe346e99775a0acece541f06dc9`.
Canonical AX Code source: `912c8f92c4d66d0ad8a2887251c3325bbf8b5718`.
Status: executable source qualification, not a production Desktop integration or released package.

This continues the [integration plan](../markdown-optimization-20261103/canonical-diff-plan.md) after the user requested
another publication check and continued implementation. It implements a consumer parity probe and an alternating
performance probe while the independently installable dependency remains unavailable in the checked channels.
No Desktop product source, dependency, runtime pin, renderer permission, Git operation or sibling checkout changed.

## Publication and CI findings

The timestamped `publication-check.json` records GitHub queries. The latest visible releases remained CLI 7.30.14 and
SDK 2.6.67, and no diff npm package appeared in the accessible organization package list. The source and CLI/SDK
preparation commits are on GitHub; that does not establish a browser package release.

[AX Code CI run 41612753373](https://github.com/defai-digital/ax-code/actions/runs/41612753373) passed its **Diff Wasm
parity and browser worker** job. The overall run failed in the separate security scan, which reported
`GHSA-grv7-fg5c-xmjg` for `braces` resolved as `file:tools/braces`. This report does not adjudicate that finding or change
its policy. Other release jobs are separate evidence, not proof that a diff dependency has been published.
A later pre-commit check found upstream commits `287338ee` (braces registry patch) and `d4d39fec` (benchmark checkout
reporting). This is evidence of follow-up fixes, not a passed rerun or publication. No diff package was listed then.
The engine source and package manifest were unchanged in the GitHub comparison from the qualified commit to that head;
the local qualification remains explicitly tied to the earlier frozen snapshot.

An isolated `pnpm pack` of the unchanged canonical package succeeded. A fresh consumer installation of that tarball
failed: its generated manifest requires **`@ax-code/util@1.3.2`**, and the default registry returned HTTP 404. See
`packed-manifest.json` and `consumer-install.stdout.gz`. This is a concrete dependency-closure failure for this source
package, not an inference from `private: true`. An owner-produced GitHub Release tarball or GitHub Packages version
with resolved/bundled dependencies is sufficient; public npmjs publication is not required. No release was initiated.

## Isolation and reproducibility

The source archive was fetched from GitHub at the fixed commit into a newly allocated temporary directory. The source
archive SHA-256 and origin are in `provenance.json`. The source was not read through a sibling checkout's ignored build
outputs, and no dependency was added to this Desktop workspace. Installed dependencies used the upstream lockfile:

```sh
pnpm --filter @ax-code/diff-wasm... install --frozen-lockfile --ignore-scripts
pnpm --dir packages/ax-code-diff-wasm run build
```

The first build encountered a local rustup `rust-lld` loader failure for `libLLVM.dylib`. Re-running the upstream build
script directly with Node and `DYLD_LIBRARY_PATH` set to that rustup toolchain's `lib` directory succeeded. This was a
process environment workaround, not an upstream source edit. Build receipts and compressed raw logs retain both attempts.
The installed stable toolchain included `wasm32-unknown-unknown`, and wasm-bindgen was exactly 0.2.129.

After install, build and packing, every regular source file was compared byte-for-byte against the downloaded archive;
`source-integrity.json` records the count. Generated build files are outside that comparison. This establishes unchanged
source, not a reproducible-release or supply-chain attestation. The locally packed tarball is not committed or adopted.

Run the Desktop qualification against an explicit trusted canonical `dist/node.js`, from the repository root:

```sh
node .internal/reports/diff-qualification-20261103/probe.mjs /absolute/path/to/canonical/dist/node.js
node .internal/reports/diff-qualification-20261103/benchmark.mjs /absolute/path/to/canonical/dist/node.js
```

The probe resolves the installed Pierre package's public import export through its manifest; it imports no private
Pierre source. It records Pierre 1.2.11, fixture hashes, and all JS/WASM runtime asset hashes. Six fixtures use immutable
Desktop Git snapshots, with deterministic edits and LF/CRLF variants; no checkout reset or file write is involved.

## Functional results

The final probe passed:

- **225 full forward round trips**: canonical diff plus canonical apply reproduced the target bytes.
- **225 exact complete metadata matches** against `parseDiffFromFile`, not just counts or hunk start lines.
- **434 single-hunk reject comparisons**: applying the canonical complement to the original snapshot matched both the
  precomputed-metadata Pierre reject and the existing Pierre reject.
- **216 hunk-bearing fixtures**, including **127 multi-hunk fixtures**. Nine unchanged fixtures are excluded from the
  revert-match fixture count; they do not inflate the 216 count.
- Sorted/non-overlapping one-based ranges; stale source, stale destination coordinate, invalid counts, overlapping
  hunks and malformed Unicode rejection; explicit LF normalization requiring a matching LF source; pre-aborted
  request rejection followed by successful reuse.

Coverage includes small empty/insertion/deletion/NUL cases, CRLF and lone CR, CJK/emoji, gaps around hunk merge
thresholds, seeded repeated lines, six real-source fixtures, a 300,000-character line, mixed newline styles, patch-like
source lines and a nontrivial file without a final newline. `probe.json` retains every fixture result. Mismatched
metadata or revert results make the executable probe fail, even when the canonical forward round trip succeeds.

The adapter proof uses two public APIs already available in Pierre: `processFile(patch, {oldFile, newFile})` returns
full `FileDiffMetadata`, and `FileDiff` accepts that precomputed metadata. Therefore the future consumer can preserve
Pierre's rendering while avoiding its second diff computation. The probe does not mount the actual Desktop renderer.

The only conversion here is canonical one-based empty ranges to unified patch header ranges, plus destination-coordinate
rebasing for a forward complement. Canonical Rust still computes, validates and applies hunks. No second diff kernel
was created. Single-hunk reject is the qualified action; arbitrary multi-select, line-level actions, inverse application
onto modified content and concurrent on-disk edits still need separate qualification.

The unchanged upstream browser smoke passed in **Chromium 156.0.8078.80**: module Worker, strict same-origin CSP with
`wasm-unsafe-eval`, byte round trips, active cancellation, timeout, Worker recreation and close rejection. No shared
memory or COOP/COEP was needed. This is a standalone browser page, not packaged Electron or a Desktop UI journey.
The existing Desktop hunk/cache/patch/navigation regressions also passed: **26 tests across four files**.
Root `check:boundaries` passed. Product source is unchanged from the prior fully gated commit; the full app suite
and build were not repeated for this report-only follow-up. `verification.json` records the checks run here.

## Performance observations

Seven alternating warm Node samples, with exact metadata comparison after every call. The WASM path includes Worker
transfer, patch serialization and synchronous Pierre metadata construction. Medians in milliseconds:

| Input | Hunks | Existing Pierre | WASM plus metadata |
| --- | ---: | ---: | ---: |
| 1,000 lines, sparse | 2 | 0.760 | 0.908 |
| 1,000 lines, fragmented | 20 | 1.017 | 1.119 |
| 10,000 lines, sparse | 2 | 6.549 | 6.256 |
| 10,000 lines, fragmented | 200 | 16.584 | 10.173 |
| 50,000 lines, sparse | 2 | 36.831 | 32.501 |
| 50,000 lines, fragmented | — | Not used as a migration comparison | Canonical work-limit rejection |

The first small call on a new engine took 30.47 ms, excluding module import. The dense 50,000-line input (~1.64 million
UTF-16 characters) exceeded the canonical algorithmic work limit even though it was below the nominal byte/line caps.
The following small request succeeded. The first benchmark attempt stopped at this rejection; the final benchmark
records it explicitly instead of treating it as an empty diff or silently omitting it.

These are diagnostic synthetic samples on an M3 Max under substantial concurrent load (approximately 15/46/44).
They do not establish app-wide speed, p95 latency, main-thread responsiveness or a default adoption threshold. Small
files were slower and synchronous metadata projection still runs in the host. UI scheduling, rendering, cache hits,
Worker eviction and packaged initialization require separate measurements. A canonical rejection requires an explicit,
qualified fallback/large-file state; silent action-path mixing is not acceptable.

## Advisory review and remaining integration gates

Both actual CLIs completed read-only reviews: Muse exit 0 in 34.41 s; Grok exit 0 in 235.11 s. Packets, raw outputs and
readable responses are under `reviews/`. They reviewed the initial 215-fixture/411-revert probe. Their feedback led to
explicit non-vacuous fixture counts, runtime/Pierre/corpus hashes, rejection checks and the expanded final 225-fixture
corpus. They agreed the conversions are adapter logic, not a cloned kernel. Their reviews are not production approval.

Remaining steps, in dependency order:

1. Obtain and verify the owner's independently installable pinned artifact, including dependency closure and assets.
2. Follow existing governance for a dependency/source-boundary change, then add the real consumer with one shared async
   result for rendering, navigation and actions; bounded scheduling; directory/file/revision ownership; and stale-result
   discard. Avoid an unused mock-backed production adapter while the actual dependency is unavailable.
3. Qualify the explicit error/limit fallback, cancellation during computation, synchronous projection cost, host stale-file
   protection and every action being enabled. Source parity does not prove write-time snapshot safety.
4. Test bundled module/Worker/WASM URLs, MIME/CSP and recovery in Electron and all supported package targets. Repeat
   performance work on representative interactive workloads before selecting a default policy.

The prior Markdown optimization remains independently committed. This follow-up commits executable qualification and
evidence only; it does not represent the diff WASM migration as complete. Resolve its commit with
`git log -1 --format=%H -- .internal/reports/diff-qualification-20261103/README.md`.
