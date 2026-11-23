import { Icon } from "@/components/icon/Icon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useI18n } from "@/lib/i18n"
import { closeBesideChat, openBesideChat, type BesideChatView } from "@/lib/supervision/openBesideChat"
import { cn } from "@/lib/utils"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useUIStore } from "@/stores/useUIStore"
import { useEffectiveDirectory } from "@/hooks/useEffectiveDirectory"
import { canOpenSessionWindow, openSessionWindow } from "@/lib/supervision/openSessionWindow"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { resolveProjectForDirectory } from "@/lib/projectResolution"
import { formatPathForDisplay } from "@/lib/utils"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useGitBranchLabel } from "@/stores/useGitStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import type { I18nKey } from "@/lib/i18n"

/** The views mobile opens over the chat from one labelled menu (C UX-07); Chat closes them. */
const MOBILE_TOOLS: ReadonlyArray<{ view: BesideChatView | "chat"; labelKey: I18nKey }> = [
  { view: "diff", labelKey: "supervision.navigation.review" },
  { view: "git", labelKey: "splitPane.tab.git" },
  { view: "files", labelKey: "splitPane.tab.files" },
  { view: "terminal", labelKey: "splitPane.tab.terminal" },
  { view: "chat", labelKey: "layout.mainTab.chat" },
]

export function WorkspaceNavigation() {
  const { t } = useI18n()
  const board = useSupervisionStore((s) => s.missionControlOpen || s.compareRunGroupKey !== null)
  const isMobile = useUIStore((s) => s.isMobile)
  const mobileView = useUIStore((s) => s.activeMainTab)
  // The pressed state follows what is on screen. Mobile has no pane beside the chat: Review covers it as the main
  // tab, so reading the desktop split pane left Workspace pressed while Review was showing.
  const review = useUIStore((s) =>
    s.isMobile ? s.activeMainTab === "diff" : s.splitPaneEnabled && s.splitPaneRightTab === "diff",
  )
  const mobileTool = isMobile ? MOBILE_TOOLS.find((tool) => tool.view !== "chat" && tool.view === mobileView) : undefined
  const directory = useEffectiveDirectory()
  const homeDirectory = useDirectoryStore((s) => s.homeDirectory)
  const branch = useGitBranchLabel(directory ?? null)
  const currentSessionId = useSessionUIStore((s) => s.currentSessionId)
  const projectLabel = useProjectsStore(
    (s) => resolveProjectForDirectory(s.projects, directory ?? null)?.label?.trim() || null,
  )
  const leaveBoard = () => useSupervisionStore.setState({ missionControlOpen: false, compareRunGroupKey: null })
  const items = [
    {
      label: t("supervision.navigation.workspace"),
      icon: "chat-3" as const,
      active: !board && !review && !mobileTool,
      disabled: false,
      run: () => {
        useUIStore.getState().setActiveMainTab("chat")
        if (review && !isMobile) closeBesideChat("diff")
        leaveBoard()
      },
    },
    {
      label: t("supervision.navigation.portfolio"),
      icon: "equalizer-2" as const,
      active: board,
      disabled: false,
      run: () => useSupervisionStore.setState({ missionControlOpen: true, compareRunGroupKey: null }),
    },
    {
      label: t("supervision.missionControl.action.reviewChanges"),
      icon: "file-check" as const,
      active: !board && review,
      disabled: !directory,
      run: () => {
        if (openBesideChat("diff")) leaveBoard()
      },
    },
  ]
  // Mobile: Review, Git, Files and Terminal are one menu named after the view it shows, in place of a bare Review
  // button and an unnamed pane toggle in the header.
  const visibleItems = isMobile ? items.slice(0, 2) : items
  const openTool = (view: BesideChatView | "chat") => {
    if (view === "chat") {
      useUIStore.getState().setActiveMainTab("chat")
      return
    }
    if (openBesideChat(view)) leaveBoard()
  }
  return (
    <nav
      aria-label={t("header.navigation.mainAria")}
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 p-1"
      data-workspace-navigation
    >
      {visibleItems.map((item) => (
        <button
          data-navigation-level={item.icon === "file-check" ? "context" : "primary"}
          key={item.label}
          type="button"
          aria-pressed={item.active}
          disabled={item.disabled}
          onClick={item.run}
          className={cn(
            "inline-flex min-h-9 min-w-0 items-center gap-2 rounded-md px-3 py-1 typography-ui-label data-[navigation-level=context]:ml-2 data-[navigation-level=context]:border-l data-[navigation-level=context]:border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            item.active
              ? "bg-interactive-selection text-primary"
              : "text-muted-foreground hover:bg-interactive-hover hover:text-foreground",
          )}
        >
          <Icon name={item.icon} className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{item.label}</span>
        </button>
      ))}
      {isMobile ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-workspace-tools-menu
              disabled={!directory}
              aria-label={t("supervision.navigation.toolsMenuAria", {
                view: t(mobileTool?.labelKey ?? "supervision.navigation.review"),
              })}
              className={cn(
                "ml-2 inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-md border-l border-border/50 px-3 py-1 typography-ui-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                mobileTool && !board
                  ? "bg-interactive-selection text-primary"
                  : "text-muted-foreground hover:bg-interactive-hover hover:text-foreground",
              )}
            >
              <span>{t(mobileTool?.labelKey ?? "supervision.navigation.review")}</span>
              <Icon name="arrow-down-s" className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            {MOBILE_TOOLS.map((tool) => {
              const current = tool.view === "chat" ? !mobileTool : tool.view === mobileTool?.view
              return (
                <DropdownMenuItem
                  key={tool.view}
                  data-workspace-tool={tool.view}
                  aria-current={current ? "page" : undefined}
                  onSelect={() => openTool(tool.view)}
                  className="flex items-center justify-between"
                >
                  <span className={cn(current && "font-semibold")}>{t(tool.labelKey)}</span>
                  {current ? <Icon name="check" className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {currentSessionId && canOpenSessionWindow() ? (
        <button
          type="button"
          aria-label={t("supervision.navigation.openInWindow")}
          title={t("supervision.navigation.openInWindow")}
          onClick={() => void openSessionWindow({ sessionId: currentSessionId, directory: directory ?? null }, t("supervision.navigation.openInWindowFailed"))}
          className="inline-flex min-h-9 items-center rounded-md px-2 text-muted-foreground hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-open-session-window
        >
          <Icon name="window" className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
      {!board && !review && directory ? (
        <span
          data-workspace-directory={directory}
          className="ml-auto flex min-w-0 max-w-full items-center gap-1.5 px-3 typography-meta text-muted-foreground"
          title={directory}
        >
          {projectLabel ? <span className="min-w-0 max-w-[40%] truncate font-medium text-foreground">{projectLabel}</span> : null}
          {projectLabel ? <Icon name="arrow-right-s" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
          <span className="min-w-0 truncate" style={{ direction: "rtl", textAlign: "left", unicodeBidi: "plaintext" }}>
            {formatPathForDisplay(directory, homeDirectory)}
          </span>
          {branch ? (
            <span className="inline-flex min-w-0 shrink items-center gap-0.5">
              <Icon name="git-branch" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{branch}</span>
            </span>
          ) : null}
        </span>
      ) : null}
    </nav>
  )
}
