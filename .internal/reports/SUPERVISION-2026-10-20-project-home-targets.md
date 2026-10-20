# Projects Home identity and child actions

[Plan](../plans/PLAN-2026-10-20-project-home-targets.md). Baseline: `e6eceea2`.

## Reproduced defects

- Two same-title Home cards exposed the same native action name. Their path text truncated the differentiating suffix.
  Pin/new-session names did not identify their project. Compact attention controls relied on a generic count/tooltip
  fallback, which also collided across projects with equal counts.
- Four mounted reproductions failed before repair (`/tmp/ax-project-home-before.log`). Native discovery failed on the
  ambiguous card name (`/tmp/ax-project-home-before-20261020.log`, `home-wide.json`). That baseline screenshot leaves
  the Home cards below the viewport; it is inventory evidence, not visual qualification of those cards.
- A further mounted regression reproduced names differing only by collapsed whitespace: 1 failed, 4 passed
  (`/tmp/ax-project-home-whitespace-before.log`). Name comparison now follows displayed/native whitespace semantics.

No wrong-project mutation was reproduced in the existing handlers. These are target-identity and presentation defects.

## Repair

Home compares its actual displayed titles, preserving custom spelling and the translated Home fallback. Collisions
receive `title · path` names and wrapping path text. A label matching another project's displayed path is also handled.
Unique card titles stay concise. The active card exposes `aria-current`.

Pin/unpin, new-session and attention controls carry their project context. Canonical IDs and existing handlers remain
the source of navigation. Mounted WebMCP calls verify that child actions do not also open the parent card and that the
attention action selects the exact session/directory in compact mode.

The native journey changes pin/theme preferences only in the isolated temporary profile. It records project fields
from that profile, reloads after pinning and restores the pin. The harness now passes that isolated settings-file path
explicitly to journeys; it is not exposed through the UI tool surface.

## Verification

- Five focused mounted tests passed (`/tmp/ax-project-home-unit-final.log`).
- Full UI suite: 565 files, 3,773 tests passed (`/tmp/ax-project-home-full-ui-final.log`).
- Harness/scenario suite: 2 files, 36 tests passed (`/tmp/ax-project-home-harness-final.log`).
- UI typecheck passed (`/tmp/ax-project-home-typecheck.log`); final build passed (`/tmp/ax-project-home-build-final.log`).

- Native WebMCP journey passed (`/tmp/ax-project-home-qualified-20261020.log`): distinct card/child targets, both selected
  project/draft surfaces, independently different attention conversations, pin order and profile read-back, reload
  continuity, unpin restoration, clean CSP and no uncaught renderer exceptions. `home-receipt.json` records 19 native
  actions and bounded profile fields; the pinned project moved first while the other project remained active, then the
  final pinned count returned to zero.
- Visually inspected `home-wide-visible.png`, `home-600.png` and `home-light.png` under
  `/tmp/ax-project-home-qualified-20261020/`. Both same-name paths wrap with their differentiating suffixes
  visible, and child controls remain placed beside the correct card. The journey uses an actual native card click to
  bring cards into view; a below-viewport inventory alone is not presented as a visual check.
- Final script lint passed (`/tmp/ax-project-home-harness-lint-final.log`). Workspace lint and the unchanged 44-entry
  source-text test ratchet passed (`/tmp/ax-project-home-lint-final.log`, `/tmp/ax-project-home-ratchet-final.log`).

- Existing default native journeys passed all 10 checks (`/tmp/ax-project-home-default-regression-20261020.log`),
  including singleton pop-out, approvals, reload and goal/session isolation.
- The Needs You/Live default/minimal journey passed (`/tmp/ax-project-home-portfolio-regression-20261020.log`), as did
  the project-header/scheduled-editor/picker journey (`/tmp/ax-project-home-schedule-regression-20261020.log`).
- `git diff --check` passed. All final native runs used the final built UI; no build was changed while those runs ran.

## Evidence limits and setup corrections

Early post-repair native attempts exposed three driver errors: expecting a temporary-root field that was not part of
the journey context, returning a DOM node from a boolean wait, losing a regex escape in the return-navigation name,
and reading Settings before the responsive sidebar had reopened. The journey now uses an explicit settings path,
boolean conditions, a raw evaluation string for that regex and fresh native discovery of the restored Settings control.
None of these failures is counted as a product defect.

Draft checks verify selected-project/current-card state, the canonical callback target and the rendered draft surface.
They do not submit a prompt or qualify provider execution in that directory. Attention checks use independently distinct
fixture conversation text. Very long paths remain denser than ordinary short project names; the narrower viewport is
an emulated rendering stress case, not a new native minimum-size promise.

No runtime pin, permissions, source ownership or release state changes. Unrelated user work is preserved.

[Advisory receipts](../reviews/project-home-2026-10-20/README.md): Muse completed source/test review with no findings;
Grok timed out without substantive output. Neither performed visual review or qualifies the native-driver corrections.
