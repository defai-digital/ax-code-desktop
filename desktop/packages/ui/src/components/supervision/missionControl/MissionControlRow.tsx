import React from "react"

import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import type { SupervisionRow as SupervisionRowData } from "@/hooks/useSupervisionRows"
import { useI18n } from "@/lib/i18n"
import { parseMultiRunSessionTitle } from "@/lib/multirun/title"
import { ACTIVITY_TODO_PREFIX, type ActivityPreview } from "@/lib/supervision/activityPreview"
import { multiRunGroupKeyForRow } from "@/lib/supervision/multiRunGroups"
import { formatRelativeAge } from "@/lib/supervision/relativeAge"
import { SupervisionGoalLine } from "../SupervisionGoalLine"
import { SupervisionStateBadge } from "../SupervisionStateBadge"
import { cn, formatPathForDisplay } from "@/lib/utils"
import { needsHuman } from "@/lib/supervision/sessionState"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useGitBranchLabel } from "@/stores/useGitStore"
import { useFormatEvidence } from "../EvidenceText"
import { updatedSinceViewed } from "@/lib/supervision/missionControl"
import { inlineChildSessions } from "@/lib/supervision/childSessions"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { ChecksChip, GoalBudgetLeft } from "./MissionControlChecks"

export interface MissionControlRowProps {
  row: SupervisionRowData
  grouped?: boolean
  selected: boolean
  bulkSelected: boolean
  onToggleSelection: (sessionId: string) => void
  expanded: boolean
  activeWorkingSetId: string | null
  primaryLabel: string
  onToggleDetails: (sessionId: string) => void
  onSelect: (sessionId: string) => void
  onOpen: (row: SupervisionRowData) => void
  /** Cmd/Ctrl+click shows the session beside the current chat; omitted where there is no chat. */
  onOpenBeside?: (row: SupervisionRowData) => void
  onPrimary: (row: SupervisionRowData) => void
  /** Opens one child agent of this row; child rows are listed but not openable when omitted. */
  onOpenChild?: (row: SupervisionRowData, childSessionId: string) => void
  /** Opens multi-run compare; omitted where compare cannot open (the pop-out window). */
  onCompare?: (groupKey: string) => void
  onRemoveFromSet: (workingSetId: string, sessionId: string) => void
  children?: React.ReactNode
}

