# Claude CLI corrected-evidence discussion

Advisory follow-up to the shared source corrections and reviewer positions.

**1. One actionable location vs. multiple projections**

Keep multiple projections over one identity and receipt store. Request cards already share a decision store and scoped receipts, so several entry points don't by themselves show duplicate execution. The requirement should be consistency: when a decision is made in any surface, every other surface shows it resolved and attributed, with the same project/task/run identity. Grok's "exactly one actionable location" is a fix for a defect that hasn't been shown. I'd drop it unless parallel runtime tests show a double-submit or stale-card race.

**2. Pop-out selection**

Preserve independent focus. Make navigation explicit through a "reveal in main" or "open in pop-out" action, and avoid implicit sync. Syncing selection could cause scroll or draft loss, but that remains a hypothesis, and forced sync would interrupt focused work. Add a sync toggle only if testing shows users lose track of which session is where.

**3. Global urgency vs. per-project grouping**

Use a hybrid. Blocking requests (permissions and questions) go in one global urgency-ordered queue, with project identity always visible. Non-blocking execution status is grouped by project. This keeps Claude's position and takes Muse's canonical queue only for blocking decisions. Starvation is unproven, so fairness should be a measured property, such as oldest-waiting age per project, not a reordering rule. The soft limit of four is a heuristic and shouldn't be presented as capacity.

**4. Three essential PRD acceptance conditions before redesign**

1. **Identity and receipt consistency:** A decision made on any surface shows as resolved, with a scoped receipt and project/task/run identity, on every other surface within a defined latency. This should be verified by a parallel-run test.
2. **Explicit waiting reason and control semantics:** Every non-running item states why it's waiting. Pause schedule and Cancel this run are distinct, labeled, and confirmed, and neither one silently implies the other.
3. **Evidence honesty:** Row evidence is labeled for what it is (diff counts, an existing recap) and never shown as a verified outcome. Hypothesized failures like draft loss, scroll loss, and duplicate attribution each get a reproduction test before any design change is made to address them.

**Revisions to original positions**

- **Grok:** Drop single-location, and make pop-out sync opt-in.
- **Muse:** Limit the canonical queue to blocking requests.
- **Claude:** Keep the hybrid, but stop treating fairness and capacity limits as established. Recognize that Mission Control and request cards already preserve project identity, so the identity gap is narrower than first framed.
