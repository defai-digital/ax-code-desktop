**Verdict:** The runtime mechanism is plausibly high value; the Desktop Settings page is low value as designed and should be demoted, not removed yet.

**Strongest case for keeping**
- Hooks are the only runtime path to deterministic, user-owned guardrails. Blocking PreToolUse on protected paths is a real safety job that notifications and permission prompts do not cover.
- Project-level, trusted-by-default-off configuration fits a multi-project supervisor. Users need to know which project's hooks are live and why one is disabled.
- The page is read-only, so its risk and spend surface is small. Diagnosing "why did the agent stop" requires seeing effective hooks and their source.

**Strongest case for removing or reducing**
- The packs oversell. Format-after-edit and require-tests-on-stop are reminders, so the page implies verification Desktop does not have. That conflicts with the "working changes with evidence" priority.
- A top-level page for a feature with zero measured adoption competes with scheduler, recaps and permissions for attention. It already shipped with ambiguous same-name options and duplicate controls.
- Orchestration risk. If hooks grow into durable workflow, they duplicate AX Agent and AX Trust ownership.

**Valuable jobs to keep**
1. Explain trust state and effective hooks per project, with source.
2. Surface hook vetoes and timeouts in recaps and notifications, linked to the hook.
3. Open the config file for editing in the user's editor.

**Non-goals**
- Editing, enabling or running hooks from Desktop.
- Marketing packs as proof of formatting or tests.
- Recurring hook execution or scheduling.
- Policy enforcement, which belongs to AX Trust.

**Recommendation**
Keep the mechanism. Move the page under an Advanced or Diagnostics section, rename pack descriptions to "reminder" language, and finish the duplicate-control repairs before any promotion.

**Falsifiable validation, 60 days**
- Instrument: projects with any trusted hook, hook fires, vetoes, timeouts, page opens, open-config clicks, support tickets mentioning hooks.
- Hide the page if fewer than 5 percent of weekly active projects have a trusted hook and page opens trail scheduler opens by more than 10x.
- Remove consideration if vetoes per week are near zero and timeouts exceed vetoes, since then hooks cost latency without preventing anything.
- Promote only if veto events correlate with fewer reverted changes in recaps.
