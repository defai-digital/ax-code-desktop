import { beforeEach, describe, expect, test, vi } from "vitest"

import { isContextPanelMode, useUIStore } from "./useUIStore"

const legacyCanvasPanel = {
  isOpen: true,
  expanded: false,
  tabs: [
    {
      id: "canvas",
      mode: "canvas",
      targetPath: null,
      dedupeKey: "canvas",
      label: "Canvas",
      readOnly: false,
      stagedDiff: false,
      touchedAt: 1,
    },
  ],
  activeTabId: "canvas",
  width: 380,
  touchedAt: 1,
}

describe("useUIStore context panel", () => {
  beforeEach(() => {
    useUIStore.setState({ contextPanelByDirectory: {} })
  })

  test("context actions never merge literal directory scopes", () => {
    const plain = "/literal-root/repo"
    const spaced = `${plain} `
    useUIStore.getState().openContextFile(plain, `${plain}/plain.txt`)
    useUIStore.getState().openContextFile(spaced, `${spaced}/spaced.txt `)
    const roots = useUIStore.getState().contextPanelByDirectory
    expect(Object.keys(roots)).toEqual([plain, spaced])
    expect(roots[plain].tabs[0].targetPath).toBe(`${plain}/plain.txt`)
    expect(roots[spaced].tabs[0].targetPath).toBe(`${spaced}/spaced.txt `)
    useUIStore.getState().closeContextPanel(spaced)
    expect(useUIStore.getState().contextPanelByDirectory[plain].isOpen).toBe(true)
  })

  test("opens a deduped dashboard tab for a directory", () => {
    const directory = "/workspace/project"

    useUIStore.getState().openContextPanelTab(directory, { mode: "dashboard", dedupeKey: "dashboard", label: "Dashboard" })
    useUIStore.getState().openContextPanelTab(directory, { mode: "dashboard", dedupeKey: "dashboard", label: "Dashboard" })

    const panel = useUIStore.getState().contextPanelByDirectory[directory]
    expect(panel?.isOpen).toBe(true)
    expect(panel?.activeTabId).toBe("dashboard")
    expect(panel?.tabs).toHaveLength(1)
    expect(panel?.tabs[0]).toMatchObject({
      id: "dashboard",
      mode: "dashboard",
      dedupeKey: "dashboard",
      label: "Dashboard",
    })
  })

  test("does not treat legacy canvas tabs as a valid context panel mode", () => {
    expect(isContextPanelMode("canvas")).toBe(false)
    expect(isContextPanelMode("context")).toBe(true)
    expect(isContextPanelMode("dashboard")).toBe(true)
  })

  test("drops legacy canvas tabs before opening another context panel tab", () => {
    const directory = "/workspace/project"
    useUIStore.setState({
      contextPanelByDirectory: {
        [directory]: legacyCanvasPanel as never,
      },
    })

    useUIStore.getState().openContextPanelTab(directory, { mode: "dashboard", dedupeKey: "dashboard", label: "Dashboard" })

    const panel = useUIStore.getState().contextPanelByDirectory[directory]
    expect(panel?.isOpen).toBe(true)
    expect(panel?.activeTabId).toBe("dashboard")
    expect(panel?.tabs.map((tab) => tab.mode)).toEqual(["dashboard"])
  })

  test("migration removes legacy canvas-only panel state", async () => {
    const migrate = useUIStore.persist.getOptions().migrate
    expect(migrate).toBeTypeOf("function")

    const migrated = (await migrate?.(
      {
        contextPanelByDirectory: {
          "/workspace/project": legacyCanvasPanel,
        },
      },
      9,
    )) as { contextPanelByDirectory?: Record<string, unknown> }

    expect(migrated.contextPanelByDirectory).toEqual({})
  })

  test("migration clears browser navigation from a previous Desktop session", async () => {
    const migrate = useUIStore.persist.getOptions().migrate

    const migrated = (await migrate?.(
      {
        browserPanel: { isOpen: true, url: "https://example.com/private", focused: true },
        contextPanelByDirectory: {},
      },
      11,
    )) as { browserPanel?: unknown }

    expect(migrated.browserPanel).toEqual({ isOpen: false, url: "", focused: false })
  })

  test("does not persist browser navigation between Desktop sessions", () => {
    const partialize = useUIStore.persist.getOptions().partialize
    expect(partialize).toBeTypeOf("function")

    useUIStore.setState({ browserPanel: { isOpen: true, url: "https://example.com/private", focused: true } })

    expect(partialize?.(useUIStore.getState())).not.toHaveProperty("browserPanel")
  })

  test("persists manually resized panels and the file-diff layout", () => {
    const partialize = useUIStore.persist.getOptions().partialize
    expect(partialize).toBeTypeOf("function")

    useUIStore.setState({
      sidebarWidth: 344,
      hasManuallyResizedLeftSidebar: true,
      bottomTerminalHeight: 312,
      hasManuallyResizedBottomTerminal: true,
      diffFileLayout: { "src/index.ts": "inline" },
    })

    expect(partialize?.(useUIStore.getState())).toMatchObject({
      sidebarWidth: 344,
      hasManuallyResizedLeftSidebar: true,
      bottomTerminalHeight: 312,
      hasManuallyResizedBottomTerminal: true,
      diffFileLayout: { "src/index.ts": "inline" },
    })
  })

  test("takes the read-only flag from the latest open of an existing tab", () => {
    const directory = "/workspace/project"
    const open = useUIStore.getState().openContextPanelTab

    open(directory, { mode: "chat", dedupeKey: "session:a", label: "A", readOnly: true })
    expect(useUIStore.getState().contextPanelByDirectory[directory]?.tabs[0]?.readOnly).toBe(true)

    open(directory, { mode: "chat", dedupeKey: "session:a", label: "A" })
    const tabs = useUIStore.getState().contextPanelByDirectory[directory]?.tabs
    expect(tabs).toHaveLength(1)
    expect(tabs?.[0]?.readOnly).toBe(false)
  })

  test("keeps distinct literal file paths, navigation and opaque tab actions", () => {
    const directory = "/workspace/project"
    const file = "/workspace/project/ report.txt "
    const store = useUIStore.getState()
    store.openContextFileAtLine(directory, file, 8, 2)
    store.openContextFile(directory, file.trimEnd())
    const id = `file:${file}`
    const otherId = `file:${file.trimEnd()}`
    expect(useUIStore.getState().contextPanelByDirectory[directory]?.tabs).toHaveLength(2)
    store.setActiveContextPanelTab(directory, id)
    expect(useUIStore.getState().contextPanelByDirectory[directory]?.activeTabId).toBe(id)
    store.reorderContextPanelTabs(directory, id, otherId)
    expect(useUIStore.getState().contextPanelByDirectory[directory]?.tabs.map((tab) => tab.id)).toEqual([id, otherId])
    store.closeContextPanelTab(directory, id)
    expect(useUIStore.getState().contextPanelByDirectory[directory]?.tabs.map((tab) => tab.id)).toEqual([otherId])
    store.openContextFileAtLine(directory, file, 8, 2)
    expect(useUIStore.getState().pendingFileNavigation).toEqual({ path: file, line: 8, column: 2 })
  })

  test("keeps the literal diff target", () => {
    const directory = "/workspace/project"
    useUIStore.getState().openContextDiff(directory, "/workspace/project/report.txt ")
    expect(useUIStore.getState().contextPanelByDirectory[directory]?.tabs[0]?.targetPath).toBe(
      "/workspace/project/report.txt ",
    )
  })

  test("can activate, reorder and close restored tab IDs with trailing whitespace", () => {
    const directory = "/workspace/project"
    useUIStore.getState().openContextFile(directory, "/workspace/project/plain.txt")
    const panel = useUIStore.getState().contextPanelByDirectory[directory]!
    const id = "file:/workspace/project/report.txt "
    useUIStore.setState({
      contextPanelByDirectory: {
        [directory]: {
          ...panel,
          tabs: [
            ...panel.tabs,
            {
              ...panel.tabs[0]!,
              id,
              dedupeKey: "/workspace/project/report.txt ",
              targetPath: "/workspace/project/report.txt ",
            },
          ],
        },
      },
    })
    useUIStore.getState().setActiveContextPanelTab(directory, id)
    expect(useUIStore.getState().contextPanelByDirectory[directory]?.activeTabId).toBe(id)
    useUIStore.getState().reorderContextPanelTabs(directory, id, panel.tabs[0]!.id)
    expect(useUIStore.getState().contextPanelByDirectory[directory]?.tabs[0]?.id).toBe(id)
    useUIStore.getState().closeContextPanelTab(directory, id)
    expect(useUIStore.getState().contextPanelByDirectory[directory]?.tabs).toHaveLength(1)
  })

  test("keeps the opened directory when root timestamps tie", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(100)
    try {
      for (let index = 0; index < 21; index += 1) useUIStore.getState().openContextFile(`/repo/${index}`, "file.txt")
      const panels = useUIStore.getState().contextPanelByDirectory
      expect(Object.keys(panels)).toHaveLength(20)
      expect(panels["/repo/20"]?.isOpen).toBe(true)
    } finally {
      clock.mockRestore()
    }
  })

  test("validates current-version panel payloads and ignores stored browser navigation", () => {
    const merge = useUIStore.persist.getOptions().merge!
    const current = { ...useUIStore.getState(), browserPanel: { isOpen: false, url: "", focused: false } }
    const merged = merge(
      {
        browserPanel: { isOpen: true, url: "https://example.com/private", focused: true },
        contextPanelByDirectory: { "/repo": { tabs: "invalid", isOpen: true, width: -1 } },
      },
      current,
    )
    expect(merged.contextPanelByDirectory).toEqual({})
    expect(merged.browserPanel).toEqual(current.browserPanel)
  })

  test("a profile saved with the right sidebar open reopens the inspector on the same view", () => {
    const merge = useUIStore.persist.getOptions().merge!
    const current = { ...useUIStore.getState(), splitPaneEnabled: false, splitPaneRightTab: "files" as const }
    const reopened = merge(
      { isRightSidebarOpen: true, rightSidebarTab: "git", splitPaneEnabled: false, splitPaneRightTab: "diff" },
      current,
    )
    expect(reopened).toMatchObject({ splitPaneEnabled: true, splitPaneRightTab: "git" })
    expect(reopened).not.toHaveProperty("isRightSidebarOpen")

    const closed = merge(
      { isRightSidebarOpen: false, rightSidebarTab: "git", splitPaneEnabled: false, splitPaneRightTab: "diff" },
      current,
    )
    expect(closed).toMatchObject({ splitPaneEnabled: false, splitPaneRightTab: "diff" })

    // An unknown sidebar tab still reopens the pane, on the view the pane itself last held.
    const unknown = merge({ isRightSidebarOpen: true, rightSidebarTab: "nope", splitPaneRightTab: "diff" }, current)
    expect(unknown).toMatchObject({ splitPaneEnabled: true, splitPaneRightTab: "diff" })
  })

  test("does not restore a current-version persisted browser URL", () => {
    const merge = useUIStore.persist.getOptions().merge!
    const current = { ...useUIStore.getState(), browserPanel: { isOpen: false, url: "", focused: false } }
    const merged = merge({ browserPanel: { isOpen: true, url: "https://example.com/private", focused: true } }, current)
    expect(merged.browserPanel).toEqual(current.browserPanel)
  })
})
