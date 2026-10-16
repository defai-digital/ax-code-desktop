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
