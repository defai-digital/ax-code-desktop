### [SEVERITY: HIGH] — Inaccurate aria-label in NeedsYouPopover dialog

**Location:** desktop/packages/ui/src/components/supervision/NeedsYouPopover.tsx:114  
**Category:** Accessibility - ARIA labels and roles  
**Description:** The dialog's aria-label is statically set to "supervision.needsYou.openEmptyAria" regardless of whether the popover is empty or contains requests. This misleads screen reader users about the dialog's content state.  
**Impact:** Screen reader users will always hear the dialog described as "empty" even when it contains actionable permission requests, causing confusion and reducing trust in the interface.  
**Fix:** Dynamically set the aria-label based on the `empty` state:  
```jsx
aria-label={empty ? t("supervision.needsYou.openEmptyAria") : t("supervision.needsYou.openWithRequestsAria", { count: groups.length + unmatched.length })}
```

### [SEVERITY: MEDIUM] — Insufficient context in PermissionBatchBar button labels

**Location:** desktop/packages/ui/src/components/supervision/PermissionBatchBar.tsx:96-98, 108-110  
**Category:** Accessibility - Accessible names  
**Description:** Button labels like "Allow all" and "Confirm allow" lack context about what specific permission is being acted upon and how many requests are affected.  
**Impact:** Screen reader users cannot understand the scope of the action without additional context, increasing cognitive load and risk of accidental actions.  
**Fix:** Enhance button labels to include permission and count:  
```jsx
// Allow button
{armedFor === "once"
  ? t("supervision.batch.confirmAllow", { count, permission: batch.permission })
  : t("supervision.batch.allowAll", { count, permission: batch.permission })}
// Deny button
{armedFor === "reject"
  ? t("supervision.batch.confirmDeny", { count, permission: batch.permission })
  : t("supervision.batch.denyAll", { count, permission: batch.permission })}
```

### [SEVERITY: MEDIUM] — Missing armed state announcement in PermissionBatchBar

**Location:** desktop/packages/ui/src/components/supervision/PermissionBatchBar.tsx:91-111  
**Category:** Accessibility - State communication  
**Description:** When a button is in the "armed" state (first click), there's no accessible indication that a second click is required to execute the action. The visual change (button variant) is not conveyed to screen reader users.  
**Impact:** Screen reader users may not understand that the button requires a second confirmation click, leading to confusion or accidental actions.  
**Fix:** Add aria-pressed or aria-label updates to indicate armed state:  
```jsx
// For Allow button
aria-pressed={armedFor === "once"}
aria-label={armedFor === "once" 
  ? t("supervision.batch.confirmAllow", { count, permission: batch.permission }) 
  : t("supervision.batch.allowAll", { count, permission: batch.permission })}
// Similar for Deny button
```

### [SEVERITY: LOW] — Missing pane context in GridSplitter aria-label

**Location:** desktop/packages/ui/src/components/sessionGrid/GridSplitter.tsx:25  
**Category:** Accessibility - Descriptive labels  
**Description:** The GridSplitter's aria-label comes from a label prop, but there's no verification that this label includes context about which specific panes/sessions are being resized (e.g., "Resize between session 1 and session 2").  
**Impact:** Screen reader users know they can resize something but lack spatial context about what they're adjusting.  
**Fix:** Ensure the label prop passed to GridSplitter includes session/pane context. In SessionGrid.tsx lines 174-190, enhance the label:  
```jsx
label={t("sessionGrid.resizeColumns", { leftIndex: /* left pane index */, rightIndex: /* right pane index */ })}
// Similar for row splitter
```

### [SEVERITY: LOW] — Missing keyboard shortcut discovery

**Location:** desktop/packages/ui/src/components/supervision/PermissionBatchBar.tsx  
**Category:** Accessibility - Keyboard usability  
**Description:** No indication of available keyboard shortcuts for the primary actions (allow/deny) in the PermissionBatchBar, making keyboard-only discovery difficult.  
**Impact:** Keyboard users may not discover efficient interaction methods, reducing productivity.  
**Fix:** Add tooltip or visually hidden text indicating shortcuts:  
```jsx
<span className="sr-only">{t("supervision.batch.allowShortcut", { shortcut: "Ctrl+Enter" })}</span>
// Similar for deny
```
## Disposition (Claude, verified in source)

1. HIGH, rejected: `supervision.needsYou.openEmptyAria` is "Needs you"; the key name is not the text, and nothing says "empty".
2. MEDIUM, no change: the batch group's accessible name carries count and permission ("{count} pending {permission} requests"),
   and the confirm buttons name both.
3. MEDIUM, already covered: a polite live region announces the armed state ("Check the scopes, then confirm. Nothing is sent until
   you confirm."); aria-pressed would misstate a confirm step as a toggle.
4. LOW, no change: each layout has at most one column and one row splitter, and their names differ.
5. LOW, rejected: the batch bar has no shortcuts to announce.
