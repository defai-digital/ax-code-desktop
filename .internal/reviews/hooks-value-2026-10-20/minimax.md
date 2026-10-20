**Two distinct things.** The runtime mechanism (shell commands at lifecycle events) is general-purpose substrate for project-specific enforcement. The top-level Desktop "Hooks" Settings page is read-only diagnostics — trust state, effective rule, packs. They must not be conflated when deciding what to keep.

**Strongest case for keeping the mechanism.** Project-trust gating is the right posture for unsandboxed user code. Blockable calls (e.g. protect-env-files) prevent damage the canonical permission layer cannot anticipate per-project. Packs lower configuration friction for the few high-value patterns: destructive-call blocking, test-on-stop gating, format-after-edit. Teams need per-project policy sitting below AX Trust (enterprise) and above per-session ad-hoc decisions. Removing the runtime pushes users to external scripts that bypass Desktop's trust, output-bound, timeout, and four-process concurrency discipline.

**Strongest case for removing/reducing.** Hooks deliver reminders, not proof: "format-after-edit" does not verify formatting; "require-tests-on-stop" does not prove tests ran. No security guarantee, no exactly-once semantics. We have zero adoption, latency, reliability, or support-cost data. Misleading safety labels are worse than no labels. The Settings page duplicates config-file inspection, contributes to the documented same-name Settings ambiguity, and competes with notifications, permissions, and the scheduler — exactly the "redundant orchestration / recurring spend" the context warns against.

**Recommendation: keep the runtime, demote the page.**
1. Move Hooks under Project Settings, not top-level Desktop.
2. Rewrite packs as *verifiable* guarantees (exit code → recorded pass/fail), not reminders.
3. Hide observation-only hooks from the default surface; lead with blockable events.
4. Label reminders as reminders explicitly.

**Valuable jobs:** project-scoped destructive-call blocking; per-team enforcement below AX Trust; bounded, inspectable shell automation.

**Non-goals:** proof guarantees; durable orchestration (AX Agent owns that); recurring spend without explicit opt-in.

**Hide/remove triggers:** <5% session engagement with the Hooks page over four release weeks; hook failures driving >10% of support volume; verified-guarantee rewrite missing two release cycles.

**Falsifiable validation plan.** Instrument page views and pack-enable events; record hook-induced blocks vs. false-blocks via runtime counters; survey projects that disable hooks. Pass = real verified blocks observed in a meaningful share of opted-in projects. Fail = demote the page, narrow the runtime surface.
