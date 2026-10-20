# Populated Hooks and Settings project targets

Date: 2026-10-20. Authorized scoped UI diagnosis/repair under the existing WebMCP Settings audit and RS-01/09/10.
Baseline: `7723a594`. No runtime/SDK ownership or published contract changes are planned.

## Leads to reproduce

- SettingsProjectSelector renders formatted names without paths, including when distinct projects have the same name.
  Unlike repaired portfolio targets, a user or native tool may not be able to distinguish the desired Settings project.
- Multiple long Hooks commands have identical expand/collapse names and no explicit controlled-content association.
  Verify native targeting and independent expansion before deciding the correction.
- Hooks refresh and late responses must retain the correct project. Exercise populated content instead of relying on
  the malformed/default fixture's retry screen. Treat source suspicion as a lead, not an established defect.

## Work and acceptance

1. Extend the isolated opt-in stub with directory-scoped Hooks workspaces and read telemetry; default behavior remains
   unchanged. Test scope and controlled failure behavior. Never execute commands or write real project configuration.
2. Add a native WebMCP journey over two same-name projects with two long commands. Capture negative native names and
   DOM evidence before any production repair. Use fresh target resolution and independently read each project's payload.
3. Repair confirmed ambiguity within current UI patterns. Keep project identity visible and accessible; relate each
   command expander to its own content without repeating command text in action names. Preserve normal short labels.
4. Add mounted regressions for collisions and independent expansion; cover refresh/error recovery and late project
   responses. Test the actual interaction rather than source-text presence.
5. Run focused tests, UI typecheck, lint and build, then native populated Hooks and complete Settings regressions.
   Inspect screenshots at wide/narrow widths and light/dark themes. Keep scope failures and harness failures explicit.
6. Use bounded Grok/Muse advisory review for the concrete diff; independently reproduce actionable findings. Earlier
   DeepSeek/GLM/MiniMax review evidence remains recorded; timeouts are not approval. Commit only scoped changes/evidence.

The numeric blur/focus lead from the prior config-editor run remains separately recorded; this repair cannot claim
to resolve it without a controlled reproduction. Do not weaken the maximum-clamp assertion or add driver-side clamping.

Follow-up evidence: native selection loads the correct workspace but leaves the project menu expanded. The pinned
Base UI MenuRadioItem defaults `closeOnClick` to false. Earlier repeated-selection tests incorrectly assumed dismissal.
For this one-choice navigation surface, explicitly dismiss after selection and test dismissal plus repeated switching.
This is a scoped interaction improvement, distinct from the reproduced name ambiguities.
