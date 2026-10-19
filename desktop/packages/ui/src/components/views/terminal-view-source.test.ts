import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

const sourcePath = path.resolve(__dirname, "TerminalView.tsx")
const viteConfigPath = path.resolve(__dirname, "../../../../web/vite.config.ts")

describe("TerminalView source guards", () => {
  test("creates a terminal session with fallback dimensions instead of rendering a blank dock", async () => {
    const source = await readFile(sourcePath, "utf8")

    expect(source).toContain("DEFAULT_TERMINAL_CREATE_SIZE")
    expect(source).toContain("resolveTerminalCreateSize(lastViewportSizeRef.current)")
    expect(source).toContain("isConnecting && bufferChunks.length === 0")
  })

  test("does not reconnect the stream on every viewport fit/resize", async () => {
    const source = await readFile(sourcePath, "utf8")

    // Resize must only update size + call the PTY resize API — never force a
    // session effect re-run (that used to disconnect/reconnect on every fit).
    expect(source).not.toContain("viewportSizeVersion")
    expect(source).not.toContain("setViewportSizeVersion")
    expect(source).toContain("ensureClaimedTerminalSession")
    expect(source).not.toContain("cleanupStaleCreatedTerminalSession")
    expect(source).toContain('splitPaneRightTab === "terminal"')
    expect(source).toContain("terminalStreamConsumerKey(directory, tabId)")
    expect(source).toContain("expectedSessionId: terminalId")
  })

  test("recovers from missing server sessions instead of locking the tab as exited", async () => {
    const source = await readFile(sourcePath, "utf8")
    expect(source).toContain("isMissingSession")
    expect(source).toMatch(
      /setTabSessionId\(directory, tabId, null, \{\s*lifecycle: "idle",\s*expectedSessionId: terminalId/,
    )
    expect(source).toMatch(/session not found/i)
  })

  test("keeps the fatal-error banner visible for the tab that produced it", async () => {
    const source = await readFile(sourcePath, "utf8")

    // The banner's owning tab is recorded where the fatal error is written; the attach
    // effect's exited-branch must clear the banner only when a *different* tab owns it,
    // or the banner is erased the moment it appears (the cleared lifecycle that the
    // banner itself caused).
    expect(source).toContain("fatalErrorOwnerRef")
    expect(source).toMatch(/fatalErrorOwnerRef\.current = tabId\n\s*setConnectionError\(t\("terminalView\.error\.connectionFailed"/)
    expect(source).toMatch(/fatalErrorOwnerRef\.current = tabId\n\s*setConnectionError\(error instanceof Error/)
    expect(source).toContain("if (fatalErrorOwnerRef.current !== tabId) {")
  })

  test("ships the Ghostty runtime asset instead of leaving the terminal renderer blank", async () => {
    const [terminalViewportSource, viteConfigSource] = await Promise.all([
      readFile(path.resolve(__dirname, "../terminal/TerminalViewport.tsx"), "utf8"),
      readFile(viteConfigPath, "utf8"),
    ])

    expect(viteConfigSource).toContain('requireFromUi.resolve("ghostty-web/ghostty-vt.wasm")')
    expect(viteConfigSource).toContain('fileName: "ghostty-vt.wasm"')
    expect(viteConfigSource).toContain('server.middlewares.use("/ghostty-vt.wasm"')
    expect(terminalViewportSource).toContain("onInitializeError")
  })

  test("publishes the terminal refs only after the terminal opened successfully", async () => {
    const source = await readFile(path.resolve(__dirname, "../terminal/TerminalViewport.tsx"), "utf8")

    // open() can throw (a wasm or renderer failure). Ref publishing it beforehand left a ref
    // pointing at a terminal whose every method throws, so the chunks effect reset it and
    // tripped the error boundary while writes latched the write state and dropped output.
    const openedAt = source.indexOf("terminal.open(container)")
    expect(openedAt).toBeGreaterThan(-1)
    expect(source.indexOf("terminalRef.current = terminal")).toBeGreaterThan(openedAt)
    expect(source.indexOf("fitAddonRef.current = fitAddon")).toBeGreaterThan(openedAt)
  })

  test("clears the write latch when a viewport write throws", async () => {
    const source = await readFile(path.resolve(__dirname, "../terminal/TerminalViewport.tsx"), "utf8")

    expect(source).toMatch(/try \{\n\s+term\.write\(chunk, \(\) => \{/)
    expect(source).toMatch(/\} catch \(error\) \{\n\s+\/\/ A write that throws[\s\S]*?isWritingRef\.current = false/)
  })
})

describe("TerminalViewport touch scroll source guards", () => {
  const viewportSourcePath = path.resolve(__dirname, "../terminal/TerminalViewport.tsx")

  const readTouchScrollSetup = async () => {
    const source = await readFile(viewportSourcePath, "utf8")
    const start = source.indexOf("const setupTouchScroll = React.useCallback")
    const end = source.indexOf(
      "}, [enableTouchScroll, useHiddenInputOverlay, focusHiddenInput, fontSize])",
      start,
    )
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    return { source, setup: source.slice(start, end) }
  }

  const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0

  test("owns touch gestures with touch-action none and contain overscroll in both branches", async () => {
    const { setup } = await readTouchScrollSetup()

    // touch-action: manipulation lets the browser claim the pan, so it cancels the
    // pointer stream after a few moves and the custom scroll stalls.
    expect(count(setup, /container\.style\.touchAction = "none"/g)).toBe(2)
    expect(setup).not.toContain('container.style.touchAction = "manipulation"')
    expect(count(setup, /const previousOverscrollBehaviorY = container\.style\.overscrollBehaviorY/g)).toBe(2)
    expect(count(setup, /container\.style\.overscrollBehaviorY = "contain"/g)).toBe(2)

    // Both cleanup functions restore the exact previous values.
    expect(count(setup, /container\.style\.touchAction = previousTouchAction/g)).toBe(2)
    expect(count(setup, /container\.style\.overscrollBehaviorY = previousOverscrollBehaviorY/g)).toBe(2)
  })

  test("cancelled gestures neither tap-focus the hidden input nor fling", async () => {
    const { setup } = await readTouchScrollSetup()

    expect(setup).not.toMatch(/addEventListener\("pointercancel", handlePointerUp/)
    expect(setup).not.toMatch(/addEventListener\("touchcancel", handleTouchEnd/)
    expect(setup).toContain('addEventListener("pointercancel", handlePointerCancel')
    expect(setup).toContain('addEventListener("touchcancel", handleTouchCancel')

    const pointerCancelStart = setup.indexOf("const handlePointerCancel")
    const pointerCancelEnd = setup.indexOf('container.addEventListener("pointerdown"', pointerCancelStart)
    const pointerCancel = setup.slice(pointerCancelStart, pointerCancelEnd)
    expect(pointerCancel.length).toBeGreaterThan(0)
    expect(pointerCancel).toContain("stopKinetic()")
    expect(pointerCancel).not.toContain("focusHiddenInput")
    expect(pointerCancel).not.toContain("requestAnimationFrame")
    expect(pointerCancel).toMatch(/try \{\n\s+container\.releasePointerCapture\(event\.pointerId\)/)
    expect(pointerCancel).toContain("stateWithPointerId.pointerId = null")
    expect(pointerCancel).toContain("stateWithPointerId.velocity = 0")

    const touchCancelStart = setup.indexOf("const handleTouchCancel")
    const touchCancelEnd = setup.indexOf('container.addEventListener("touchstart"', touchCancelStart)
    const touchCancel = setup.slice(touchCancelStart, touchCancelEnd)
    expect(touchCancel.length).toBeGreaterThan(0)
    expect(touchCancel).toContain("stopKinetic()")
    expect(touchCancel).not.toContain("focusHiddenInput")
    expect(touchCancel).not.toContain("requestAnimationFrame")
    expect(touchCancel).toContain("state.velocity = 0")
    expect(touchCancel).toContain("state.didMove = false")
  })

  test("suppresses ghostty's native canvas scrollbar in touch mode and restores it on teardown", async () => {
    const { source } = await readTouchScrollSetup()

    const openAt = source.indexOf("terminal.open(container)")
    const patchAt = source.indexOf("renderer.renderScrollbar = () => {}")
    expect(openAt).toBeGreaterThan(-1)
    expect(patchAt).toBeGreaterThan(openAt)
    expect(source.slice(openAt, patchAt)).toContain("if (enableTouchScroll) {")
    expect(source).toContain('typeof renderer.renderScrollbar === "function"')
    expect(source).toContain("restoreRenderScrollbar = () => {")

    const cleanupAt = source.indexOf("restorePatchedScrollToBottom?.()")
    expect(cleanupAt).toBeGreaterThan(-1)
    expect(source.indexOf("restoreRenderScrollbar?.()", cleanupAt)).toBeGreaterThan(cleanupAt)
    expect(source.indexOf("restoreRenderScrollbar = null", cleanupAt)).toBeGreaterThan(cleanupAt)
  })
})
