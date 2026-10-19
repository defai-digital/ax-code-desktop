import { afterEach, describe, expect, test } from "vitest"

import { normalizeProjectPath } from "@/lib/projectResolution"
import { useUIStore } from "@/stores/useUIStore"
import {
  CONTEXT_PANEL_TAB_LABEL_MAX_CHARS,
  contextPanelTabOpenedSince,
  getContextPanelFileNameFromPath,
  getContextPanelModeLabel,
  getContextPanelSessionIDFromDedupeKey,
  getContextPanelTabLabel,
  normalizeContextPanelDirectoryKey,
  truncateContextPanelTabLabel,
  type ContextPanelTranslateFn,
} from "./contextPanelTabs"

const t: ContextPanelTranslateFn = (key) => key

describe("normalizeContextPanelDirectoryKey", () => {
  test("returns an empty string for empty input", () => {
    expect(normalizeContextPanelDirectoryKey("")).toBe("")
  })

  test("converts backslashes to forward slashes", () => {
    expect(normalizeContextPanelDirectoryKey("C:\\Users\\alice\\project")).toBe("C:/Users/alice/project")
  })

  test("strips trailing slashes and keeps inner separators like the canonical key", () => {
    expect(normalizeContextPanelDirectoryKey("/repo/project///")).toBe("/repo/project")
    expect(normalizeContextPanelDirectoryKey("/repo//nested///project///")).toBe("/repo//nested///project")
  })

  test("preserves the UNC double-slash prefix", () => {
    expect(normalizeContextPanelDirectoryKey("//server/share/project/")).toBe("//server/share/project")
  })

  test("keeps a lone root slash", () => {
    expect(normalizeContextPanelDirectoryKey("/")).toBe("/")
    expect(normalizeContextPanelDirectoryKey("///")).toBe("")
  })

  test("uppercases Windows drive letters and keeps drive roots", () => {
    expect(normalizeContextPanelDirectoryKey("c:\\dev\\app")).toBe("C:/dev/app")
    expect(normalizeContextPanelDirectoryKey("c:/dev/app/")).toBe("C:/dev/app")
    expect(normalizeContextPanelDirectoryKey("c:/")).toBe("C:/")
    expect(normalizeContextPanelDirectoryKey("c:")).toBe("C:/")
  })

  test("matches the canonical project-path key used by the store", () => {
    const values = [
      "",
      "/",
      "///",
      "/repo//nested///project/",
      "//server/share/project/",
      "c:\\dev\\app",
      "C:/dev/app/",
      "c:/",
      " C:\\dev\\app ",
    ]

    for (const value of values) {
      expect(normalizeContextPanelDirectoryKey(value)).toBe(normalizeProjectPath(value) ?? "")
    }
  })
})

describe("contextPanelTabOpenedSince", () => {
  const directoryKey = "/repo/project"

  test("detects a newer active tab in the same directory", () => {
    expect(
      contextPanelTabOpenedSince(
        { directoryKey, touchedAt: 10 },
        { directoryKey, touchedAt: 20 },
      ),
    ).toBe(true)
  })

  test("treats the first tab in a directory as newly opened", () => {
    expect(
      contextPanelTabOpenedSince(
        { directoryKey, touchedAt: null },
        { directoryKey, touchedAt: 20 },
      ),
    ).toBe(true)
  })

  test("ignores an unchanged snapshot and a closed panel", () => {
    expect(
      contextPanelTabOpenedSince(
        { directoryKey, touchedAt: 20 },
        { directoryKey, touchedAt: 20 },
      ),
    ).toBe(false)
    expect(
      contextPanelTabOpenedSince(
        { directoryKey, touchedAt: 20 },
        { directoryKey, touchedAt: null },
      ),
    ).toBe(false)
  })

  test("ignores another directory and an older active tab", () => {
    expect(
      contextPanelTabOpenedSince(
        { directoryKey, touchedAt: 20 },
        { directoryKey: "/repo/other", touchedAt: 30 },
      ),
    ).toBe(false)
    expect(
      contextPanelTabOpenedSince(
        { directoryKey, touchedAt: 20 },
        { directoryKey, touchedAt: 10 },
      ),
    ).toBe(false)
  })
})

describe("focused global browser hand-off", () => {
  const directory = "/repo/project"

  afterEach(() => {
    useUIStore.setState({
      browserPanel: { isOpen: false, url: "", focused: false },
      contextPanelByDirectory: {},
    })
  })

  test("a tab opened while the browser is focused becomes the active panel view", () => {
    useUIStore.setState({
      browserPanel: { isOpen: true, url: "", focused: true },
      contextPanelByDirectory: {},
    })

    useUIStore.getState().openContextPanelTab(directory, { mode: "context" })

    // openContextPanelTab activates the tab but leaves the browser focused: without the
    // hand-off the tab is active-but-invisible and the next press closes it.
    const panel = useUIStore.getState().contextPanelByDirectory[directory]
    const activeTabTouchedAt = panel?.tabs.find((tab) => tab.id === panel.activeTabId)?.touchedAt ?? null
    expect(activeTabTouchedAt).not.toBeNull()
    expect(useUIStore.getState().browserPanel.focused).toBe(true)
    expect(
      contextPanelTabOpenedSince(
        { directoryKey: directory, touchedAt: null },
        { directoryKey: directory, touchedAt: activeTabTouchedAt },
      ),
    ).toBe(true)

    useUIStore.getState().setActiveContextPanelTab(directory, panel?.activeTabId ?? "")

    expect(useUIStore.getState().browserPanel.focused).toBe(false)
  })
})

