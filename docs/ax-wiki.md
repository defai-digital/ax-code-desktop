# AX Wiki on AX Code Desktop

AX Wiki is the AX Code runtime's source-backed repository wiki. The runtime compiles and maintains it, judges its
freshness, and injects it into agent prompts. Desktop displays it, polls maintenance, forwards explicit refresh
requests, and opens the official viewer window. This page is the routing contract for agents working in this
repository: it records where status, problems, design, and evidence live, and deliberately does not copy volatile
status into prose.

## Ownership

| Concern                                                             | Owner                | Reference                                                                                                                                                                     |
| ------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generation, page plan, source hashes, freshness, lint, status       | AX Code runtime      | `ax-code wiki …`; runtime pinned in `config/ax-code-runtime.json`                                                                                                             |
| `<repo_wiki>` prompt injection and the runtime AX-WIKI block        | AX Code runtime      | runtime-managed; see [Freshness and source authority](#freshness-and-source-authority)                                                                                        |
| Wiki tab, maintenance polling, Build/Refresh, viewer launch         | Desktop              | `desktop/packages/ui/src/components/views/WikiGraphView.tsx`, `desktop/packages/ui/src/components/views/wiki/useWikiGraph.ts`, `desktop/packages/electron/src/wiki-viewer.js` |
| Generated pages and manifest                                        | runtime build output | `.ax-wiki/` (gitignored)                                                                                                                                                      |
| Agent routing contract                                              | this document        | `docs/ax-wiki.md`                                                                                                                                                             |

Desktop does not compile or validate pages itself. Build wiki / Refresh only forwards a request to the runtime, and
the viewer is a sandboxed window that loads a temporary offline export produced by `wiki viz --export`. The tab owns a single maintenance poll (1500 ms at
audit time) and refetches the visualization only when the runtime reports a new revision.

Design intent: Desktop owns presentation and lifecycle; the runtime owns content, validation, and rendering. The tab
therefore forwards refresh and launches the canonical viewer instead of shipping a second wiki renderer, and any page
format or graph defect is fixed in the runtime, not worked around in Desktop.

## Freshness and source authority

`.ax-wiki/.manifest.json` records `generatedAt`, `repositoryHead`, per-source SHA-256 hashes, each page's `sources`
and `sourceHashes`, and a `planHash`. Freshness is derived from that data, never stored as a claim:

- the current repository head differs from the manifest `repositoryHead` → stale;
- any cited source hash differs → stale;
- page-level freshness only covers the sources that page cites;
- truth cannot be computed (for example, source discovery fails) → unknown, use for navigation only.

Check it yourself instead of trusting a sentence in a page, a report, or a prompt:

```sh
ax-code wiki status
ax-code wiki doctor
ax-code wiki lint
git rev-parse HEAD
node -e 'const m=require("./.ax-wiki/.manifest.json");console.log(m.generatedAt,m.repositoryHead)'
```

When only the packaged app is present, the same commands run through the bundled runtime at
`…/Resources/ax-code/lib/index-node-tui.js`; an installed `ax-code` on `PATH` runs them directly.

Authority order, highest first:

1. Current source at `HEAD`, exercised behavior, and gate output.
2. `config/*.json` and package manifests (the pins, not a page's restatement of them).
3. Generated wiki pages and the injected `<repo_wiki>` prompt block — navigation only.
4. Status quoted in prose anywhere; status is output of a command, never a stored fact.

A page can be internally consistent, cite real files, and still be wrong about the repository because it was built at
an older head. Regeneration is the only repair. Hand edits are overwritten by the next build and hide staleness.

## Current status and open problems

Wiki health is not project health. Build a current project picture from these tracked sources instead of inferring it
from generated prose:

| Need                               | Start here                                                                       | What to verify                                            |
| ---------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Current release and recent changes | `desktop/CHANGELOG.md`                                                           | Newest version and its dated entries                      |
| Current implementation and pins    | `package.json`, `config/*.json`                                                  | Actual manifests, not versions quoted in a page           |
| Open or fixed problems             | `desktop/CHANGELOG.md` and the current source                                | Reproduction in source and the newest changelog entry |
| Product and architecture decisions | current source and `docs/`                                                       | The shipped behavior                                  |
| Verification and release state     | `desktop/CHANGELOG.md`, `config/desktop-release-policy.json`                     | Version, pins, and the release policy                 |

Read the smallest current record that answers the question, then inspect its cited source. Do not treat a report's age
or title alone as proof that a problem is still open or fixed.

The following wiki-specific findings are durable until their owners close them:

- The recorded audit found a healthy wiki with `freshness: stale` and a manifest well behind `HEAD`; exact page and
  commit numbers, plus the per-page result, live in the report rather than here.
- `wiki viz --export` fails with `Invalid graph text` on this repository at runtime 7.30.1 and 7.27.0. The Desktop
  viewer therefore cannot open a snapshot even while `wiki status` reports `healthy: yes`. See
  [Known failure: viewer export](#known-failure-viewer-export).
- Generated pages can carry superseded pins and false workflow claims inherited from stale source files; regenerate
  them and correct stale tracked sources, never patch generated output by hand.
- The `<repo_wiki>` block is runtime-versioned. Treat any status it reports as navigation only and re-check it.

## Tracked evidence and ignored output

| Kind                                               | Tracked                                      | Gitignored                                                                                                      |
| -------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Documentation                                      | `docs/`                                      | —                                                                                                               |
| Release deploy scripts                             | `.internal/deploy/`                          | —                                                                                                               |
| Source extraction map                              | `.internal/reports/extraction/commit-map.txt` | —                                                                                                              |
| Product requirements, decisions, plans, and reviews | —                                           | `.internal/prd/`, `.internal/adr/`, `.internal/spec/`, `.internal/plans/`, `.internal/reviews/`, and `.internal/reports/` except the extraction map |
| Release runs, verification JSON, logs, screenshots | —                                           | `.internal/releases/`                                                                                           |
| Generated wiki                                     | —                                            | `.ax-wiki/`                                                                                                     |
| Scratch and reference material                     | —                                            | `.tmp/`, `.internal/reference/`, `.ax-code/`, `/AGENTS.md`, `/WX15-HANDOFF.md`                                 |

Rules that follow from this:

- Product requirements, decisions, specifications, plans, reports, and reviews stay on disk and are not published.
  Release evidence under `.internal/releases/` does not survive a fresh clone and is invisible to CI.
- Never commit `.ax-wiki/`; never copy a generated page into `docs/`; a page never replaces this contract.
- This page is the tracked contract; the generated pages are disposable local output.

## Working with the wiki

- Architecture and design questions: check status first, then start at `.ax-wiki/quickstart.md`, follow each page's
  cited sources into current code, and stop when the question is answered. Do not load the whole wiki.
- Version, pin, and workflow-existence questions: read `package.json`, `config/*.json`, and `.github/workflows/`
  directly. Generated pages restate pins and can lag by many releases.
- Never hand-edit anything under `.ax-wiki/**`. To repair pages, regenerate: the tab's Build wiki / Refresh buttons,
  or `ax-code wiki update` when the manifest exists.
- Generation and update are explicit actions with model cost. Do not trigger them from tests, scripts, or unrelated
  work, and do not add them to CI gates.
- If a page disagrees with code: trust the code, name the stale page, and suggest `ax-code wiki update`.

## Known failure: viewer export

Symptom, at this repository's root:

```sh
ax-code wiki viz --export /tmp/ax-wiki.html
# Error: Unexpected error … Invalid graph text
```

`wiki status` still reports `healthy: yes`, and `wiki lint` still reports `ok: yes` with stale and ungrounded-symbol
warnings, so the failure is in snapshot export, not in the stored pages. Reproduction matrix and stack are in the
audit report. In short:

- Reproduced on runtime 7.30.1 (installed bundle whose SHA-256 matches the signed publication receipt) and on a
  runtime 7.27.0 bundle extracted from the ignored release artifacts.
- Minimal reproducer: a manifest that cites one CommonJS source file. A single-line
  `const { alpha, beta } = require("./dep")` exports successfully; the same destructuring spread over multiple lines
  fails with `Invalid graph text`.
- The runtime builds an inventory for each cited source and validates each symbol's `name`, `qualified`, and `kind`
  as graph text. Graph text rejects control characters, so a symbol name containing a newline is rejected. The
  recorded stack is `projectWikiManifest → text5`.
- In this repository the cited offenders are `desktop/packages/electron/src/main.js:3` and
  `desktop/packages/electron/scripts/verify-packaged-electron.test.mjs:12`, both multi-line destructured `require`
  calls.

Consequences:

- "Open official Wiki viewer" fails even though the wiki is present and healthy. Desktop classifies this as
  `export_incompatible`, distinct from a missing wiki or unavailable runtime, and keeps the runtime defect visible
  instead of recommending another build.
- Reading `.ax-wiki/*.md` directly and refreshing pages still work; the export failure does not make the wiki stale
  and is not evidence that generation is broken.
- The defect belongs to the AX Code runtime's wiki graph builder. Desktop must not copy, patch, or pre-process the
  runtime's graph code to work around it; the fix ships with the runtime pin.

## Evidence map

| Question                                       | Read                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Current pins (app, SDK, runtime)               | `package.json`, `config/ax-code-runtime.json`, `config/ax-code-sdk.json`                                                                 |
| Wiki health, freshness, page count             | `ax-code wiki status` / `doctor` / `lint`                                                                                                |
| Desktop tab, polling, refresh, viewer behavior | `desktop/packages/ui/src/components/views/WikiGraphView.tsx`, `.../wiki/useWikiGraph.ts`, `desktop/packages/electron/src/wiki-viewer.js` |
| Viewer security and sandboxing                 | `desktop/packages/electron/src/wiki-viewer.js`                                                                                           |
| UI verification procedure for wiki changes     | `docs/development-webmcp.md`                                                                                                             |

## Related documents

- `docs/development-webmcp.md` — repeatable UI verification for renderer changes.
