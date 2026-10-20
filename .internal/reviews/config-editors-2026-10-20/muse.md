muse: local session messaging disabled: session logging is required
muse: workspace root: /private/tmp (cwd default)
muse: Agent delegation: auto unavailable: workspace is untrusted.
- **Demonstrated — accessibility change is not wired up:** `ModelSelector` and the command `AgentSelector` accept a new optional `ariaLabel`, but no call site in the diff passes it. Their `aria-label` therefore remains `undefined`, leaving the accessible names unchanged. Pass field-specific labels from the command/agent forms and add role/name assertions for the triggers.

- **Hypothesis — a legitimate create may invalidate itself:** `formGenerationRef` changes when `selectedAgentName` or `agentDraft` changes. If the real `createAgent` store action selects the agent or clears the draft before its promise resolves, the layout effect can bump the generation before `handleSave` resumes, causing the successful create to skip selection and draft cleanup. The mounted tests mock the save as a bare promise, so they do not demonstrate this. Verify against the real store action or model its side effects in the mock.

- **Hypothesis — stale completion is not fully rejected:** Only the create-selection and existing-agent field-reset blocks are generation-gated. Any later success handling in `handleSave`, such as toasts or resetting `isSaving`, could still affect the new form or clear the saving state of a newer save. Add an early generation check immediately after the awaited save, before all success side effects, and test resolving a stale save while another save is active.
