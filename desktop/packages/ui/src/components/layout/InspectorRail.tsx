import React from "react"

import { Icon } from "@/components/icon/Icon"
import type { IconName } from "@/components/icon/icons"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useSupervisionRow } from "@/hooks/useSupervisionRows"
import { useI18n } from "@/lib/i18n"
import { formatShortcutForDisplay, getEffectiveShortcutCombo } from "@/lib/shortcuts"
import { closeBesideChat, openBesideChat, type BesideChatView } from "@/lib/supervision/openBesideChat"
import { cn } from "@/lib/utils"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useUIStore } from "@/stores/useUIStore"
import { useSessionUIStore } from "@/sync/session-ui-store"

type RailEntry = {
  view: BesideChatView
  icon: IconName
  labelKey:
    | "supervision.inspector.changes"
    | "splitPane.tab.files"
    | "splitPane.tab.git"
    | "splitPane.tab.plan"
    | "splitPane.tab.context"
    | "wiki.graph.title"
    | "splitPane.tab.terminal"
    | "splitPane.tab.board"
  shortcutId?: string
}

const ENTRIES: RailEntry[] = [
  { view: "diff", icon: "git-commit", labelKey: "supervision.inspector.changes" },
  { view: "files", icon: "folder-3", labelKey: "splitPane.tab.files" },
  { view: "git", icon: "git-branch", labelKey: "splitPane.tab.git" },
  { view: "board", icon: "git-pull-request", labelKey: "splitPane.tab.board" },
  { view: "plan", icon: "list-check-2", labelKey: "splitPane.tab.plan" },
  { view: "context", icon: "layout-column", labelKey: "splitPane.tab.context" },
  { view: "wiki", icon: "node-tree", labelKey: "wiki.graph.title" },
]

const TERMINAL_ENTRY: RailEntry = {
  view: "terminal",
  icon: "terminal-box",
  labelKey: "splitPane.tab.terminal",
  shortcutId: "toggle_terminal",
}

/** Labeled or compact inspector navigation beside the chat. */
export const InspectorRail: React.FC = () => {
  const { t } = useI18n()
  const toggleRef = React.useRef<HTMLButtonElement>(null)
  const expanded = useSupervisionStore((s) => s.inspectorLabels)
  const setExpanded = useSupervisionStore((s) => s.setInspectorLabels)
  const isMobile = useUIStore((state) => state.isMobile)
  const splitPaneEnabled = useUIStore((state) => state.splitPaneEnabled)
  const splitPaneRightTab = useUIStore((state) => state.splitPaneRightTab)
  const isBottomTerminalOpen = useUIStore((state) => state.isBottomTerminalOpen)
  const shortcutOverrides = useUIStore((state) => state.shortcutOverrides)
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId)
  const changedFiles = useSupervisionRow(currentSessionId)?.evidence?.files ?? 0

  if (isMobile) return null

  const isActive = (view: BesideChatView): boolean =>
    view === "terminal" ? isBottomTerminalOpen : splitPaneEnabled && splitPaneRightTab === view

  const handleClick = (view: BesideChatView) => {
    if (isActive(view)) {
      closeBesideChat(view)
      return
    }
    openBesideChat(view)
  }

  const renderEntry = (entry: RailEntry) => {
    const active = isActive(entry.view)
    const label = t(entry.labelKey)
    const shortcut = entry.shortcutId
      ? formatShortcutForDisplay(getEffectiveShortcutCombo(entry.shortcutId, shortcutOverrides))
      : null
    const badge = entry.view === "diff" && changedFiles > 0 ? changedFiles : null
    return (
      <Tooltip key={entry.view}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => handleClick(entry.view)}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "relative inline-flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 transition-colors",
              expanded ? "justify-start" : "justify-center",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
              active
                ? "bg-[var(--interactive-hover)] text-foreground"
                : "text-muted-foreground hover:bg-[var(--interactive-hover)]/50 hover:text-foreground",
            )}
          >
            <span className="relative inline-flex h-4 w-4 shrink-0">
              <Icon name={entry.icon} className="h-4 w-4" aria-hidden="true" />
              {badge !== null ? (
                <span className="absolute -right-2 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 typography-micro font-medium leading-none text-primary-foreground">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </span>
            {expanded ? (
              <span className="min-w-0 text-left typography-meta [overflow-wrap:anywhere]">{label}</span>
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <span>{label}</span>
          {shortcut ? <span className="ml-2 text-muted-foreground">{shortcut}</span> : null}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <nav
      aria-label={t("supervision.inspector.tools")}
      data-expanded={expanded}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault()
          event.stopPropagation()
          setExpanded(false)
          toggleRef.current?.focus()
        }
      }}
      className="inspector-rail flex flex-shrink-0 flex-col items-center gap-1 overflow-y-auto border-l border-border/40 bg-background p-1"
      data-inspector-rail="true"
    >
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`${t("supervision.inspector.tools")}: ${t(expanded ? "supervision.inspector.hideLabels" : "supervision.inspector.showLabels")}`}
        title={t(expanded ? "supervision.inspector.hideLabels" : "supervision.inspector.showLabels")}
        className={cn(
          "flex min-h-10 w-full items-center justify-center rounded-md px-1 py-1 typography-micro text-muted-foreground hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          expanded ? "gap-2" : "flex-col gap-0.5",
        )}
      >
        <Icon name={expanded ? "arrow-right-s" : "arrow-left-s"} className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 max-w-full [overflow-wrap:anywhere]">{t("supervision.inspector.tools")}</span>
      </button>
      {ENTRIES.map(renderEntry)}
      <div className="my-1 h-px w-5 bg-border/60" aria-hidden="true" />
      {renderEntry(TERMINAL_ENTRY)}
    </nav>
  )
}
