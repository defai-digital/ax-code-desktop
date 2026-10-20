# Live sidebar identity and actionable controls

[Plan](../plans/PLAN-2026-10-20-live-project-identity.md). Baseline: `aefd9749`.

## Reproduced defects

1. Two projects with the same custom label and session title yielded identical Live rows. The supervision publisher
   returned only the custom label. Mounted reproduction: 1 failed, 9 passed (`/tmp/ax-live-unit-before.log`).
   The original native inventory and `portfolio-wide.png` under `/tmp/ax-live-identity-before-20261020/` show identical
   visible rows and action names. The narrower initial screenshot had the sidebar closed; it is not evidence of visible
   narrow-sidebar behavior. The final journey explicitly opens the responsive sidebar and excludes hidden mounted rows.
2. Each session's pointer drag wrapper inherited a button role and tab stop despite having no selection click handler.
   Native inventory showed two same-name buttons per row. A mounted test using the actual WebMCP tools and DnD scope
   reproduced two actions where one was expected (`/tmp/ax-live-drag-before.log`).

## Repair

- Needs You and the supervision publisher now share the same duplicate-label/path fallback formatting. A project rename
  recomputes its context without changing session IDs, project IDs, directory routing or state ordering.
- Cross-project activity rows display wrapping context in default and minimal mode, including during title editing.
  Ordinary project-group rows retain their existing layout.
- The pointer-only drag wrapper keeps its pointer listener and node reference, but no longer claims to be a button.
  Real child controls retain their own keyboard and click behavior.
- The native journey selects both conversations through Needs You and Live, in both sidebar modes. Discovery resolves
  fresh refs and checks the resulting conversation marker. DOM name comparisons respect the development adapter's
  bounded names; the first post-repair harness attempt incorrectly expected trailing goal text beyond that bound and
  was corrected rather than counted as a product defect.

## Verification

- Five focused UI files: 35 tests passed (`/tmp/ax-live-unit-final.log`), covering publisher rename updates, Needs You
  targets, Live planning and mounted WebMCP discovery/invocation through the DnD wrapper.
- UI typecheck passed (`/tmp/ax-live-typecheck-final.log`).
- Desktop build passed (`/tmp/ax-live-build-final.log`).

- Native WebMCP journey passed (`/tmp/ax-live-identity-verified-20261020.log`): both Needs You destinations, both Live
  destinations in default/minimal mode, return navigation, 800px/600px context and row bounds, clean CSP and renderer.
  A setup attempt raced the panel's resize debounce; the journey now observes automatic collapse before reopening the
  sidebar and waits for the visible rows to fit inside its animated bounds.
- Visually inspected `live-default-800.png`, `live-minimal-600.png` and `live-600-light.png` under
  `/tmp/ax-live-identity-verified-20261020/`, plus the wide before/after screenshots. The sidebars show both distinct
  directories without horizontal clipping in both themes. Long temporary paths wrap across several lines; this trades
  row density for readable identity. A future compact path design must preserve the differentiating suffix and full
  accessible context. At 600px with the sidebar open, the main work area remains crowded; this is an emulated stress
  case, not qualification of the full layout or a newly supported native minimum size.
- Existing native journeys passed all 10 checks (`/tmp/ax-live-default-regression-20261020.log`), including approvals,
  pop-out consistency, goal revisions and foreign-session isolation.
- Workspace lint passed (`/tmp/ax-live-lint-final.log`); the subsequently adjusted native journey passed focused lint
  (`/tmp/ax-live-harness-lint.log`). Source-text ratchet passed with its existing 44-entry baseline
  (`/tmp/ax-live-ratchet-final.log`). `git diff --check` passed.

## Advisory review and limits

[Review receipts](../reviews/live-project-identity-2026-10-20/README.md): Muse completed the label/layout review with no
findings; Grok timed out without substantive output. Neither reviewed screenshots or the later drag-wrapper repair.
The latter is independently covered by its failing-before/passing-after mounted test and native action discovery.

These are fixture-backed GUI checks, not live provider/MCP concurrency qualification. Same-label project headers and
the Active now fallback remain separate inspection targets. No runtime pin, source ownership, permissions, release or
external account state is changed by this repair.
