import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { closeBesideChat, openBesideChat } from "@/lib/supervision/openBesideChat"
import { cn } from "@/lib/utils"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useUIStore } from "@/stores/useUIStore"
import { useSessionUIStore } from "@/sync/session-ui-store"

export function WorkspaceNavigation() {
  const { t } = useI18n()
  const board = useSupervisionStore((s) => s.missionControlOpen || s.compareRunGroupKey !== null)
  const review = useUIStore((s) => s.splitPaneEnabled && s.splitPaneRightTab === "diff")
  const sessionId = useSessionUIStore((s) => s.currentSessionId)
  const leaveBoard = () => useSupervisionStore.setState({ missionControlOpen: false, compareRunGroupKey: null })
  const items = [
    {
      label: t("supervision.missionControl.title"),
      icon: "equalizer-2" as const,
      active: board,
      disabled: false,
      run: () => useSupervisionStore.setState({ missionControlOpen: true, compareRunGroupKey: null }),
    },
    {
      label: t("supervision.navigation.workspace"),
      icon: "chat-3" as const,
      active: !board && !review,
      disabled: false,
      run: () => {
        if (review) closeBesideChat("diff")
        leaveBoard()
      },
    },
    {
      label: t("supervision.missionControl.action.reviewChanges"),
      icon: "file-check" as const,
      active: !board && review,
      disabled: !sessionId,
      run: () => {
        if (openBesideChat("diff")) leaveBoard()
      },
    },
  ]
  return (
    <nav
      aria-label={t("header.navigation.mainAria")}
      className="flex shrink-0 flex-wrap gap-1 border-b border-border/50 p-1"
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
    </nav>
  )
}
