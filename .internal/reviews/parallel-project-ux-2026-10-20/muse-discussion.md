# Muse CLI corrected-evidence discussion

Advisory follow-up to the shared source corrections and reviewer positions.

muse: local session messaging disabled: session logging is required
muse: workspace root: /private/tmp (cwd default)
muse: Agent delegation: auto unavailable: workspace is untrusted.
**Revised consensus**

All three reviewers keep: clearer runtime waiting reasons, stable project/task/run identity, explicit *Pause schedule* vs *Cancel this run*, and consuming the existing recap. No automatic approvals or new runtime ownership.

**1. Actionable location vs projections**
Revise Grok's “exactly one actionable location” and Muse's canonical queue as sole home. Adopt **one canonical decision record, multiple projections**. Request cards already share a decision store and scoped receipts, so multiple entry points are not evidence of duplicate execution. Needs You, Mission Control, and session views may all act, provided they show the same request identity, resolve it once, and display the same receipt. The queue is a useful projection, not the only place to decide.

**2. Pop-out / main selection**
Revise Grok's synchronized selection. Preserve independent focused work in each surface. Switching or resolving in a pop-out must not silently steal main-window selection, scroll, or draft state. Provide explicit navigation instead: “Reveal in main,” “Open in pop-out,” and a visible indicator when surfaces happen to show the same session. Shared identity, not shared selection.

**3. Global urgency vs per-project grouping**
Adopt Claude's model, narrowed. Use a **global urgency lane only for blocking requests** — permissions, questions, and decisions that stop a run — ordered by waiting time. Keep **project grouping for non-blocking execution and monitoring**, where context and identity matter. This avoids hiding a blocker inside an inactive project without discarding project context. Starvation, draft loss, and scroll loss remain hypotheses, not verified defects, so fairness rules should be framed as acceptance tests, not fixes for proven bugs.

**Essential PRD acceptance conditions before UI redesign**

1. **Identity and receipt integrity:** every project/task/run/request exposes stable identity in all projections; acting from any projection resolves the same request once and shows the same scoped receipt.
2. **Waiting and control semantics:** each waiting run states why it waits and what unblocks it; *Pause schedule* and *Cancel this run* are distinct, labeled, and testably different.
3. **Context preservation:** acting or navigating preserves draft, scroll, focus, and selection; project identity remains available on decision rows — noting it is currently hidden only on non-request narrow Needs You rows, not permission/question cards — and run grouping prefers structured metadata, with title parsing only for legacy sessions.

Existing row evidence is diff counts, not verified outcomes, and the soft limit of four counts high-touch rows, not measured capacity. Neither should be presented as proven limits in the PRD.
