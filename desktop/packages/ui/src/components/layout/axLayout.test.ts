import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { iconSpriteData } from "@/components/icon/sprite"

const source = (relativePath: string) =>
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", relativePath), "utf8")

describe("AX Code layout", () => {
  test("the sidebar leads with a labeled New session button that shows the effective shortcut", () => {
    const header = source("session/sidebar/SidebarHeader.tsx")
    expect(header).toContain("data-sidebar-new-session")
    expect(header).toContain('getEffectiveShortcutCombo("new_chat", shortcutOverrides)')
    // The icon-only duplicate is gone from the tool row.
    expect(header.match(/onClick=\{openNewSessionDraft\}/g)).toHaveLength(1)
  })

  test("the sidebar footer is a brand row whose mark opens About", () => {
    const footer = source("session/sidebar/SidebarFooter.tsx")
    expect(footer).toContain("data-sidebar-brand")
    expect(footer).toMatch(/onClick=\{onOpenAbout\}[\s\S]*?name="ax-mark"[\s\S]*?PRODUCT_DISPLAY_NAME/)
  })

  test("the header repeats no tool that the Tools rail already offers", () => {
    const header = source("layout/Header.tsx")
    const group = header.slice(
      header.indexOf("data-header-panels"),
      header.indexOf("</div>", header.indexOf("data-header-panels")),
    )
    // What stays up here has no rail entry: the browser panel and the right sidebar.
    expect(group).toContain("<WebMcpHeaderButton")
    expect(group).toContain("pressed={isRightSidebarOpen}")
    // Terminal, split pane and plan each had a second button beside the rail's. Two buttons for one feature made
    // people wonder which to press; the rail keeps them and their shortcuts still work.
    for (const duplicate of ["toggleBottomTerminal", "toggleSplitPane", "isBottomTerminalOpen", "splitPaneEnabled", "showPlanTab"]) {
      expect(header).not.toContain(duplicate)
    }
    const rail = source("layout/InspectorRail.tsx")
    for (const view of ['view: "terminal"', 'view: "plan"', 'view: "context"']) expect(rail).toContain(view)
  })

  test("the header tracks the configured model and the canonical directory key", () => {
    const header = source("layout/Header.tsx")

    // Subscribing to the store's stable getter did not re-render on a model switch, so the
    // context limits and usage percentage stayed on the previous model.
    expect(header).toContain("const currentModel = useConfigStore((state) => state.getCurrentModel())")
    expect(header).not.toContain("state.getCurrentModel)")
    // Header and ContextPanel must read the same keys the store writes.
    expect(header).toContain("normalizeContextPanelDirectoryKey as normalize")
  })

  test("the composer frames its run controls and sends with a filled brand disc", () => {
    const input = source("chat/ChatInput-impl.tsx")
    expect(input).toMatch(
      /data-composer-run-group[\s\S]*?<WorkModeSelector[\s\S]*?<ExecutionModeSelector[\s\S]*?<SandboxToggle/,
    )
    expect(input).toContain("data-composer-send")
    expect(input).toContain('"bg-primary text-primary-foreground')
  })

  test("AX concepts render AX glyphs", () => {
    for (const name of ["ax-agent", "ax-auto", "ax-browser", "ax-mark"] as const) {
      expect(iconSpriteData[name]).toBeTruthy()
    }
    expect(source("chat/WorkModeSelector.tsx")).toContain('agent: "ax-agent"')
    expect(source("chat/ExecutionModeSelector.tsx")).toContain('icon: "ax-auto"')
    expect(source("mcp/WebMcpHeaderButton.tsx")).toContain('name="ax-browser"')
  })

  test("the WebMCP header toggle shows the browser panel's open state, separate from agent access", () => {
    const button = source("mcp/WebMcpHeaderButton.tsx")
    expect(button).toContain("aria-pressed={panelOpen}")
    expect(button).toContain('panelOpen && "bg-interactive-selection text-primary')
    expect(button).toContain("panelOpen ? closeContextBrowser() : openProjectBrowser()")
    // The dot still reports agent access.
    expect(button).toMatch(/<WebMcpStatusDot tone=\{summary\.tone\}/)
  })

  test("the desktop draft home is top-anchored: composer, needs-you, starters, then projects", () => {
    const container = source("chat/ChatContainer.tsx")
    expect(container).toContain('"flex-1 overflow-y-auto bg-background px-0 pb-10 pt-[8vh]"')
    expect(container).not.toContain("pb-[6vh]")
    expect(container).toMatch(
      /data-draft-home[\s\S]*?<ChatInput[\s\S]*?<NeedsYouQueue[\s\S]*?<DraftPresetChips\s+layout="grid"[\s\S]*?<ProjectsHome/,
    )
    // One scroll container: the project list no longer scrolls on its own.
    expect(container).not.toContain("max-h-[32vh] overflow-y-auto")

    const input = source("chat/ChatInput-impl.tsx")
    expect(input).toMatch(/data-draft-header[\s\S]*?t\("sessions\.sidebar\.header\.actions\.newSession"\)/)
    expect(input).not.toContain("<DraftPresetChips")
  })

  test("the needs-you queue is its own bounded, ranked section", () => {
    const queue = source("projects/NeedsYouQueue.tsx")
    expect(queue).toContain("rankNeedsYouEntries(listNeedsYouSessions(inputs))")
    expect(queue).toContain("queue.slice(0, NEEDS_YOU_VISIBLE_ROWS)")
    expect(queue).toContain("useEnsureDirectoriesGitStatus(directories)")
    const home = source("projects/ProjectsHome.tsx")
    expect(home.indexOf("<NeedsYouQueue")).toBeLessThan(home.indexOf('t("projects.home.title")'))
  })
})
