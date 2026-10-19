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

  test("a menu action for a renderer that is not listening is queued, not dropped", async () => {
    const mainSource = await readFile(path.join(import.meta.dirname, "main.js"), "utf8")
    const sender = mainSource.match(/const sendMenuActionToWindow = \(target, action\) => \{(?<body>[\s\S]*?)\n\}/)
      ?.groups?.body

    expect(sender).toBeDefined()
    // The quick-dispatch shortcut creates the window and dispatches in the same turn, and the
    // renderer registers its menu listener only after the app mounts: the panel never opened.
    expect(sender).toContain("if (target === mainWindow && !rendererReadyForOpenProject)")
    expect(sender).toContain('pendingFocusOpens.push({ event: "openchamber:menu-action", detail: action })')

    // With no window at all (macOS keeps the app running) the action reveals the app first.
    const dispatch = mainSource.match(/const dispatchMenuAction = \(action\) => \{(?<body>[\s\S]*?)\n\}/)?.groups
      ?.body
    expect(dispatch).toBeDefined()
    expect(dispatch).toContain("revealMainWindow()")
    expect(dispatch).toContain("sendMenuActionToWindow(next, action)")
  })

  test("check for updates reveals the main window when only a secondary window is menu-capable", async () => {
    const mainSource = await readFile(path.join(import.meta.dirname, "main.js"), "utf8")
    const dispatch = mainSource.match(/const dispatchCheckForUpdates = async \(\) => \{(?<body>[\s\S]*?)\n\}/)?.groups
      ?.body

    expect(dispatch).toBeDefined()
    // The event is delivered through handOffToMainWindow, which targets only the main window.
    // Gating on getMenuTargetWindow() skipped the reveal when a secondary window was focused,
    // and the hand-off then dropped the click because mainWindow was null.
    expect(dispatch).toContain("if (!mainWindow || mainWindow.isDestroyed())")
    expect(dispatch).toContain("await revealMainWindow()")
    expect(dispatch).not.toContain("!getMenuTargetWindow()")
    expect(dispatch).toContain('handOffToMainWindow("openchamber:check-for-updates")')
  })

  test("a notification click reveals a window and queues its session", async () => {
    const mainSource = await readFile(path.join(import.meta.dirname, "main.js"), "utf8")
    const click = mainSource.match(/notification\.on\("click", \(\) => \{(?<body>[\s\S]*?)\n  \}\)/)?.groups?.body

    expect(click).toBeDefined()
    // Without every window closed it does nothing, and with a window still loading the session was
    // dropped: the tray's session click already reveals a window and goes through the ready gate.
    expect(click).toContain("revealMainWindow()")
    expect(click).toContain('handOffToMainWindow("openchamber:open-session"')
  })

  test("an install that never starts leaves the app usable", async () => {
    const mainSource = await readFile(path.join(import.meta.dirname, "main.js"), "utf8")
    const handler = mainSource.match(/handleCommand\(\s*"desktop_quit_and_install",[\s\S]*?\n\)/)?.[0]

    expect(handler).toBeDefined()
    // 7.26.1 moved the refusal and its "install-not-started" result into createUpdateInstaller (pinned in
    // desktop-renderer-guards.test.mjs). The command no longer stops services first, so nothing has to bring
    // the app back after a refusal: the window is still on a live server.
    expect(handler).toContain("createUpdateInstaller(")
    expect(handler).toContain("isQuitting: () => isQuitting")
    expect(handler).not.toContain("app.relaunch()")
    expect(handler).not.toContain("app.exit(0)")
  })
})
