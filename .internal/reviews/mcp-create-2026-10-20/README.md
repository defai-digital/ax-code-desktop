# MCP create/edit continuity advisory review

Read-only requests used the same concrete repair excerpts and test summary. Tools, shell, writes, web and delegation
were disabled where supported. The runner uses separate temporary working directories. No reviewer saw credentials,
real OAuth responses or a live MCP server. Responses are leads, not final approval.

| Reviewer | Terminal result | Evidence |
| --- | --- | --- |
| Muse | exit 0, 17.8 seconds | [Response](muse.txt), [receipt](muse.status.json) |
| DeepSeek Flash via AX Code | exit 0, 22.5 seconds | [Extract](deepseek.md), [raw](deepseek.txt), [receipt](deepseek.status.json) |
| MiniMax M3 via AX Code | exit 0, 82.0 seconds | [Extract](minimax.md), [raw](minimax.txt), [receipt](minimax.status.json) |
| GLM 5.3 via AX Code | exit 124, 90.9 seconds; internal result timeout, empty answer | [Raw](glm.txt), [receipt](glm.status.json) |
| Grok | process timeout after 95.3 seconds, exit 143 | [Output](grok.txt), [receipt](grok.status.json) |

The prompt, runner and normalization record are retained. GLM/Grok provided no usable review and are not counted as
approval. No request was restarted because of an observation timeout.

## Independent disposition

- **Accepted UX lead:** creation success can coexist with later unsaved edits. Add an inline translated "Unsaved
  changes" status for dirty existing MCP forms and wrap the action row. Native checks require the message after an
  edited create, its absence after unchanged creation, and a correctly targeted update for the remaining edits.
- **Submitted closure:** `handleSave` is an ordinary async handler invoked from the submitted render, not a stale
  memoized callback. Its draft and baseline use the same captured fields. Mounted tests revert to the submitted URL
  and require clean state; native tests check the follow-up PATCH payload and created server name.
- **Array aliasing:** command parsing creates a new array; environment/header edits use map/filter/spread and new row
  objects. No in-place editor mutation was found. These are not deep-copy or secret lifecycle changes.
- **Draft recreation:** edits use local React state. `setMcpDraft` is called by explicit New/selection/handoff actions;
  inventory loads do not recreate drafts. A replacement draft is a real new form and must invalidate a pending save.
  Caching a populated draft by object and directory/name key does not suppress intentional draft replacement.
- **Name/scope identity:** local name editing does not mutate the stored draft selection key. The existing input and
  import paths normalize names; the server validates rather than returning a differently normalized created name.
  Scope/name are locked during a pending create. A same-name inventory arrival is covered: preserve local draft and
  reject duplicate creation, never silently turn it into an update.
- **Handoff encoding:** both load and handoff keys use the same name/directory template. Normalized names cannot contain
  `|`; a path containing that character alone does not create a name/directory ambiguity. Native renamed/default
  cases exercise the actual store handoff, including inventory refresh before acknowledgement.
- **Failure/finally claims:** the prompt intentionally excerpted the success path. The full handler already has catch
  and generation-guarded finally; pending-auth DELETE already catches fetch rejection. The mounted failure/retry case
  explicitly requires name/scope and Create to unlock. MiniMax's stuck-form/no-feedback claim and DeepSeek's claimed
  `setIsSaving(true)` in a load branch are not present in the source.
- **Batching/intermediate renders:** React's real store handoff is exercised natively rather than inferred from the
  sequential setter text. Existing generation cleanup protects unmount and leave/return. No assertion that one or two
  numeric increments alone cause a stale completion was adopted.
- **Other leads:** concurrent OAuth contexts, structured-field editing across every transport switch and sidebar
  deletion during inventory transitions are not qualified by this patch. They remain separate source/test leads;
  no actual authorization or runtime concurrency is claimed.

See [repair evidence](../../reports/SETTINGS-2026-10-20-mcp-create-edit-continuity.md).
