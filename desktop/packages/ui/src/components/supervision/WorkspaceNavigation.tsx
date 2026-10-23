import { openSessionGrid } from "@/lib/supervision/openSessionGrid"
import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { closeBesideChat, openBesideChat } from "@/lib/supervision/openBesideChat"
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

export function WorkspaceNavigation() {
  const { t } = useI18n()
  const board = useSupervisionStore((s) => s.missionControlOpen || s.compareRunGroupKey !== null)
  const grid = useUIStore((s) => s.activeMainTab === "session-grid")
  const review = useUIStore((s) => s.splitPaneEnabled && s.splitPaneRightTab === "diff")
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
      active: !board && !review && !grid,
      disabled: false,
      run: () => {
        useUIStore.getState().setActiveMainTab("chat")
        if (review) closeBesideChat("diff")
        leaveBoard()
      },
    },
    {
      label: t("supervision.missionControl.title"),
      icon: "equalizer-2" as const,
      active: board,
      disabled: false,
      run: () => useSupervisionStore.setState({ missionControlOpen: true, compareRunGroupKey: null }),
    },
    {
      label: t("sessionGrid.title"),
      icon: "window" as const,
      active: !board && grid,
      disabled: false,
      run: () => openSessionGrid(),
    },
    {
      label: t("supervision.missionControl.action.reviewChanges"),
      icon: "file-check" as const,
      active: !board && review && !grid,
      disabled: !directory,
      run: () => {
        if (openBesideChat("diff")) leaveBoard()
      },
    },
  ]
  return (
    <nav
      aria-label={t("header.navigation.mainAria")}
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 p-1"
      data-workspace-navigation
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          aria-pressed={item.active}
          disabled={item.disabled}
          onClick={item.run}
          className={cn(
            "inline-flex min-h-9 min-w-0 items-center gap-2 rounded-md px-3 py-1 typography-ui-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            item.active
              ? "bg-interactive-selection text-primary"
              : "text-muted-foreground hover:bg-interactive-hover hover:text-foreground",
          )}
        >
          <Icon name={item.icon} className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{item.label}</span>
        </button>
      ))}
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
      {!board && !review && !grid && directory ? (
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
