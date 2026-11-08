import { waitForCondition } from "./cdp.mjs"

/**
 * DevTools metrics can update layout without notifying application resize listeners.
 * Deliver the viewport notification before checking responsive UI; callers still verify fresh DOM state.
 */
export async function setDesktopViewport(session, { width, height }) {
  // Geometry qualification uses reduced motion so compositor timing cannot hold an intermediate panel width.
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  })
  await session.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false })
  // Wait through application resize debounces before a journey reopens a responsive panel.
  await session.evaluate(`new Promise(resolve => {
    let timer
    const resized = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        window.removeEventListener('resize', resized)
        resolve(true)
      }, 350)
    }
    window.addEventListener('resize', resized)
    window.dispatchEvent(new Event('resize'))
  })`)
}

/** Wait for the rendered left sidebar to finish collapsing, not only its ARIA state change. */
export async function waitForCollapsedDesktopSidebar(session) {
  const read = () =>
    session.evaluate(`(() => {
    const sidebar = document.querySelector('aside')
    return { hidden: sidebar?.getAttribute('aria-hidden'), width: sidebar?.getBoundingClientRect().width, inlineWidth: sidebar?.style.width, transition: sidebar?.style.transitionProperty }
  })()`)
  try {
    await waitForCondition(
      async () => {
        const sidebar = await read()
        return sidebar.hidden === "true" && sidebar.width <= 1
      },
      { timeoutMs: 10_000, label: "responsive sidebar collapse" },
    )
  } catch (error) {
    throw new Error(`Sidebar collapse did not settle: ${JSON.stringify(await read())}`, { cause: error })
  }
}
