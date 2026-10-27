# AX Wiki documentation contract and viewer export failure

## Scope

AX Wiki improvement task. It adds a routing contract (`docs/ax-wiki.md`), a concise runtime-marked AX Wiki block in
`AGENTS.md`, this report, and the Desktop Wiki panel and viewer changes described under "Desktop (implemented in this
change)". It alters no build configuration or generated wiki page. The working tree was clean when the audit began
(`git status --porcelain` empty, `HEAD afebbe31`).

This report records the state that motivated the documentation, not a fix. Desktop-side improvements and the runtime
defect described below remain open; nothing here may be read as a claim that either has landed.

## Verified state at 2026-10-26

| Fact                                   | Value                                  | Evidence                                                          |
| -------------------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| Desktop version                        | 7.30.2                                 | `package.json`, `desktop/packages/{ui,web,electron}/package.json` |
| SDK pin                                | 2.6.53                                 | `config/ax-code-sdk.json`, all three package manifests            |
| Runtime pin                            | 7.30.1                                 | `config/ax-code-runtime.json`                                     |
| Repository head                        | `afebbe31`                             | `git rev-parse HEAD`                                              |
| Manifest head and timestamp            | `82fbda02`, `2026-10-24T01:27:48.792Z` | `.ax-wiki/.manifest.json`                                         |
| Commits between manifest head and head | 56                                     | `git rev-list --count 82fbda02..HEAD`                             |
| Page count                             | 6                                      | `.ax-wiki/.build-report.json`, `ax-code wiki status`              |
| Wiki health                            | `healthy: yes`, `freshness: stale`     | `ax-code wiki status`, `ax-code wiki doctor`                      |

Commands used (installed runtime bundle whose SHA-256 matches
`.internal/releases/latest-cli-7.30.1-operator/installed-runtime-verification.json`):

```sh
node /Users/akiralam/.ax-code/versions/runtime.Dpw2P6/runtime/lib/index-node-tui.js wiki status
node …/index-node-tui.js wiki doctor
node …/index-node-tui.js wiki lint
```

