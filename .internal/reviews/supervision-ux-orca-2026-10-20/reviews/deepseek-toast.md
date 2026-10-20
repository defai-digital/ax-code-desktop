## Review (read-only) — conclusions

**No confirmed bugs found.** The change is correct for the paths I traced. Findings below are ordered by risk.

### 1. ChatContainer remount cancels the hook's cleanup (MEDIUM, latent)
`ChatContainer` returns early at `ChatContainer.tsx:964` (`!currentSessionId`) and again at `:973` / `:1030` for hydrating/empty states. In the main window, `ChatView` → `ChatContainer` sits inside `MainLayout` (`App.tsx:1000-1001`), so switching between the "new session" draft composer and a session composer (or hydrating → loaded) unmounts one `ChatInput` and mounts another. Because `<Toaster />` is mounted *after* it (`App.tsx:1003`), React's clean-up order is: new composer `update()` runs → old composer's clean-up runs → **`removeProperty` deletes the just-written value**.

The window stays at `0px` (no overlay) until the textarea grows, an expansion toggles, or the window is resized.

**Smallest fix (`useComposerToastClearance.ts:27`):** remove the variable only when the element still owns it.
```ts
const owned = `${elId}`  // per-instance token in a ref
// on cleanup:
if (root.style.getPropertyValue(COMPOSER_TOAST_CLEARANCE_VAR) === owned) root.style.removeProperty(...)
```
Storing the *value string* is enough (a new composer writes a fresh value). Also keep `element` inside the effect so a replacement ref is not observed (see #2).

### 2. A `ref` in the dependency array never re-runs the effect (LOW)
`ChatInput-impl.tsx:4203` passes `composerFormRef`, which is a stable ref object, so if the early returns at `:964/:973/:1030` replaced the form, the observer would still be attached to the detached node. **Fix:** key the effect off `enabled` only (the DOM normally pins the ref to the form and `<Toaster />` → Toaster read).

### 3. The draft composer clears toasts from the middle of the window (LOW)
When no session is active, the composer is at the top of the scrolling draft page (`:930` `pt-[8vh]`, `ChatContainer.tsx:936`). Then the clearance ≈ `h` and `min(50vh, …)` pushes bottom toasts to mid-window. **Fix:** skip when `showDraftHome`: `!showDraftHome && !isMobile && …`. This is a large, steady displacement, so it looks intended — please confirm.

### 4. `ResizeObserver` does not catch pure position moves (LOW, residual)
If the composer stops being pinned to the bottom (split panes opening, `useUIStore.splitPaneEnabled`, the terminal, the inspector rail), its own size may not change. In the bottom-pinned layout `getBoundingClientRect().top` tracks the size, so this is mitigated. The only gap is a container that is not pinned to the bottom.

**Fix:** also observe the parent element or `ChatContainer`'s wrapper:
`observer.observe(element.parentElement ?? element)`.

### Checked and OK
- Several composers mounted at once: only the main-window composer is ever enabled (`isMiniChatSurface` at `:3960` excludes mini-chat; the mini-chat window has its own document, and module-level `toast` calls from `ElectronSupervisionApp`/`MiniChat` have no composer). A sidebar-opened diff/terminal does not mount `ChatInput`.
- Sonner 2.0.8 has one `[data-sonner-toaster]` element; `offset` covers all `top-*`/`bottom-*` positions (`--offset`/`--mobile-offset` CSS vars). The mobile path is off (`!isMobile`) in both the hook and the `max(24px, …)` floor.
- Expanded composer: disabled via `!isDesktopExpanded`.
- SSR/jsdom: `useLayoutEffect` with a `typeof window` guard, and `ResizeObserver` is optional; there is no new crash. The variable just resolves to `0px`.
- `min(50vh, …)` means a very tall draft pushes toasts to mid-window rather than behind the composer; intended.

No files modified.