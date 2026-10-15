import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

describe("main-window hand-off readiness", () => {
  test("clears renderer readiness on every load start so menu/role reloads cannot leave it stale", async () => {
    const mainSource = await readFile(path.join(import.meta.dirname, "main.js"), "utf8")
    const didStartLoadingHandler = mainSource.match(
      /webContents\.on\("did-start-loading",\s*\(\)\s*=>\s*\{(?<body>[\s\S]*?)^\s*\}\)/m,
    )?.groups?.body

    expect(didStartLoadingHandler).toBeDefined()
    expect(didStartLoadingHandler).toContain("rendererReadyForOpenProject = false")
  })

  test("a failed main-window create reports the hand-off as not focused instead of rejecting", async () => {
    const mainSource = await readFile(path.join(import.meta.dirname, "main.js"), "utf8")
    const handler = mainSource.match(/handleCommand\("desktop_focus_main_window"(?<body>[\s\S]*?)\n\}\)/)?.groups?.body

    expect(handler).toBeDefined()
    expect(handler).toMatch(/try \{[\s\S]*?await createWindow\(\)[\s\S]*?\} catch/)
    expect(handler).toContain("{ focused: false }")
  })
})
