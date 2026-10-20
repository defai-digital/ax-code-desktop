# Configuration feedback advisory review

Grok timed out after 90.3 seconds (exit 143), producing no usable review. Muse completed in 38.9 seconds (exit 0).
Both requests used the complete configUpdate helper and feedback component, plus the concrete negative-test/repair
summary. Tools, shell, writes, web and delegation were disabled where supported. Temporary working directories and
terminal receipts are retained with prompt, runner, response and normalization metadata. No credentials were supplied.

This is not approval of the final diff. The WebMCP provider was described but not included in the prompt; its actual
field is separately covered by unit/native evidence. The final opaque-card/logo contrast adjustment followed screenshot
inspection after the review. Prior DeepSeek/GLM/MiniMax discussions retain their original create-edit scope in
[the five-model record](../mcp-create-2026-10-20/README.md); they do not review this patch.

## Disposition of Muse leads

- **Unmount/remount:** presentation state and the deadline are intentionally local to the component lifetime, not a
  durable operation timeline. Desktop mounts this component independently of selected project, Settings page and
  initialization state (`isBootShell` is false for Desktop). A document/App recovery may show the notice again. Mounted
  cleanup verifies unmount removes the timer while leaving the operation pending. No cross-remount dismissal/deadline
  persistence is claimed. The fresh-cohort test explicitly covers finish/start in one React batch.
- **Overlapping messages:** anonymous start/finish calls retain the latest detail message; they cannot associate a
  completion with its original message. This pre-existing limitation is not solved by a cohort id. The title/wait copy
  is generic and the new id only controls presentation, not a verified runtime phase or per-operation timeline.
- **Reload safety:** the existing explicit timeout Reload app behavior is preserved, not qualified as safe cancellation
  or durable resumption. This patch fixes Dismiss stealing completion counts, not runtime recovery/transaction ownership.
- **Keyboard/focus containment:** the overlay blocks pointer access but does not make the underlying app inert or trap
  focus. No accessibility or physical-keyboard qualification is claimed. The new native flag makes that presentation
  observable without pretending semantic handler calls establish physical access. Focus handling remains a separate lead.
- **Idle message notifications:** an idle message can differ between the getter and a subscribed component until the
  next start; no overlay is visible then and start resets/notifies its active detail. This has not established a visible
  defect. It is not silently changed along with the timeout repair.
- **Timer extension:** the effect depends on active state/cohort id, not the operation detail. Message changes do not
  reset it. Tests exercise a new cohort's full 120 seconds and unmount cleanup without changing timeout configuration.
- **Missing native source:** acknowledged. Unit and native tests independently compare the actual provider field with
  rendered overlay markup and hit testing. No unreviewed excerpt claim is counted as external-model approval.

See [verification report](../../reports/SETTINGS-2026-10-20-config-update-observation.md).
