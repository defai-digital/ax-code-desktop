import { listTargets, waitForCondition } from "./cdp.mjs"

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

// The return click only requests closure. First observe the exact native target disappear,
// then activate the main window (which reconciles native ownership), then observe both
// the embedded chat and any page presence that existed before pop-out. A DOM click alone leaves the mini-window active.
export async function waitForGridReturn(session, debuggingPort, popped, readTargets = listTargets) {
  const deadline = Date.now() + 45_000
  await waitForCondition(async () => !(await readTargets(debuggingPort)).some((target) => target.id === popped.id), {
    timeoutMs: 45_000,
    label: "the popped mini-chat window closes",
  })
  await session.send("Page.bringToFront")
  await waitForCondition(
    () =>
      session.evaluate(`(() => {
    const sessionId = ${JSON.stringify(popped.sessionId)}
    const frames = Array.from(document.querySelectorAll('[data-session-grid] iframe'))
    const pages = Array.from(document.querySelectorAll('[data-session-grid] [data-webmcp-session-page]'))
    return frames.some(frame => new URL(frame.src).searchParams.get('sessionId') === sessionId) &&
      (!${Boolean(popped.hasPage)} || pages.some(page => page.getAttribute('data-webmcp-session-page') === sessionId))
  })()`),
    { timeoutMs: Math.max(1, deadline - Date.now()), label: "the popped session and page presence return to the grid" },
  )
}