`wiki status` reported a present `.ax-wiki/`, index `quickstart.md`, six pages, a present manifest, `stale: yes`,
`freshness: stale`, and the last completed build. `wiki lint` reported `pages: 6  sources: 4175  symbols: 319` and
warned `wiki.stale` plus five `wiki.ungrounded_symbol` warnings for `modules/config.md` (paths and a producer commit are
listed as symbols but are not in that page's cited sources).

The approved audit recorded all six pages as stale. This documentation run re-ran `status`, `doctor`, and `lint` but
did not emit a per-page freshness listing, so the per-page staleness count comes from that audit; the page count,
wiki-level stale result, and the 56-commit head gap were reproduced here.

## Superseded and false claims inside generated pages

The generated pages are local build output at `82fbda02`, not a description of `afebbe31`. Two classes of wrong claim
were confirmed by comparing them with current files:

1. Superseded pins. `.ax-wiki/quickstart.md:3` and `:52` state the root package is `ax-coder` 7.28.7;
   `.ax-wiki/architecture/overview.md:3` states all three packages are 7.28.7 with SDK 2.6.46;
   `.ax-wiki/modules/config.md:3` states runtime 7.28.5 and SDK 2.6.46. Current values are 7.30.2 / 7.30.1 / 2.6.53.
2. A documentation workflow that does not exist. `.ax-wiki/modules/desktop.md:144` claims `desktop/packages/docs` is a
   workspace with `bun run docs:validate`, packaged by `.github/workflows/docs-source.yml`. `.github/workflows/` at
   `HEAD` contains only `codeql.yml`, `desktop-ci.yml`, and `desktop-shadow.yml`; `docs-source.yml` is absent, last
   recorded in `45a51507` and already absent from the workspace line that the legacy-history merge `62a86cbc`
   retained. `desktop/packages/docs` has no `package.json`, so `bun run docs:validate` cannot run, and the root
   `package.json` defines no such script. The generated page repeated a stale claim from
   `desktop/packages/docs/README.md:32` and `desktop/packages/docs/CONTRIBUTING.md:201`. A follow-up change removed the
   dead references from those files and from `DEPLOYMENT.md`; the generated page keeps the claim until regeneration.

Both classes are repaired only by regeneration. Hand editing a page would be overwritten on the next build and would
hide the manifest's staleness.

## `wiki viz --export` failure

### Symptom

At the repository root, with the installed 7.30.1 runtime:

```sh
node /Users/akiralam/.ax-code/versions/runtime.Dpw2P6/runtime/lib/index-node-tui.js \
  wiki viz --export /tmp/ax-wiki-export-check.html
# Error: Unexpected error, check log file at …/2026-10-26T213546-024-main-085eb03e.log
# Invalid graph text
```

The same command with a runtime 7.27.0 bundle extracted under
`.internal/releases/v7.27.0-operator/upstream/runtime-7.27.0/` produced the same `Invalid graph text` error.
`wiki status` still reports `healthy: yes` and six pages, so export fails independently of wiki presence and health.

### Minimal reproducer

Two synthetic projects outside the repository, each with a one-page `.ax-wiki/.manifest.json` citing a single CommonJS
source file:

| Variant     | Cited source                                       | Result                                      |
| ----------- | -------------------------------------------------- | ------------------------------------------- |
| Single line | `const { alpha, beta } = require("./dep")`         | `Wrote Wiki evidence snapshot: …` (success) |
| Multi-line  | `const {\n  alpha,\n  beta,\n} = require("./dep")` | `Invalid graph text`                        |

The manifest in both cases is the same shape: `schemaVersion: 1`, `generator: "ax-wiki"`, one `quickstart.md` page with
`title`, `summary`, `purpose`, `generatedAt`, `sources: ["src/index.js"]`, `sourceHashes`, and empty `symbols` /
`symbolSummaries`. Only the placement of the destructuring differs. This isolates the trigger to valid multi-line
CommonJS destructuring rather than to page content, manifest size, or the repository under test.

### Mechanism and implicated files

The runtime logs show:

```text
Error: Invalid graph text
    at text5 (…/lib/index-node-tui.js:693:12363)
    at projectWikiManifest (…/lib/index-node-tui.js:693:26168)
    at Object.snapshot3 [as snapshot] (…/lib/index-node-tui.js:977:5509)
```

At that call site `projectWikiManifest` builds an inventory for each cited source and validates every inventory entry
with `text5(item.name, …)`, `text5(item.qualified, …)`, and `text5(item.kind, 64)`. `text5` rejects control characters
with `Invalid graph text`. A multi-line destructured `require` yields a symbol name or qualified name spanning a
newline, which is then rejected.

Cited offenders in this repository, both cited by generated pages:

- `desktop/packages/electron/src/main.js:3` — multi-line `const { app, autoUpdater: nativeAutoUpdater, … } = require(…)`,
  cited by `.ax-wiki/modules/desktop.md`.
- `desktop/packages/electron/scripts/verify-packaged-electron.test.mjs:12` — multi-line destructured `require(…)`, cited
  by `.ax-wiki/development/workflows.md`.

Effect: Desktop's Wiki tab loads the graph through the SDK and offers "Open official Wiki viewer"
(`desktop/packages/electron/src/wiki-viewer.js`, command `desktop_open_wiki_viewer`), which shells out to
`wiki viz --export` and surfaces only the generic `wiki.graph.viewerFailed` message. A user sees a healthy wiki with a
viewer that cannot open. Reading `.ax-wiki/*.md` directly and refreshing pages are unaffected; the failure does not
mean the wiki is missing and does not explain the stale manifest.

Ownership: the defect is in the AX Code runtime's wiki graph builder. It cannot be repaired in Desktop without
duplicating or pre-processing runtime graph code, which the source boundary forbids.

## Desktop implementation versus runtime handoff

### Desktop (implemented in this change)

Baseline behavior at `afebbe31` hid disabled maintenance, collapsed refresh failures, and turned every viewer failure
into misleading rebuild advice. This change now:

- distinguishes reported, disabled, and transport-failed maintenance reads; a disabled refresh is not reported as
  started, and late responses cannot replace another project's state;
- treats `reason: "disabled"` as the runtime's neutral unattached fallback, while permissions and non-Git states get
  actionable messages; a failed phase renders one message rather than a duplicate phase and reason;
- returns only the safe viewer failure codes `runtime_unavailable`, `wiki_missing`, `export_incompatible`, and `failed`;
  raw child output, project paths, and configuration never cross IPC;
- classifies the documented `Invalid graph text` failure as `export_incompatible`, keeps the pages readable, and says a
  runtime fix is required instead of recommending a rebuild or Desktop update;
- covers temporary-directory, spawn-path, empty-export, load-failure, cleanup, shutdown, disabled-refresh, and
  project-switch behavior with regression tests.

Freshness calculation and `wiki.enable` remain runtime-owned. Desktop did not add a parallel health CLI, automatic
maintenance controller, or second graph renderer.

### Runtime handoff (external, open)

1. `wiki viz --export` rejects valid multi-line CommonJS destructuring. Expected behavior: normalize or reject
   inventory symbol text at extraction, or stop treating function-local destructuring as a graph symbol. The minimal
   pair above is the acceptance case: both variants must export.
2. Prompt injection. The approved task expects the `<repo_wiki>` block to warn when the wiki is stale and to list page
   cards. Reconciliation for the runtime owner: the pinned 7.30.1 bundle's `renderAxWikiProtocol` accepts `freshness`
   and `cards` and has a stale branch, but `maybeRenderAxWikiProtocol` calls `getWikiStatus` without `repositoryHead`,
   so HEAD-only drift cannot downgrade freshness in the prompt path, and page-level freshness is not consulted there.
   This documentation task did not capture a live session prompt; the handoff should include one before deciding
   between a runtime fix and a configuration fix. No runtime source was edited.
3. `/experimental/wiki-maintenance` and `/experimental/wiki-visualization` remain runtime APIs; Desktop consumes them
   through the SDK only.

## This change

- `docs/ax-wiki.md` (new): ownership table, freshness and authority order, current release/problem/design/evidence
  routing, tracked versus gitignored evidence, working rules, known export failure, and evidence map.
- `AGENTS.md`: the runtime owns the generated `AX-WIKI` marker contents; the repository-specific pointer to
  `docs/ax-wiki.md` stays outside those markers and survives `wiki update` / `ensure-agents`.
- Desktop API, hook, panel, viewer, localized messages, and focused regression tests implement the behavior above.
- `.internal/reports/README.md`: index entry for this report.
- This report.

The ignored `.ax-wiki/` output was regenerated with `defai-01-ax-trust-com/deepseek-flash`: six pages generated and
zero generation-validation issues. It is not part of the commit. Deliberately not done: no runtime parser or prompt
fix, no generated-page hand edits, and no changes to the separate stale `desktop/packages/docs` workflow references.

## Verification

- `wiki status`, `wiki doctor`, `wiki lint`, and both export attempts were run against the repository at `afebbe31`
  before Desktop edits; the audit outputs above are verbatim summaries.
- The minimal reproducer ran in two throwaway directories under `/tmp`; the single-line variant exported, the
  multi-line variant failed. Only temporary files were written.
- Focused UI tests: three wiki test files, 23 tests passed. Focused Electron viewer tests: 19 tests passed (after the review rounds below).
- Root `check:boundaries`, `check:locales` (14 locales), `typecheck`, `lint`, `test`, and `build` passed. The full Web
  package portion reported 138 files and 1,525 tests passed with two skipped; all other package suites also passed.
- WebMCP opened the built Wiki panel in the isolated fixture and captured `/tmp/ax-wiki-panel-open.png`. The stub
  visualization endpoint returns an error and does not provide maintenance/viewer fixtures, so this observation does
  not qualify those two runtime-backed states; their behavior is covered by the component and Electron tests.
- GLM 5.3 performed a read-only final review and approved the change with zero structured findings. It verified the
  neutral disabled state, runtime-focused incompatibility message, marker ownership, safe filesystem/process handling,
  IPC confidentiality, regression coverage, and status/problem/design/evidence routing. Its duplicate-heading
  observation was fixed. The parent run supplied the full gates and WebMCP evidence unavailable inside that read-only
  review session.
- Documentation links resolve to existing files: `docs/ax-wiki.md`, `docs/development-webmcp.md`, `AGENTS.md`,
  `.internal/reports/README.md`, `desktop/packages/ui/src/components/views/WikiGraphView.tsx`,
  `desktop/packages/ui/src/components/views/wiki/useWikiGraph.ts`, `desktop/packages/electron/src/wiki-viewer.js`,
  `.internal/reports/INTEGRATION-2026-10-17-official-wiki-viewer.md`, `.internal/adr/ADR-018-renderer-security-baseline.md`.

## Review and fix rounds

Before commit, the Desktop diff went through three external review rounds in a disposable worktree: muse (read-only)
and grok reviewed independently, grok implemented the fixes, and muse verified each round.

| Defect                                                                                                                                   | Found by    | Fix                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| A vanished or unreadable project cwd was reported as `runtime_unavailable`: Node sets `error.path` to the executable for a bad cwd too   | muse, grok  | Re-check the binary after spawn `ENOENT`/`EACCES`; the test uses the real Node error shape |
| A poll sample in flight across a refresh overwrote the refresh status and rewound the revision                                           | muse, grok  | `maintenanceWrite` counter; a poll drops its sample when a refresh moved it          |
| Shutdown during the export HTML check left a viewer window and its temporary directory behind                                            | muse, grok  | Re-check `stopping` after the read, before the window is created and registered     |
| Viewer tests used the POSIX binary name on Windows                                                                                       | grok        | Tests name the binary as the viewer does (`node.exe` on win32)                       |
| A bundled `node` without the execute bit passed the `F_OK` check and was reported as a generic failure                                   | muse        | `X_OK` check on non-Windows, both before spawn and when classifying                  |
| Shutdown during failure classification resolved a failure the renderer would show during quit                                            | muse        | Re-check `stopping` after classification                                             |
| `wiki.graph.phase.failed` stayed in all catalogs after the failed phase moved to `wiki.graph.maintenance.failed`                          | muse, grok  | Key removed from `en.ts` and the 13 locale catalogs                                  |

Each production fix has a regression test that failed when the fix was reverted (mutation probes by grok, repeated by
muse, and for the poll guard by the parent run). The final muse round reported `VERDICT: CLEAN`. After the fixes, root
`check:boundaries`, `check:locales`, `typecheck`, `lint`, `test` (scripts; UI 698 files / 5,297 tests; Web 1,525 passed,
2 skipped; Electron 1,207 passed, 1 skipped), and `build` passed.

## Open questions and limits

- The exact prompt text a live session receives was not captured; the runtime reconciliation above is based on the
  pinned bundle's call graph, not on a recorded request.
- Page-level staleness counts come from the approved audit; this documentation run reproduced the wiki-level stale
  result and head gap but did not produce a per-page freshness listing.
- The stale `desktop/packages/docs` references to `.github/workflows/docs-source.yml` and `bun run docs:validate` were
  removed in a follow-up change. `desktop/docs/GITHUB_RELEASE_PUBLISHING.md:37` still lists `pnpm run docs:validate`
  inside its not-yet-enabled legacy release flow and was left for that flow's owner.
- Release evidence for this audit is intentionally absent from `.internal/releases/`; every fact above is reproducible
  with the commands listed and needs no untracked artifact.
