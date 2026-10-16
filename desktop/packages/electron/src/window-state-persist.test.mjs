import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

const readWriteWindowState = async () => {
  const mainSource = await readFile(path.join(import.meta.dirname, "main.js"), "utf8")
  return mainSource.match(/const writeWindowState = async \(browserWindow\) => \{(?<body>[\s\S]*?)\n\}/)?.groups?.body
}

describe("main-window geometry persistence", () => {
  test("captures the geometry before the settings chain can defer the write past the close", async () => {
    const body = await readWriteWindowState()

    expect(body).toBeDefined()
    // The final persist is triggered by the window's own close, and on macOS the window
    // is destroyed before a chained mutator runs. Reading the geometry inside the mutator
    // discarded it - the destroyed-window guard returned the root unchanged - so the app
    // reopened with the geometry it had before the move or resize.
    expect(body.indexOf("getBounds()")).toBeLessThan(body.indexOf("mutateSettingsRoot("))
    expect(body).toContain("const maximized = browserWindow.isMaximized()")
    expect(body).toContain("const fullscreen = browserWindow.isFullScreen()")
    expect(body).not.toMatch(/isDestroyed\(\)\) return root/)
  })
})
