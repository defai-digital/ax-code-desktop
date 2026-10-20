# Needs You project identity and native navigation

[Plan](../plans/PLAN-2026-10-20-needs-you-project-identity.md). Baseline: `599f0140`.

## Reproduced defects

Two projects with the same custom label and same session title produced indistinguishable non-request Needs You actions.
The component used the custom label without a disambiguating path. Below the `sm` breakpoint it also hid that label.

- Mounted regression before repair: 1 failed, 2 passed (`/tmp/ax-portfolio-unit-before.log`).
- Native negative run: `/tmp/ax-portfolio-identity-before-verified-20261020.log`.
- The `portfolio-narrow.png` screenshot in that run shows two identical rows without project context.
  `portfolio-narrow.json` records identical visible text and WebMCP action names; row widths do not overflow.
  This is an identity defect, not evidence of a wrong-project mutation.

Earlier native setup runs were not valid product reproductions: the new fixture session-detail route intercepted
`/session/status` and returned 404, preventing normal directory bootstrap. The fixture now returns an empty status map
before matching session IDs, with a behavioral regression. Fixture goals are armed before a reload so initial snapshot
reads do not depend on the first event connection's timing.

## Repair

Project context now sits below the session title and remains visible at narrow widths. When custom labels collide, the
context includes the project directory, formatted relative to home where applicable. Long paths wrap rather than
truncating the differentiating suffix. Unique labels remain concise; unlabelled projects retain path fallback.
The existing canonical session/project selection function is unchanged.

The native harness has an opt-in two-project scenario. Its scoped session, goal and conversation reads prevent a request
for one directory from returning another project's fixture data. Default journeys retain their single-project scenario.
Distinct fixture conversation text lets the native journey verify the result of each click independently of its success
acknowledgement. No model request or project-file write is needed. The theme check changes a preference only in the
isolated temporary profile.

## Verification

- Mounted UI regressions: 3 passed (`/tmp/ax-portfolio-unit-after.log`): duplicate-label context, both navigation targets,
  unlabelled path fallback and concise unique labels.
- UI typecheck passed (`/tmp/ax-portfolio-typecheck.log`).
- Harness/scenario tests: 35 passed (`/tmp/ax-portfolio-harness-final.log`), including directory isolation, session status
  shape, distinct conversations, scoped goals and clearing the extra goal on reset.
- Desktop build passed (`/tmp/ax-portfolio-build.log`).
- Initial post-repair native journey passed (`/tmp/ax-portfolio-identity-after-20261020.log`), including each conversation
  and return navigation. Inspected its 600px screenshot: both paths wrap visibly and the row actions remain within bounds.

- Expanded native WebMCP journey passed (`/tmp/ax-portfolio-identity-final-20261020.log`): unique action discovery,
  navigation to both distinct conversations, return navigation, 800px/600px directory visibility and row bounds,
  light-theme verification, clean CSP and no uncaught renderer exceptions.
- Visually inspected `portfolio-800.png`, `portfolio-600-light.png` and `opened-ses_e2e_other.png` under
  `/tmp/ax-portfolio-identity-final-20261020/`. Paths remain readable and wrap within the rows in both themes.
  The opened conversation independently shows the project B fixture marker.
- Existing native harness passed all 10 checks (`/tmp/ax-portfolio-default-regression-20261020.log`), including
  approval/denial recording, both-window updates, reload and goal revision/foreign-session isolation.
- Workspace lint passed (`/tmp/ax-portfolio-lint-final.log`). The source-text test ratchet passed with its existing
  44-entry baseline (`/tmp/ax-portfolio-ratchet.log`).

The screenshot review also leaves a separate follow-up: same-name sessions in the Live sidebar still use the duplicate
custom label without directory context. This repair covers Needs You; it does not close every project-identity surface.

## Scope

This repairs the existing Needs You list's project identity. It does not qualify provider/MCP isolation, six simultaneous
scheduled executions, every duplicate-name surface, native 600px window support, or full portfolio usability.
Reference-design requirements beyond this defect remain proposed or separately tracked. User changes and runtime pins
are preserved; no public release or push is part of this repair.
