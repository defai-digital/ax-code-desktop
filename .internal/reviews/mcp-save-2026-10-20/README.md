# MCP save isolation advisory review

Grok was bounded to 90 seconds and timed out (exit 143): unavailable evidence, not approval.
Muse completed in 41.2 seconds (exit 0). The prompt covers the initial form-generation repair; the subsequently
reproduced inventory provenance race was not in that review. Neither reviewer approved the final diff.

The prompt, raw terminal responses, runner and terminal status receipts are retained here. The runner uses a temporary
working directory and disables tools, writes, shell, web and delegation where supported. Its unused model definitions
are inherited from the previous runner; only `grok muse` were invoked for this request.

## Disposition of Muse leads

- Draft identity: `loadMcpConfigs` replaces the inventory, not `mcpDraft`. The mounted same-form create test explicitly
  refreshes inventory before mutation completion. Replacing a draft object is an actual form-population event in the
  current implementation, so invalidation is intentional. A new stable draft identity contract is not introduced.
- Extra load dimensions: `selectedMcpLoadKey` contains only name and directory; it does not contain another scope
  dimension as hypothesized. The real issue was the inventory arriving after the directory changed, independently
  confirmed through native WebMCP and addressed with non-persisted inventory provenance.
- Cleanup/status errors: `clearPendingMcpAuthContext` already catches fetch rejection; `useMcpStore.refresh` catches
  status-read errors and stores its diagnostic. These currently do not reject as claimed. Existing mutation failure
  and acknowledged reload-warning feedback remain covered after navigation.
- Array aliasing: the command and environment/header editors produce new arrays/entries. No in-place mutation was
  reproduced. Baseline comparisons now update on every render, including baseline-only save completion.
- Edits during create and concurrent OAuth: these are additional leads, not verified capabilities of this repair.
  The mounted tests cover edits during update, a delayed create after project switch, inventory refresh during create,
  and navigation during pending-auth cleanup. They do not qualify OAuth exchanges or preservation of new edits while
  creating a server. Track those separately rather than treating reviewer hypotheses as confirmed fixes.
- Leave/return and overlapping project saves were already in the concrete deferred tests and remain passing.

Evidence and limits are recorded in [the report](../../reports/SETTINGS-2026-10-20-mcp-save-isolation.md).

Archive normalization removes trailing whitespace and terminal blank lines only. Original prompt SHA-256: `23f3ffc807e5154e5c0894557258a315fa43d782fd6f847fa8d9a3886fac63ac`.
