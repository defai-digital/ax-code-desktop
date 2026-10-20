# Grok CLI corrected-evidence discussion

Advisory follow-up to the shared source corrections and reviewer positions.

Reviewer revisions: keep the shared points — name the wait reason, keep stable project/task/run identity, separate Pause schedule from Cancel this run, and consume the existing recap. That does not add automatic approval or a new runtime owner.

Grok: drop “exactly one actionable location” and automatic pop-out/main selection sync. Multiple entries are projections. They are not evidence of duplicate execution. Request cards already share a decision store and scoped receipts.

Muse: Needs You can be the primary decision list. It is not the only legal entry and does not own the runtime. Project names are hidden only on non-request narrow rows. Permission and question cards already show them. Mission Control still shows narrow project identity.

Claude: keep global urgency for blocking decisions, and project grouping for non-blocking execution. Starvation is a hypothesis, so do not add a fairness scheduler. The soft limit of four counts high-touch rows. It is not a measured capacity limit.

Leave draft loss, scroll loss, duplicate review attribution, and starvation out of the redesign case. No screenshots or parallel runtime tests back the reviews. Row evidence is diff counts, not verified outcomes. Multi-run grouping already prefers structured metadata and uses title parsing only for legacy sessions.

Resolutions:

1. Multiple projections. One decision identity and one scoped receipt. Any entry resolves that same decision. A single home can be the default discovery point. It is not required to prevent double execution.

2. Independent focus. Pop-out and main do not sync selection. The user moves between them by explicit navigation. Shared identity lets both windows address the same project, task, and run when opened.

3. Blocking decisions surface globally and keep project identity. Non-blocking execution stays grouped by project. No cross-project fairness queue until starvation is measured.

4. Three PRD acceptance conditions before UI redesign:
- Receipt convergence: resolving a request in any projection writes one scoped receipt and updates every projection of that decision.
- Blocking-card identity: permission and question cards show project, task, and run at every width. Diff counts stay labeled as diffs.
- Control and focus: Pause schedule and Cancel this run stay distinct. Each wait state names its reason. Existing recap remains. Window selection stays independent unless the user navigates.