describe("getContextPanelFileNameFromPath", () => {
  test("returns null for missing or blank paths", () => {
    expect(getContextPanelFileNameFromPath(null)).toBeNull()
    expect(getContextPanelFileNameFromPath("")).toBeNull()
    expect(getContextPanelFileNameFromPath("   ")).toBeNull()
  })

  test("returns the last segment of POSIX and Windows paths", () => {
    expect(getContextPanelFileNameFromPath("/repo/src/app.ts")).toBe("app.ts")
    expect(getContextPanelFileNameFromPath("C:\\repo\\src\\app.ts")).toBe("app.ts")
  })

  test("ignores trailing slashes when picking the last segment", () => {
    expect(getContextPanelFileNameFromPath("/repo/src/")).toBe("src")
  })

  test("returns the whole value when there are no segments", () => {
    expect(getContextPanelFileNameFromPath("/")).toBe("/")
    expect(getContextPanelFileNameFromPath("file.ts")).toBe("file.ts")
  })
})

describe("getContextPanelModeLabel", () => {
  test("maps each mode to its i18n key", () => {
    expect(getContextPanelModeLabel("chat", t)).toBe("contextPanel.mode.chat")
    expect(getContextPanelModeLabel("file", t)).toBe("contextPanel.mode.files")
    expect(getContextPanelModeLabel("diff", t)).toBe("contextPanel.mode.diff")
    expect(getContextPanelModeLabel("plan", t)).toBe("contextPanel.mode.plan")
    expect(getContextPanelModeLabel("preview", t)).toBe("contextPanel.mode.preview")
    expect(getContextPanelModeLabel("browser", t)).toBe("contextPanel.mode.browser")
    expect(getContextPanelModeLabel("context", t)).toBe("contextPanel.mode.context")
  })

  test("returns a hardcoded label for dashboard mode", () => {
    expect(getContextPanelModeLabel("dashboard", t)).toBe("Dashboard")
  })
})

describe("getContextPanelTabLabel", () => {
  test("prefers an explicit tab label over derived labels", () => {
    expect(getContextPanelTabLabel({ mode: "file", label: "Custom", targetPath: "/a/b.ts" }, t)).toBe("Custom")
  })

  test("derives file tab labels from the target path", () => {
    expect(getContextPanelTabLabel({ mode: "file", label: null, targetPath: "/repo/app.ts" }, t)).toBe("app.ts")
    expect(getContextPanelTabLabel({ mode: "file", label: null, targetPath: null }, t)).toBe("contextPanel.mode.files")
  })

  test("derives preview tab labels from the URL host", () => {
    expect(getContextPanelTabLabel({ mode: "preview", label: null, targetPath: "http://localhost:3000/app" }, t)).toBe(
      "localhost:3000",
    )
  })

  test("falls back to the preview label for missing or invalid URLs", () => {
    expect(getContextPanelTabLabel({ mode: "preview", label: null, targetPath: null }, t)).toBe(
      "contextPanel.mode.preview",
    )
    expect(getContextPanelTabLabel({ mode: "preview", label: null, targetPath: "not a url" }, t)).toBe(
      "contextPanel.mode.preview",
    )
  })

  test("distinguishes staged and working diff tabs", () => {
    expect(getContextPanelTabLabel({ mode: "diff", label: null, targetPath: null, stagedDiff: true }, t)).toBe(
      "contextPanel.mode.stagedDiff",
    )
    expect(getContextPanelTabLabel({ mode: "diff", label: null, targetPath: null }, t)).toBe(
      "contextPanel.mode.workingDiff",
    )
  })

  test("falls back to the mode label for other modes", () => {
    expect(getContextPanelTabLabel({ mode: "plan", label: null, targetPath: null }, t)).toBe("contextPanel.mode.plan")
  })
})

describe("truncateContextPanelTabLabel", () => {
  test("keeps labels at or below the limit unchanged", () => {
    expect(truncateContextPanelTabLabel("short", CONTEXT_PANEL_TAB_LABEL_MAX_CHARS)).toBe("short")
    expect(
      truncateContextPanelTabLabel("x".repeat(CONTEXT_PANEL_TAB_LABEL_MAX_CHARS), CONTEXT_PANEL_TAB_LABEL_MAX_CHARS),
    ).toBe("x".repeat(CONTEXT_PANEL_TAB_LABEL_MAX_CHARS))
  })

  test("truncates longer labels with an ellipsis suffix", () => {
    const value = "a".repeat(CONTEXT_PANEL_TAB_LABEL_MAX_CHARS + 5)
    const truncated = truncateContextPanelTabLabel(value, CONTEXT_PANEL_TAB_LABEL_MAX_CHARS)
    expect(truncated).toBe(`${"a".repeat(CONTEXT_PANEL_TAB_LABEL_MAX_CHARS - 3)}...`)
    expect(truncated).toHaveLength(CONTEXT_PANEL_TAB_LABEL_MAX_CHARS)
  })
})

describe("getContextPanelSessionIDFromDedupeKey", () => {
  test("returns null for missing or non-session keys", () => {
    expect(getContextPanelSessionIDFromDedupeKey(undefined)).toBeNull()
    expect(getContextPanelSessionIDFromDedupeKey("file:/repo/app.ts")).toBeNull()
  })

  test("extracts and trims the session id", () => {
    expect(getContextPanelSessionIDFromDedupeKey("session:abc123")).toBe("abc123")
    expect(getContextPanelSessionIDFromDedupeKey("session:  abc123  ")).toBe("abc123")
  })

  test("returns null when the session id is blank", () => {
    expect(getContextPanelSessionIDFromDedupeKey("session:")).toBeNull()
    expect(getContextPanelSessionIDFromDedupeKey("session:   ")).toBeNull()
  })
})
