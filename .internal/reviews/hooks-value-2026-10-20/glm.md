**Verdict: keep the runtime mechanism, demote and simplify the Desktop page — do not expand it.** These are separable decisions with different evidence bars.

**Mechanism vs. page.** Hooks work for power users through config files alone; the runtime (trust gating, vetoes, timeouts, concurrency caps) needs no GUI. The Settings page is only a visibility surface. Since it cannot enable, edit, or run anything, it cannot complete a job end-to-end — it can only explain.

**Strongest case for keeping the page.** Hooks are unsandboxed user code that can silently veto tool calls, and trust state lives outside repositories. When an action is blocked or a command fires unexpectedly, Settings is where users look. A read-only diagnostic view answering "what ran, from which file, trusted how, why blocked?" is a safety-adjacent job that notifications, permission decisions, and the scheduler do not cover.

**Strongest case for removing/reducing.** No adoption, retention, latency, or support-cost data exists; a read-only page is a dead end; orchestration ambitions belong to AX Agent; packs are reminders, not verification receipts, so they don't advance "working changes with evidence"; and the page already ships defects (ambiguous project options, duplicate expand buttons), signaling maintenance cost exceeding attention.

**Valuable jobs if kept:** (1) explain vetoes/firings with event, matcher, command, source; (2) surface per-project trust/validity; (3) tie require-tests-on-stop outcomes into the evidence flow.

**Non-goals:** GUI hook authoring; becoming an orchestrator; automatic recurring spend; claiming security or exactly-once guarantees.

**Priorities:** (1) land the UI repairs under validation; (2) add consented telemetry: page views, fire/block/timeout counts, config errors; (3) demote from top-level Settings to per-project "Advanced"; (4) only with evidence, add trust-grant or enable/disable toggles.

**Falsifiable plan:** 6–8 weeks of telemetry. Hide if hooks are enabled in <5% of active projects, page visits run <1/user/month, and block-confusion support contacts resolve without page use. Invest if blocked-call contacts recur and page views precede resolution. Mechanism removal additionally requires showing config-file users migrating away.
