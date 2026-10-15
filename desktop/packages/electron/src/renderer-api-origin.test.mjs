import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

const readMainSource = () => readFile(path.join(import.meta.dirname, "main.js"), "utf8")

describe("renderer API origin", () => {
  test("refreshes the renderer API origin before reloading windows after a crash-restart", async () => {
    const mainSource = await readMainSource()
    const recovery = mainSource.match(
      /async function reloadRenderersAfterServerRecovery\((?<body>[\s\S]*?)\n\}/,
    )?.groups?.body

    expect(recovery).toBeDefined()
    const originWrite = recovery.indexOf("applyRendererApiOrigin(newPort)")
    const reload = recovery.indexOf("reloadLocalRendererWindowsAfterServerRestart")
    expect(originWrite).toBeGreaterThan(-1)
    expect(reload).toBeGreaterThan(-1)
    // The replacement server binds a new port, and the reloaded preload reads
    // this env value — writing it after the reload would be too late.
    expect(originWrite).toBeLessThan(reload)
  })

  test("writes the renderer API origin env through one helper", async () => {
    const mainSource = await readMainSource()
    const directWrites = mainSource.match(/process\.env\.AX_CODE_DESKTOP_RENDERER_API_ORIGIN\s*=/g) ?? []

    expect(mainSource).toContain("function applyRendererApiOrigin(")
    expect(directWrites).toHaveLength(1)
  })
})