export const MissionControlRow: React.FC<MissionControlRowProps> = ({
  row,
  grouped = false,
  selected,
  bulkSelected,
  onToggleSelection,
  expanded,
  activeWorkingSetId,
  primaryLabel,
  onToggleDetails,
  onSelect,
  onOpen,
  onOpenBeside,
  onPrimary,
  onOpenChild,
  onCompare,
  onRemoveFromSet,
  children,
}) => {
  const { t } = useI18n()
  const homeDirectory = useDirectoryStore((s) => s.homeDirectory)
  const branch = useGitBranchLabel(row.directory)
  const formatEvidence = useFormatEvidence()
  const evidenceLabel = formatEvidence(row.evidence)
  // What the agent is doing is the point of scanning the board, so it shows in every density and next to a goal or
  // error line (which stay first) rather than being the first thing dropped.
  const activity = row.activity ?? null
  const updated = useSupervisionStore((state) => updatedSinceViewed(row, state.lastViewedAt))
  const showsGoalOrError = Boolean(row.goal) || (row.state === "error" && Boolean(row.errorMessage))
  const activityText = activity ? activityLine(activity, t) : null
  const actionContext = [row.projectLabel ?? row.directory, row.title].filter(Boolean).join(" · ")
  const groupSlug = multiRunGroupKeyForRow(row, parseMultiRunSessionTitle)
  const inlineChildren = inlineChildSessions(row.childSessions)
  // The project browser serves one session at a time; its row names the page it shows and whether the agent may use it.
  const browserOrigin = useWebMcpBrowserStore((state) =>
    state.phase === "ready" && state.sessionID === row.sessionId ? state.origin : null,
  )
  const browserEnabled = useWebMcpBrowserStore((state) => state.enabled)

  const handleSelectClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && onOpenBeside) {
      onOpenBeside(row)
      return
    }
    onSelect(row.sessionId)
    // The board (role="grid") owns keyboard navigation via aria-activedescendant;
    // move DOM focus there so j/k and arrow keys continue from this row.
    event.currentTarget.closest<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true })
  }

  const handleDoubleClick = () => {
    onOpen(row)
  }

  const handleActionDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation()
  }

  const handleCompareClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (groupSlug && onCompare) {
      onCompare(groupSlug)
    }
  }

  const handlePrimaryClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    onPrimary(row)
  }

  const handleRemoveClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (activeWorkingSetId) {
      onRemoveFromSet(activeWorkingSetId, row.sessionId)
    }
  }

  return (
    // Presentational wrapper: the grid owns rows directly, and the details disclosure is its own row.
    <div role="presentation" className="border-b border-border/50">
      <div
        id={`mission-row-${row.sessionId}`}
        role="row"
        aria-selected={bulkSelected}
        aria-expanded={expanded}
        onClick={handleSelectClick}
        onDoubleClick={handleDoubleClick}
        className={cn(
          "mission-control-row cursor-pointer border-l-2",
          row.state === "error"
            ? "border-l-[var(--status-error)]"
            : needsHuman(row.state)
              ? "border-l-[var(--status-warning)]"
              : "border-l-transparent",
          selected && "bg-interactive-hover/50",
        )}
      >
        <span role="gridcell" className="mission-selection">
          <input
            type="checkbox"
            className="mission-selection-checkbox"
            aria-label={t("supervision.missionControl.bulk.selectSession", { context: actionContext })}
            checked={bulkSelected}
            onChange={() => onToggleSelection(row.sessionId)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={handleActionDoubleClick}
          />
        </span>
        <span role="gridcell" className="mission-state">
          <SupervisionStateBadge state={row.state} />
        </span>
        <span role="gridcell" className="mission-title min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            {updated ? (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-info)]"
                role="img"
                aria-label={t("supervision.missionControl.updatedMarker")}
                title={t("supervision.missionControl.updatedMarker")}
                data-updated-marker
              />
            ) : null}
            <span className="block truncate typography-ui-label text-foreground" title={row.title}>
              {row.title}
            </span>
          </span>
          {activity && activityText ? (
            <span
              className="mission-activity typography-meta text-muted-foreground"
              title={activity.stale ? `${t("supervision.missionControl.preview.stale")} ${activityText}` : activityText}
              data-activity-preview={activity.kind}
              data-activity-stale={activity.stale ? "" : undefined}
            >
              {/* First, so ellipsis truncation of a long preview never hides that it may be outdated. */}
              {activity.stale ? <span className="mr-1 italic">{t("supervision.missionControl.preview.stale")}</span> : null}
              {activityText}
            </span>
          ) : null}
        </span>
        {showsGoalOrError ? (
          <span
            role="gridcell"
            className="mission-description min-w-0 typography-meta text-muted-foreground [overflow-wrap:anywhere]"
          >
            {row.state === "error" && row.errorMessage ? <span className="block">{row.errorMessage}</span> : null}
            <SupervisionGoalLine goal={row.goal} className="typography-meta text-muted-foreground" />
          </span>
        ) : null}
        <span
          role="gridcell"
          className="mission-meta flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 typography-meta text-muted-foreground"
        >
          {!grouped && (row.projectLabel || row.directory) ? (
            <span className="mission-project min-w-0 truncate" title={row.directory ?? undefined}>
              {row.projectLabel}
              {row.projectLabel && row.directory ? " · " : ""}
              {formatPathForDisplay(row.directory, homeDirectory)}
            </span>
          ) : null}
          {row.treeSessionIds.length > 1 ? (
            <span className="mission-child-count rounded border border-border/60 px-1.5 py-0.5 typography-micro">
              {t(
                row.treeSessionIds.length - 1 === 1
                  ? "supervision.missionControl.child.countSingle"
                  : "supervision.missionControl.child.countPlural",
                { count: row.treeSessionIds.length - 1 },
              )}
            </span>
          ) : null}
          {browserOrigin ? (
            <span
              className={cn(
                "mission-browser inline-flex min-w-0 items-center gap-1 rounded border px-1.5 py-0.5 typography-micro",
                browserEnabled ? "border-[var(--status-info)]/50 text-[var(--status-info)]" : "border-border/60",
              )}
              data-browser-origin={browserOrigin}
              data-browser-enabled={browserEnabled ? "true" : "false"}
              title={browserOrigin}
            >
              <span className="sr-only">
                {t("supervision.missionControl.browser.chipAria", {
                  origin: browserOrigin,
                  state: t(browserEnabled ? "supervision.missionControl.browser.on" : "supervision.missionControl.browser.off"),
                })}
              </span>
              <Icon name="ax-browser" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span aria-hidden="true" className="truncate">
                {t("supervision.missionControl.browser.chip", { origin: browserOrigin })}
              </span>
            </span>
          ) : null}
          {branch ? (
            <span className="mission-branch inline-flex min-w-0 items-center gap-1" title={branch}>
              <Icon name="git-branch" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{branch}</span>
            </span>
          ) : null}
          {row.checks ? <ChecksChip checks={row.checks} /> : null}
          <GoalBudgetLeft goal={row.goal} />
          {evidenceLabel && row.evidence ? (
            <span className="mission-evidence min-w-0">
              <span className="text-[var(--status-success)]">+{row.evidence.additions}</span>{" "}
              <span className="text-[var(--status-error)]">−{row.evidence.deletions}</span>
              {" · "}
              {t(
                row.evidence.files === 1
                  ? "supervision.missionControl.filesSingle"
                  : "supervision.missionControl.filesPlural",
                { count: row.evidence.files },
              )}
            </span>
          ) : null}
          {row.updatedAt ? (
            <span className="mission-age">{formatRelativeAge(Date.now() - row.updatedAt, t)}</span>
          ) : null}
        </span>
        <span role="gridcell" className="mission-actions flex min-w-0 flex-wrap items-center gap-2">
          {groupSlug && onCompare ? (
            <button
              type="button"
              aria-label={`${t("supervision.missionControl.action.compare")} — ${actionContext}`}
              onClick={handleCompareClick}
              onDoubleClick={handleActionDoubleClick}
              className="normal-case min-w-0 max-w-full break-words typography-micro text-[var(--status-info)] hover:underline"
            >
              {t("supervision.missionControl.action.compare")}
            </button>
          ) : null}
          <Button
            size="sm"
            className="normal-case min-w-0 max-w-full min-h-8 h-auto whitespace-normal px-3 py-1 typography-meta"
            onClick={handlePrimaryClick}
            onDoubleClick={handleActionDoubleClick}
            aria-label={`${primaryLabel} — ${actionContext}`}
          >
            {primaryLabel}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="normal-case h-8 w-8 shrink-0 p-0"
            aria-label={`${t("supervision.missionControl.action.details")} — ${actionContext}`}
            title={t("supervision.missionControl.action.details")}
            aria-expanded={expanded}
            aria-controls={expanded ? `mission-details-${row.sessionId}` : undefined}
            onClick={(event) => {
              event.stopPropagation()
              onToggleDetails(row.sessionId)
            }}
            onDoubleClick={handleActionDoubleClick}
          >
            <Icon name={expanded ? "arrow-up-s" : "arrow-down-s"} className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          {activeWorkingSetId ? (
            <button
              type="button"
              aria-label={`${t("supervision.missionControl.action.removeFromSet")} — ${actionContext}`}
              title={t("supervision.missionControl.action.removeFromSet")}
              onClick={handleRemoveClick}
              onDoubleClick={handleActionDoubleClick}
              className="normal-case shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
            >
              <Icon name="close" className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      </div>
      {inlineChildren.shown.map((child) => (
        <div
          key={child.sessionId}
          role="row"
          className="mission-child-row flex min-w-0 items-center gap-2 py-1 pl-10 pr-3"
          data-child-session={child.sessionId}
        >
          <span role="gridcell" className="shrink-0">
            <SupervisionStateBadge state={child.state} />
          </span>
          <span role="gridcell" className="min-w-0 flex-1 truncate typography-meta text-foreground" title={child.title}>
            {child.title}
          </span>
          <span role="gridcell" className="shrink-0 typography-micro text-muted-foreground">
            {child.updatedAt ? formatRelativeAge(Date.now() - child.updatedAt, t) : null}
          </span>
          {onOpenChild ? (
            <span role="gridcell" className="shrink-0">
              <button
                type="button"
                className="normal-case rounded px-1.5 py-0.5 typography-micro text-[var(--status-info)] hover:underline"
                aria-label={t("supervision.missionControl.child.openAria", { title: child.title, parent: row.title })}
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenChild(row, child.sessionId)
                }}
                onDoubleClick={handleActionDoubleClick}
              >
                {t("supervision.missionControl.child.open")}
              </button>
            </span>
          ) : null}
        </div>
      ))}
      {inlineChildren.hidden > 0 ? (
        <div role="row" className="mission-child-more py-1 pl-10 pr-3">
          <span role="gridcell">
            <button
              type="button"
              className="normal-case typography-micro text-muted-foreground hover:text-foreground hover:underline"
              aria-expanded={expanded}
              onClick={(event) => {
                event.stopPropagation()
                onToggleDetails(row.sessionId)
              }}
              onDoubleClick={handleActionDoubleClick}
            >
              {t("supervision.missionControl.child.more", { count: inlineChildren.hidden })}
            </button>
          </span>
        </div>
      ) : null}
      {expanded ? (
        <div id={`mission-details-${row.sessionId}`} role="row">
          <div role="gridcell">{children}</div>
        </div>
      ) : null}
    </div>
  )
}

function activityLine(activity: ActivityPreview, t: ReturnType<typeof useI18n>["t"]): string {
  if (activity.kind !== "todo") return activity.text
  const content = activity.text.startsWith(ACTIVITY_TODO_PREFIX)
    ? activity.text.slice(ACTIVITY_TODO_PREFIX.length)
    : activity.text
  return t("supervision.missionControl.preview.workingOn", { content })
}
