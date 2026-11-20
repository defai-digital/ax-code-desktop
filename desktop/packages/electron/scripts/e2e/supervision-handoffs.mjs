import { waitForCondition } from "./cdp.mjs"

// WebMCP clicks and screenshots do not establish native keyboard focus. A select may
// still own focus after committing its value; focus the search input before Escape.
export async function focusPaletteForEscape(session) {
  await session.send("Page.bringToFront")
  await waitForCondition(
    () =>
      session.evaluate(`(() => {
    const input = document.querySelector('[cmdk-input]')
    input?.focus({ preventScroll: true })
    return Boolean(input && document.hasFocus() && document.activeElement === input)
  })()`),
    { timeoutMs: 10_000, label: "palette search owns native keyboard focus" },
  )
}
