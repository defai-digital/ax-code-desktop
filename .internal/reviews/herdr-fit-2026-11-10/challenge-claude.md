# Second-round review: fit of the candidate decision after corrections

## 1. Retractions and narrowings

I was the Claude reviewer in round one. After the corrections, I change these positions:

- **Promote/verify/PR path: retracted.** Arena implement mode already does verification-first ranking in runtime 7.30.16. Desktop should show that result and hand off to existing tooling. It should not build a winner engine.
- **New-lane retry: retracted.** I inspected no contract proving safe retry, cancel or merge semantics. Without one, a retry button would claim a behavior that may not exist.
- **Lane identities and created-versus-started fields: narrowed.** Most identity facts already exist: metadata `groupId`/`variantId`/`model`/`agent`/worktree, plus AssistantMessage provider, model, variant, path and errors. What remains is display and labeling:
  - `startedRunCount` means sends accepted by routeMessage. It does not mean "running."
  - The first provider call, execution, verification and acceptance are separate states. Each shows "not observed" until evidence exists.
  - Variant shows "unknown" for MultiRun children unless another known source supplies it.
- **"CLI hosting is a forbidden new runtime": retracted.** A PTY terminal already exists. The unevidenced part is semantic supervision and independent process lifetime.
- **"Fallback bypasses policy": withdrawn.** The open question is whether the requested ensemble actually ran and how partial members appear.
- **Rollup change: withdrawn.** I endorse a non-interrupting child-outcome indicator, with running-tree precedence preserved.

I also discount the claim that "this review proved three CLIs return advice." From inside a tool-free consultation, I cannot verify how the other reviewers were invoked or what models actually answered. Self-reported identity is not validated identity, and that is exactly the first check the candidate requires.

## 2. Strongest failure mode

**Read-only consultation removes the value users want from CLIs.** The retained objection says users choose a CLI for its tools, memory and subscription. A read-only, structured-output consultation strips all three. It tests only the "different model's opinion" hypothesis, which Council-style AX features may already cover.

A negative or flat pilot result would therefore look like evidence against external harnesses while answering a different question. Meanwhile, users can already run CLIs as plain shell programs in the existing terminal. Harness-driven work may already be happening there, unsupervised, unattributed and invisible to the baseline.

**The case for earlier external-harness support** does not require semantic agent registration. A minimal version would be an *observed terminal session*:
- Bind an existing terminal tab to an assignment and a worktree.
- Treat the git diff, plus verification of that diff, as the evidence.
- Make no claims about the agent's model, context or internal state.

This brings external writers into evidence-based review early, with no new process lifetime.

**A secondary risk is dependency stall.** The ADR assigns durable orchestration to AX Agent, whose release readiness is not established. If AX Agent slips, every producer-owned item in the candidate stalls. That pressure tends to push the work back into Desktop.

## 3. Smallest useful first slice

**Scope:** source-selection and launch truthfulness, with honest model display, built from existing data only.

**Acceptance checks:**
1. **Same-slug launches:** a mounted-component test first reproduces the case where two same-project launches share a title slug but have distinct `groupId`s. Only then are they selected and grouped by `groupId`, never fused together.
2. **Renamed representative:** after a rename, the run remains eligible through metadata, not title parsing.
3. **Launch state labels:** the UI says "accepted N sends," not "N running." First-provider-call or execution states appear only when backed by an observed event or message.
4. **Child model display:** shows "last observed: provider/model @ time" from AssistantMessage, or "not yet observed." The configured model comes from metadata or config, and unknown config values are validated rather than rendered raw. Variant reads "unknown" where no source exists. No new SDK DTO or endpoint is added until existing config APIs have been inspected.
5. **Fallback ensemble:** the UI shows whether the council/arena tool was actually invoked and which members were partial or unavailable.
6. **Child outcome indicator:** a failed child is visible without paging the user or altering the parent's running state.
7. **Regression and live checks:** the existing 67 tests still pass, plus one live qualification against two real providers. This step is labeled as qualification, not proof of user value.

**Items that must not be labeled Desktop-only:**
- Assignment/handoff records (AX Code / AX Agent)
- External consultation adapters, identity validation and spend accounting (AX Agent, with Trust owning credentials and policy)
- Detached, background or remote lifecycle (producer)
- Launch-observation events beyond what is already emitted (runtime)
- `model_pool` and variant persistence (SDK/runtime)
- The semantics of `groupId` (producer); Desktop only consumes it
- The observed-terminal-session evidence binding: if adopted, its worktree and verification semantics belong to AX Code

**Desktop-only items:** display, labels, the indicator and the mode explanations.

## 4. Dissent to preserve, and the signal that would change the recommendation

**Dissent entry:** "Users' preference for CLI harnesses (tools, memory, subscription) cannot be tested by AX-only or read-only pilots. Sequencing external writers last risks a self-confirming result. A minimal evidence-bound external-writer path, such as an observed terminal session plus diff verification, may need to run in parallel rather than after read-only consultation."

**Measurable signal:**
1. During the baseline period, count write tasks where users leave Desktop or drive an external CLI in the terminal. Record acceptance and defect outcomes and the active human minutes spent.
2. Pre-register the decision threshold after the baseline, not before.

**What changes the recommendation:**
- **Move external writers earlier** if, on matched tasks, the external-harness arm shows a higher defect-free acceptance rate per active human minute than improved AX. The difference must exceed baseline variance, and harness-specific abandonment must be material.
- **Scale back multi-agent UI work** if improved AX shows no reduction in coordination minutes compared with current AX.

This is advisory, not approval.
