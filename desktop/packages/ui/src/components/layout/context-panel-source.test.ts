import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

const sourcePath = path.resolve(__dirname, "ContextPanel-impl.tsx")

describe("ContextPanel browser source guards", () => {
  test("desktop browser navigation updates React state before webview load events", async () => {
    const source = await readFile(sourcePath, "utf8")

    expect(source).toContain("setCurrentUrl(visibleUrl)")
    expect(source).toContain("setUrlInput(visibleUrl)")
    expect(source).toContain("setIsLoading(Boolean(visibleUrl))")
    expect(source).toContain('src={currentUrl || "about:blank"}')
  })

  test("desktop browser new-window navigation reuses normalized loading path", async () => {
    const source = await readFile(sourcePath, "utf8")

    expect(source).toContain("handleDesktopBrowserNewWindowEvent(event, loadUrl)")
    expect(source).not.toContain("w.loadURL(detail.url)")
  })

  test("desktop browser loading safety timeout is refreshed per navigation", async () => {
    const source = await readFile(sourcePath, "utf8")

    expect(source).toContain("if (!isLoading || !currentUrl) return")
    expect(source).toContain("}, [currentUrl, isLoading])")
  })

  test("desktop browser reports page failures without obscuring healthy pages", async () => {
    const source = await readFile(sourcePath, "utf8")

    expect(source).toContain('webview.addEventListener("did-fail-load", onFailLoad)')
    expect(source).toContain('t("contextPanel.browser.loadFailed")')
    expect(source).toContain('className="pointer-events-none absolute right-3 top-3')
  })

  test("clears the loading overlay when the preview proxy target fails", async () => {
    const source = await readFile(sourcePath, "utf8")

    // The error card is rendered instead of an iframe, so no load event ever clears the flag:
    // the overlay stayed up over the card and swallowed its recovery click.
    const errorBranches =
      source.match(/setProxyState\(\{ status: "error"[^\n]*\)\n\s*setIsLoading\(false\)/g) ?? []

    expect(errorBranches).toHaveLength(3)
  })

  test("hands focus to a per-directory tab opened behind a focused global browser", async () => {
    const source = await readFile(sourcePath, "utf8")

    // `openContextPanelTab` (store) leaves `browserPanel.focused` set, so a tab opened from a
    // badge or the sidebar was active-but-invisible and the next press closed it. The panel
    // re-asserts the newly opened tab through the action that clears that focus.
    const detect = source.indexOf("contextPanelTabOpenedSince(previous, current)")
    const assert = source.indexOf("setActiveContextPanelTab(directoryKey, perDirActiveTab.id)")

    expect(detect).toBeGreaterThan(-1)
    expect(assert).toBeGreaterThan(detect)
    expect(source).toContain("if (!browserPanel?.focused || !perDirOpen || !perDirActiveTab) return")
  })
})
