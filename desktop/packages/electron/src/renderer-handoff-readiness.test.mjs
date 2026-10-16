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

  test("queues a hand-off instead of sending it to a renderer that is not listening", async () => {
    const mainSource = await readFile(path.join(import.meta.dirname, "main.js"), "utf8")
    const helper = mainSource.match(/function handOffToMainWindow\((?<body>[\s\S]*?)\n\}/)?.groups?.body

    expect(helper).toBeDefined()
    expect(helper).toContain("rendererReadyForOpenProject")
    expect(helper).toContain("pendingFocusOpens.push({ event, detail })")
  })

  test("the tray's hand-offs go through the readiness gate, not straight at a fresh window", async () => {
    const mainSource = await readFile(path.join(import.meta.dirname, "main.js"), "utf8")
    const dispatch = mainSource.match(/const dispatchTrayAction = async \(action\) => \{(?<body>[\s\S]*?)\n\}/)?.groups
      ?.body

    expect(dispatch).toBeDefined()
    // A window created by revealMainWindow has finished loading but not signalled
    // 'ax-code:renderer-app-ready', so a direct send there opened the session nowhere and
    // left an approval unanswered while the window looked focused.
    expect(dispatch).toContain('handOffToMainWindow("openchamber:open-session"')
    expect(dispatch).toContain('handOffToMainWindow("openchamber:tray-action"')
    expect(dispatch).toContain('handOffToMainWindow("openchamber:open-draft-session"')
    expect(dispatch).not.toContain("sendDesktopEvent(target.webContents")
  })
})
