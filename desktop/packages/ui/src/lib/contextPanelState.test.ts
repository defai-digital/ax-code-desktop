import { describe, expect, it } from "vitest"
import {
  sanitizeContextPanelByDirectory,
  touchContextPanelState,
  upsertContextPanelTab,
  reorderContextPanelTabs,
  closeContextPanelTab,
} from "./contextPanelState"

describe("context panel state boundary", () => {
  it("bounds restored roots and tabs while preserving the active tab", () => {
    const input = Object.fromEntries(
      Array.from({ length: 25 }, (_, root) => [
        `/repo/${root}`,
        {
          isOpen: true,
          width: 9_999,
          touchedAt: root,
          activeTabId: "file:file0",
          tabs: Array.from({ length: 15 }, (_, tab) => ({
            mode: "file",
            targetPath: `file${tab}`,
            touchedAt: tab,
          })),
        },
      ]),
    )
    const result = sanitizeContextPanelByDirectory(input)
    expect(Object.keys(result)).toHaveLength(20)
    expect(result["/repo/0"]).toBeUndefined()
    expect(result["/repo/24"]?.tabs).toHaveLength(12)
    expect(result["/repo/24"]?.activeTabId).toBe("file:file0")
    expect(result["/repo/24"]?.width).toBe(1400)
  })

  it("preserves a closed empty panel's resized width", () => {
    const result = sanitizeContextPanelByDirectory({
      "/repo": {
        tabs: [],
        isOpen: true,
        width: 640,
        expanded: true,
        touchedAt: 1,
      },
    })
    expect(result["/repo"]).toMatchObject({ tabs: [], activeTabId: null, isOpen: false, width: 640, expanded: true })
  })

  it("converts legacy tabs and strips retired per-directory browser state", () => {
    const result = sanitizeContextPanelByDirectory({
      "/file": { mode: "file", targetPath: "/file/report.txt ", label: " Label ", isOpen: true },
      "/browser": { mode: "browser", targetPath: "https://example.com/private", isOpen: true },
      "/canvas": { mode: "canvas", isOpen: true },
    })
    expect(Object.keys(result)).toEqual(["/file"])
    expect(result["/file"]?.tabs[0]).toMatchObject({ targetPath: "/file/report.txt ", label: "Label" })
  })

  it("does not mutate previous snapshots during tab transitions", () => {
    const first = upsertContextPanelTab(touchContextPanelState(), { mode: "file", targetPath: "a.txt" })
    const second = upsertContextPanelTab(first, { mode: "file", targetPath: "b.txt" })
    const before = structuredClone(second)
    const reordered = reorderContextPanelTabs(second, "file:a.txt", "file:b.txt")
    const closed = closeContextPanelTab(reordered, "file:b.txt")
    expect(second).toEqual(before)
    expect(first.tabs.map((tab) => tab.targetPath)).toEqual(["a.txt"])
    expect(closed.tabs.map((tab) => tab.targetPath)).toEqual(["a.txt"])
  })

  it("trims URLs and labels while preserving file identity and opaque dedupe keys", () => {
    const state = upsertContextPanelTab(touchContextPanelState(), {
      mode: "preview",
      targetPath: " https://example.com/ ",
      label: " Preview ",
    })
    expect(state.tabs[0]).toMatchObject({ targetPath: "https://example.com/", label: "Preview" })
    const file = upsertContextPanelTab(state, { mode: "file", targetPath: " file ", dedupeKey: " key " })
    expect(file.tabs[0]).toMatchObject({ id: "file: key ", targetPath: " file ", dedupeKey: " key " })
  })

  it("rejects malformed collections and keeps special keys as ordinary own properties", () => {
    expect(sanitizeContextPanelByDirectory([])).toEqual({})
    expect(sanitizeContextPanelByDirectory({ "/repo": [] })).toEqual({})
    const result = sanitizeContextPanelByDirectory(JSON.parse('{"__proto__":{"tabs":[],"width":500}}'))
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(Object.hasOwn(result, "__proto__")).toBe(true)
  })
})
