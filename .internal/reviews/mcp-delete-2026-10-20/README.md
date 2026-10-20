# MCP deletion context advisory review

Muse completed in 23.3 seconds (exit 0). Grok timed out after 90.7 seconds (exit 143) with no usable review.
Prompt, runner, raw responses, terminal receipts and archive normalization metadata are retained. Tools, writes, shell,
web and delegation were disabled where supported. Review ran in temporary directories without credentials or real
configuration data. No output is treated as approval of the final patch.

The prompt contains the actual delete store method, sidebar guards/handlers and detail delete handler. The final visual
empty-state ordering and same-name replacement projection handoff followed additional screenshot/native review; neither
was in the advisory prompt. Earlier DeepSeek/GLM/MiniMax discussions retain their
[original scope](../mcp-create-2026-10-20/README.md), not approval of this diff.

## Disposition of Muse leads

- **Canonical context gate:** both production UI callers pass expectedDirectory and the captured UI selection revision.
  Mismatch rejects before busy/fetch. The revision guard and inventory scope handoff were added after this review.
  Undefined remains compatible for internal non-UI callers and means their current active directory, not a preserved
  historic intent. Equality uses the existing canonical config-directory helper and current Directory store values;
  symlink/case-equivalent path identity is not claimed. Native exact registered paths exercise the real callers.
- **Claimed check/act races:** the directory gate through fetch initiation and inventory snapshot through selection set
  contain no await. Relevant getters are synchronous; actual config-update listeners do not change projects. No
  interleaving race was reproduced inside those call stacks. An issued request intentionally keeps its captured origin
  if navigation occurs later; this patch does not cancel acknowledged/in-flight deletes or retarget them.
- **Snapshot reconciliation:** tests cover different-directory same names, current-context missing record, refreshed
  replacement, same-name draft and failed-refresh original/replacement identities. The original-object failure fallback
  preserves previous same-context selection behavior; it does not establish fresh inventory contents after a failed read.
- **Dialog/busy lifetime:** mounted sidebar and detail tests start Alpha deletion, switch, start Beta deletion and finish
  Alpha first. Beta stays disabled/pending until its own completion. Old confirmations also close on context change.
- **Feedback/auth:** origin mutation feedback intentionally remains visible after navigation. Pending-auth cleanup uses
  the captured state key, not the currently selected server name; local auth reset is generation-guarded. Live OAuth,
  unique state issuance and collision handling are not qualified. Directory-identifying late feedback remains a UX lead.
- **Global busy counter:** each real mutation still owns a matched start/finish; rejected context gates start nothing.
  The preceding config-notice repair already removed presentation dismissal from completion accounting. This patch
  does not add a separate operation manager or claim durable runtime lifecycle semantics.
- **Missing cases:** stale rows are removed from the rendered list (including user-scoped rows); Create is disabled and
  forced retry is covered. Native held-read/503/retry cases confirm recovery and exact Beta deletion with Alpha retained.
  Browser tools are checked for discoverability, not their external website/MCP execution. Null/undefined legacy callers,
  all path aliases, physical keyboard containment and runtime idempotency are not fully qualified.
- **Visual advice:** browser tools remain the stable sidebar anchor; loading/unavailable text and retry replace the
  mismatched inventory. Actual screenshot review also corrected the detail empty prompt advertising disabled Add.
  No speculative skeleton animation or runtime phase display was added.

See [repair report](../../reports/SETTINGS-2026-10-20-mcp-delete-context.md).
