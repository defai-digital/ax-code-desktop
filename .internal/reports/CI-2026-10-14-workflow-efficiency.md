# Desktop CI/CD efficiency review

Date: 2026-10-14. Live GitHub observations collected through 10:44 UTC.
Scope: the independent AX Coder repository. No release, updater, signing identity,
repository setting, accepted ADR, or accepted specification changes.

## Findings and baseline

The repository has three source-controlled workflows: Desktop CI, CodeQL, and
manually acknowledged Desktop Shadow. GitHub also runs a managed Code Quality
workflow. Default CodeQL code-scanning setup is not configured; the custom CodeQL
workflow successfully uploads JavaScript/TypeScript and Actions security results.
The managed quality workflow is not used as a replacement for security analysis.

Successful [Desktop CI run 38493834724](https://github.com/defai-digital/ax-code-desktop/actions/runs/38493834724)
at source `2e771128cdf2e5e9351126a052c71774bdf3ecad` provides this baseline:

| Job                  | Runner seconds | Relevant cost                                                           |
| -------------------- | -------------: | ----------------------------------------------------------------------- |
| verify               |            246 | Build 95 seconds; Vite executes twice, approximately 40 seconds each    |
| packaged-macos-smoke |            239 | Build 150 seconds; Vite executes twice, approximately 64 and 55 seconds |
| native macOS         |             89 | Native capabilities, CORS, animations, WebMCP                           |
| native Windows       |            197 | Native rebuild alone takes 100 seconds                                  |
| native Linux x64     |             60 | Native capabilities and display setup                                   |
| native Linux arm64   |             53 | Native capabilities and display setup                                   |
| Total                |            884 | 14.7 runner minutes, without billing multipliers                        |

These are a sample, not a stable benchmark. Another successful run,
[38374156082](https://github.com/defai-digital/ax-code-desktop/actions/runs/38374156082),
used 408 seconds for verify and 277 for macOS packaging.

Signed [Shadow run 38374173750](https://github.com/defai-digital/ax-code-desktop/actions/runs/38374173750)
took approximately 38.5 minutes including runner queues. Its macOS job waited
approximately 14 minutes after preflight. Queueing and notarization are real
contributors that local build changes cannot eliminate.

## Implemented plan

1. Build the renderer once. The root build invokes a Turbo `build:shell` task
   after the Web build, then copies assets, bundles Electron, and rebuilds native
   modules. Standalone Electron `build` remains self-contained. The shell task
   always runs because its native rebuild changes files in `node_modules`, outside
   declared build outputs. Web cache inputs now include shared settings, PostCSS,
   and the shared Vite plugin.
2. Select checks from the complete Git diff, using a small dependency-free Node
   script instead of duplicated workflow-level path lists. Deleted files and both
   sides of renames are considered. Unknown application paths, missing commits,
   Git failures, initial pushes, weekly runs, and manual runs retain full coverage.
   Event-specific concurrency prevents lightweight pushes from canceling weekly
   full checks or manually requested full validation.
3. Avoid expensive checks when their inputs have not changed:

   | Changes                                                                     | Verification | Build | Four-platform native smoke | macOS package smoke |
   | --------------------------------------------------------------------------- | ------------ | ----- | -------------------------- | ------------------- |
   | Documentation only                                                          | Skip         | Skip  | Skip                       | Skip                |
   | Unit tests only                                                             | Run          | Skip  | Skip                       | Skip                |
   | UI/renderer source or assets                                                | Run          | Run   | Skip                       | Run                 |
   | Electron, server, dependencies, config, deployment, workflows, unknown code | Run          | Run   | Run                        | Run                 |
   | Weekly/manual or unavailable diff                                           | Run          | Run   | Run                        | Run                 |

   Windows bootstrap/ACL tests and Electron packaging script tests retain native
   coverage. Markdown bundled inside application source/assets is application
   content. A small selection job runs even for documentation changes; skipped
   Desktop jobs remain visible rather than leaving workflow path-filter checks
   pending. CodeQL retains its independent triggers and schedule.

4. Simplify CodeQL to analyze and upload directly. Remove the separate tolerant
   upload and obsolete unavailable-upload warning: current uploads work and an
   upload failure should fail the job. Keep `security-and-quality`, which includes
   `security-extended`; remove the redundant suite declaration. Include previously
   omitted deployment and tools paths in triggers.
5. Upload staged and final Shadow installer archives with `compression-level: 0`.
   The assets are already compressed; artifact transport no longer recompresses
   them. Signature, hash, retention, inventory, native installation, upgrade,
   rollback, and profile-continuity requirements remain enforced.

## Value and limits

For a renderer-only change, the sample suggests removing 399 native runner seconds
and approximately 94 seconds of duplicate Vite work. After selection overhead,
this is roughly half the Desktop runner usage. Elapsed improvement is smaller:
the Linux verification job remains on the critical path. Test-only changes also
avoid builds and package jobs. Full source checks benefit from the single Web
build. Weekly runs add one complete validation per week.

These are projections from historical steps, not measured new hosted results.
No Actions settings or managed Code Quality service were disabled. Removing the
whole custom security workflow would lose Actions/security coverage. Shadow
preflight, native rebuilds, package smoke, platform signatures, detached signature
verification, and installation/migration receipts are retained: they validate
different boundaries or bind evidence to the exact candidate SHA.

## Validation and delivery state

- `pnpm install --frozen-lockfile`: passed, no lockfile change.
- Full tests: 3,589 passed, 7 skipped before the final additional Markdown case;
  focused selection/workflow regressions pass after the final changes.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run check:boundaries`,
  `pnpm run check:locales`, and `actionlint .github/workflows/*.yml`: passed.
- `pnpm run build`: passed with cached Web/UI tasks and an executed native rebuild.
- `pnpm run build --force`: passed with zero cached tasks, one Vite build,
  asset copying, Electron bundling, and native rebuild; Turbo reported 41.268 seconds
  on this Mac. This is not a before/after hosted timing comparison.
- Isolated macOS arm64 unsigned packaging with required pinned runtime staging:
  passed. ASAR verification found 636 JavaScript files, 78 renderer files,
  zero loose Electron JavaScript, and a valid fuse/ASAR anchor.
- Isolated packaged application and bundled AX Code v7.25.3 runtime smoke: passed.
- Final focused tests cover full Git rename behavior, more than 300 paths,
  unavailable history, initial pushes, schedules/manual runs, native Windows test
  exceptions, renderer-only changes, and the actual Turbo dry-run task graph.
- Local validation uses Node 26.5.0 and pnpm 10.33.4; CI continues to use Node 24.
- Changes are local and uncommitted. No push, hosted execution of these changes,
  signed Shadow run, or public release was performed. Existing local commits
  outside this task remain intact.

Temporary QA artifacts: `/tmp/ax-coder-ci-qa.x4nKCT`; build, package, and smoke logs
are `/tmp/ax-coder-ci-{cold-build,package,smoke}.log`.

## References

- [GitHub artifact upload compression guidance](https://github.com/actions/upload-artifact#altering-compressions-level-speed-v-size)
- [CodeQL query suite coverage](https://docs.github.com/en/enterprise-server%403.19/code-security/concepts/code-scanning/codeql/codeql-query-suites)
- [GitHub workflow path-filter pending checks](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)
