import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// The panel reads the session, directory and config stores plus a fetch, so its contract is
// asserted against the source, as the neighbouring view contracts are.
describe("DashboardPanel ready gate", () => {
  test("does not offer Open before the dashboard URL exists", async () => {
    const source = await readFile(path.resolve(__dirname, "DashboardPanel.tsx"), "utf8")

    // The URL is empty until the runtime version arrives, and the iframe is hidden in that state —
    // the button stayed enabled and `window.open("")` opened a blank tab.
    expect(source).toContain("disabled={!dashboardUrl}")
    expect(source).toContain('if (!dashboardUrl) return')
  })

  test("bounds the version request so the URL cannot stay undefined", async () => {
    const source = await readFile(path.resolve(__dirname, "DashboardPanel.tsx"), "utf8")

    // A runtime that accepted the connection and stopped answering left `runtimeVersion`
    // undefined for good: no deadline on that fetch, and every consumer waits on it.
    expect(source).toContain("signal: AbortSignal.timeout(")
  })
})
