# Round 12 A12 review (Nemotron 3 Super, read-only)

Based on a review of the three files for accessibility and correctness (WAI‑ARIA tabs pattern, screen‑reader announcement of the effect sentence and region, immunity of the effect sentence to page‑supplied text, and edge‑case handling), **no blocking issues were found**.

### Summary of checks

| Area | File | Details |
|------|------|---------|
| **WAI‑ARIA tabs pattern** | `desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx` (lines 496‑558) | <ul><li>`role="tablist"` on the container, each tab has `role="tab"` with correct `aria-selected`, `aria-controls`, and `tabIndex` (active = 0, inactive = ‑1).</li><li>Keyboard handling (ArrowLeft/Right/Home/End) moves focus appropriately.</li><li>Tabpanel has `role="tabpanel"` and `aria-labelledby` pointing to the active tab.</li><li>Tabpanel content is conditionally rendered (removed when not active), which is permissible.</li></ul> |
| **Effect sentence immunity** | `desktop/packages/ui/src/components/chat/PermissionCard.tsx` (lines 384‑386) & `desktop/packages/ui/src/lib/toolHelpers.ts` (lines 404‑419) | <ul><li>The sentence is built solely from `webMcpEffect`, which uses only runtime‑provided call data (`operation`, `toolName`, `element`, `how`) and `origin`.</li><li>No page‑supplied description, tool description, or other metadata is incorporated, preventing a page from steering the wording.</li><li>Fallbacks for missing metadata (empty origin → `"—"`; unknown operation → `"other"` key) ensure a sensible sentence is always produced.</li></ul> |
| **Region labeling** | `desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx` (lines 444‑463) | <ul><li>The native view container has `role="region"` with an `aria-label` that reflects the current `origin` (or a placeholder when empty).</li><li>Label updates when the origin changes, keeping screen readers informed of the framed content.</li></ul> |
| **Edge cases** | All three files | <ul><li>Missing metadata: handled via empty‑string fallbacks and default values.</li><li>Unknown operations: `webMcpEffect` defaults to `"other"` key.</li><li>Long element names: concatenated without truncation (could cause layout overflow but does not affect assistive‑technology readability).</li><li>14 locales: UI strings use the `t(i18n)` function; assuming translation files are complete, no missing‑string risk is evident.</li></ul> |

### Conclusion
No accessibility or correctness defects block the described changes. The implementation follows WAI‑ARIA authoring practices, ensures the effect sentence is derived only from trusted runtime data, and provides appropriate region labeling for screen‑reader users. Edge‑case handling is graceful. If you wish to pursue optional polishing (e.g., truncating long element names or keeping tabpanels in the DOM with `aria-hidden`), those are enhancements rather than requirements.
## Disposition

No blocking issue. Applied the optional point on long element names: the effect sentence caps the page-supplied element name at 80 characters (test in lib/toolHelpers.webmcp.test.ts).
