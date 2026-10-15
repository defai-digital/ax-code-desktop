import * as React from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Icon } from "@/components/icon/Icon"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useSessionDisplayStore } from "@/stores/useSessionDisplayStore"
import { EMPTY_SCHEDULED_TASK_GROUP, useScheduledTasksStore } from "@/stores/useScheduledTasksStore"
import { useUIStore } from "@/stores/useUIStore"
import { PROJECT_COLOR_MAP, PROJECT_ICON_MAP, getProjectIconImageUrl } from "@/lib/projectMeta"
import { useThemeSystem } from "@/contexts/useThemeSystem"
import { useI18n } from "@/lib/i18n"
import { cn, formatDirectoryName } from "@/lib/utils"
import type { ProjectEntry } from "@/lib/api/types"
import { buildProjectGroups } from "../scheduledTaskGroups"
import { formatFamilySchedule, formatRelativeTime, formatRunMoment } from "../scheduledTaskFormat"
import {
  buildPendingEntries,
  summarizePendingEntries,
  type PendingScheduleEntry,
  type PendingScheduleGroupInput,
} from "../scheduledTaskPending"
import { useScheduledTaskActions } from "./useScheduledTaskActions"
import { useScheduledTasksSync } from "./useScheduledTasksSync"

type Props = {
  /** A session search is active: keep the header, hide the list. */
  searchActive: boolean
}

type ProjectGroup = PendingScheduleGroupInput & { label: string }

const ROW_ICON_CLASS = "h-3.5 w-3.5 shrink-0"

function ProjectGlyph({ project }: { project: ProjectEntry }) {
  const { currentTheme } = useThemeSystem()
  const imageUrl = getProjectIconImageUrl(
    { id: project.id, iconImage: project.iconImage ?? null },
    { themeVariant: currentTheme.metadata.variant, iconColor: currentTheme.colors.surface.foreground },
  )
  const iconName = project.icon ? PROJECT_ICON_MAP[project.icon] : null
  const iconColor = project.color ? PROJECT_COLOR_MAP[project.color] : undefined
  if (imageUrl) {
    return (
      <span
        className="inline-flex h-3 w-3 shrink-0 items-center justify-center overflow-hidden rounded-[3px]"
        style={project.iconBackground ? { backgroundColor: project.iconBackground } : undefined}
      >
        <img src={imageUrl} alt="" className="h-full w-full object-contain" draggable={false} />
      </span>
    )
  }
  return (
    <Icon
      name={iconName ?? "folder"}
      className="h-3 w-3 shrink-0"
      style={iconColor ? { color: iconColor } : undefined}
    />
  )
}

/**
 * Docked "Scheduled" section of the session sidebar: every project's
 * scheduled tasks in one pending-first list (running, failing, then by next
 * run, paused last), with inline run/pause and a menu for edit and delete.
 */
export function SidebarScheduledTasks({ searchActive }: Props): React.ReactNode {
  const { t } = useI18n()
  const isMobile = useUIStore((state) => state.isMobile)
  const projects = useProjectsStore((state) => state.projects)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory)
  const showSection = useSessionDisplayStore((state) => state.showScheduledSection)
  const collapsed = useSessionDisplayStore((state) => state.scheduledSectionCollapsed)
  const setCollapsed = useSessionDisplayStore((state) => state.setScheduledSectionCollapsed)
  const revealRequest = useSessionDisplayStore((state) => state.scheduledRevealRequest)
  const groupStates = useScheduledTasksStore((state) => state.groups)
  const loadGroup = useScheduledTasksStore((state) => state.loadGroup)
  const actions = useScheduledTaskActions()
  const [menuOpenKey, setMenuOpenKey] = React.useState<string | null>(null)
  const headerRef = React.useRef<HTMLButtonElement | null>(null)
  const sectionId = React.useId()
  const listId = `${sectionId}-list`
  const headingId = `${sectionId}-heading`

  const projectGroups = React.useMemo<ProjectGroup[]>(
    () =>
      buildProjectGroups(projects).map(({ directory, project }) => ({
        directory,
        project,
        tasks: [],
        label: project.label?.trim() || formatDirectoryName(project.path, homeDirectory || undefined),
      })),
    [projects, homeDirectory],
  )

  const enabled = showSection && projectGroups.length > 0
  const now = useScheduledTasksSync(projectGroups, enabled)

  const entries = React.useMemo(
    () =>
      buildPendingEntries(
        projectGroups.map((group) => ({ ...group, tasks: groupStates[group.directory]?.tasks ?? [] })),
      ),
    [projectGroups, groupStates],
  )
  const summary = summarizePendingEntries(entries)
  const labelByDirectory = React.useMemo(
    () => new Map(projectGroups.map((group) => [group.directory, group.label])),
    [projectGroups],
  )
  // A project that has never loaded shows a retry row. A failed background
  // refresh keeps the last good list quietly; the next refresh retries.
  const failedGroups = projectGroups.filter((group) => {
    const state = groupStates[group.directory]
    return Boolean(state?.error) && !state?.hasLoaded
  })
  const showProjectLabels = projectGroups.length > 1
  const initialLoading =
    entries.length === 0 &&
    projectGroups.some((group) => {
      const state = groupStates[group.directory] ?? EMPTY_SCHEDULED_TASK_GROUP
      return !state.hasLoaded && !state.error
    })
  const hasBody = initialLoading || entries.length > 0 || failedGroups.length > 0
  const expanded = !collapsed

  // The sidebar's calendar button reveals the section: move focus to it.
  const handledRevealRef = React.useRef(revealRequest)
  React.useEffect(() => {
    if (revealRequest === handledRevealRef.current) {
      return
    }
    handledRevealRef.current = revealRequest
    const header = headerRef.current
    if (header) {
      header.scrollIntoView({ block: "nearest" })
      header.focus()
    }
  }, [revealRequest, enabled])

  if (!enabled) {
    // Keep the editor and confirm dialogs mounted: hiding the section from
    // the display menu must not drop an edit or a pending confirmation.
    return actions.dialogs
  }

  const orderedProjects = [...projectGroups].sort((a, b) => {
    if (a.project.id === activeProjectId) return -1
    if (b.project.id === activeProjectId) return 1
    return 0
  })

  const newTaskButtonClass =
    "inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"

  const newTaskControl =
    orderedProjects.length === 1 ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={newTaskButtonClass}
            aria-label={t("sessions.sidebar.scheduled.newTask")}
            onClick={() => actions.openNewTask(orderedProjects[0].directory, orderedProjects[0].label)}
          >
            <Icon name="add" className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          <p>{t("sessions.sidebar.scheduled.newTask")}</p>
        </TooltipContent>
      </Tooltip>
    ) : (
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button type="button" className={newTaskButtonClass} aria-label={t("sessions.sidebar.scheduled.newTask")}>
                <Icon name="add" className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            <p>{t("sessions.sidebar.scheduled.newTask")}</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-[200px] max-w-[280px]">
          <DropdownMenuLabel className="typography-micro text-muted-foreground">
            {t("sessions.sidebar.scheduled.chooseProject")}
          </DropdownMenuLabel>
          {orderedProjects.map((group) => (
            <DropdownMenuItem
              key={group.directory}
              className="flex items-center gap-2"
              onClick={() => actions.openNewTask(group.directory, group.label)}
            >
              <ProjectGlyph project={group.project} />
              <span className="truncate">{group.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )

  const renderRow = (entry: PendingScheduleEntry) => {
    const { family, directory, project } = entry
    const projectLabel = labelByDirectory.get(directory) ?? directory
    const busy = actions.busyKeys.has(entry.key)
    const running = family.lastRunStatus === "running"
    const failing = family.lastRunStatus === "error"
    const paused = !family.anyActive
    const statusText = running
      ? t("sessions.sidebar.scheduled.status.running")
      : paused
        ? t("sessions.sidebar.scheduled.status.paused")
        : failing
          ? t("sessions.sidebar.scheduled.status.failed")
          : t("sessions.sidebar.scheduled.status.scheduled")
    const whenLabel = running
      ? t("sessions.sidebar.scheduled.status.running")
      : paused
        ? t("sessions.sidebar.scheduled.status.paused")
        : family.nextRunAt
          ? formatRelativeTime(family.nextRunAt, t, now)
          : "—"
    const whenTitle = !running && !paused && family.nextRunAt ? formatRunMoment(family.nextRunAt, now) : undefined
    const schedule = formatFamilySchedule(family, t)
    const showActions = isMobile || menuOpenKey === entry.key

    return (
      <li
        key={entry.key}
        className={cn(
          "group/row relative flex items-start gap-1.5 rounded-md px-1.5 py-1 transition-colors",
          "hover:bg-interactive-hover/50 focus-within:bg-interactive-hover/50",
          busy && "opacity-60",
        )}
        data-scheduled-task-row={entry.key}
      >
        <span className="mt-[3px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center" aria-hidden="true">
          {running ? (
            <Icon name="loader-4" className={cn(ROW_ICON_CLASS, "animate-spin text-status-warning")} />
          ) : paused ? (
            <Icon name="pause" className={cn(ROW_ICON_CLASS, "text-muted-foreground")} />
          ) : failing ? (
            <Icon name="error-warning" className={cn(ROW_ICON_CLASS, "text-status-error")} />
          ) : (
            <Icon name="time" className={cn(ROW_ICON_CLASS, "text-muted-foreground")} />
          )}
        </span>

        <button
          type="button"
          className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          onClick={() => actions.openEditTask(family, directory, projectLabel)}
          disabled={busy}
          aria-label={t("sessions.scheduledTasks.dialog.actions.editAria", { taskName: family.title })}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("truncate typography-ui-label", paused ? "text-muted-foreground" : "text-foreground")}>
              {family.title}
            </span>
            {family.members.length > 1 ? (
              <span
                className="shrink-0 rounded px-1 typography-micro tabular-nums text-muted-foreground ring-1 ring-border"
                title={t("sessions.scheduledTasks.dialog.family.memberCount", { count: family.members.length })}
              >
                {t("sessions.sidebar.scheduled.scheduleCountShort", { count: family.members.length })}
              </span>
            ) : null}
            <span className="sr-only">{statusText}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1 typography-micro leading-tight text-muted-foreground">
            {showProjectLabels ? (
              <>
                <ProjectGlyph project={project} />
                <span className="max-w-[45%] shrink-0 truncate">{projectLabel}</span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            {failing && !running ? (
              <span className="truncate text-status-error">{t("sessions.sidebar.scheduled.status.failed")}</span>
            ) : (
              <span className="truncate">{schedule}</span>
            )}
          </span>
        </button>

        <span className="flex h-5 shrink-0 items-center gap-0.5">
          <span
            className={cn(
              "typography-micro tabular-nums whitespace-nowrap",
              running ? "text-status-warning" : "text-muted-foreground",
              !isMobile && "group-hover/row:hidden group-focus-within/row:hidden",
              showActions && !isMobile && "hidden",
            )}
            title={whenTitle}
          >
            {whenLabel}
          </span>
          <span
            className={cn(
              "items-center gap-0.5",
              showActions ? "flex" : "hidden group-hover/row:flex group-focus-within/row:flex",
            )}
          >
            {!isMobile ? (
              <>
                <RowIconButton
                  icon="play"
                  label={t("sessions.scheduledTasks.dialog.actions.runNowAria", { taskName: family.title })}
                  disabled={busy || running}
                  onClick={() => void actions.runNow(family, directory)}
                />
                <RowIconButton
                  icon={paused ? "play-circle" : "pause"}
                  label={
                    paused
                      ? t("sessions.scheduledTasks.dialog.taskToggle.enableAria", { taskName: family.title })
                      : t("sessions.scheduledTasks.dialog.taskToggle.pauseAria", { taskName: family.title })
                  }
                  disabled={busy}
                  onClick={() => void actions.toggleEnabled(family, directory, paused)}
                />
              </>
            ) : null}
            <DropdownMenu
              open={menuOpenKey === entry.key}
              onOpenChange={(open) => setMenuOpenKey(open ? entry.key : null)}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label={t("sessions.sidebar.scheduled.actions.moreAria", { taskName: family.title })}
                  disabled={busy}
                >
                  <Icon name="more-2" className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px] max-w-[300px]">
                <DropdownMenuLabel className="space-y-0.5 font-normal">
                  <span className="block truncate typography-ui-label text-foreground">{family.title}</span>
                  <span className="block typography-micro text-muted-foreground">{schedule}</span>
                  {family.nextRunAt && !paused ? (
                    <span className="block typography-micro text-muted-foreground">
                      {t("sessions.sidebar.scheduled.nextRunAt", { time: formatRunMoment(family.nextRunAt, now) })}
                    </span>
                  ) : null}
                  {family.lastError ? (
                    <span className="block whitespace-pre-wrap break-words typography-micro text-status-error">
                      {t("sessions.sidebar.scheduled.lastError", { error: family.lastError })}
                    </span>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="flex items-center gap-2"
                  disabled={running}
                  onClick={() => void actions.runNow(family, directory)}
                >
                  <Icon name="play" className="h-4 w-4" />
                  <span>{t("sessions.scheduledTasks.dialog.actions.runNow")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2"
                  onClick={() => void actions.toggleEnabled(family, directory, paused)}
                >
                  <Icon name={paused ? "play-circle" : "pause"} className="h-4 w-4" />
                  <span>
                    {paused
                      ? t("sessions.sidebar.scheduled.actions.resume")
                      : t("sessions.sidebar.scheduled.actions.pause")}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2"
                  onClick={() => actions.openEditTask(family, directory, projectLabel)}
                >
                  <Icon name="edit-2" className="h-4 w-4" />
                  <span>{t("sessions.scheduledTasks.dialog.actions.edit")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="flex items-center gap-2 text-destructive focus:text-destructive"
                  onClick={() => void actions.deleteTask(family, directory)}
                >
                  <Icon name="delete-bin" className="h-4 w-4" />
                  <span>{t("sessions.sidebar.scheduled.actions.delete")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </span>
      </li>
    )
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex-none select-none border-b border-border/40 px-2.5 pb-1.5"
      data-sidebar-scheduled
    >
      <div className="flex h-7 items-center gap-1">
        <button
          ref={headerRef}
          type="button"
          onClick={() => setCollapsed(expanded)}
          aria-expanded={expanded}
          aria-controls={hasBody && expanded && !searchActive ? listId : undefined}
          className="group flex min-w-0 flex-1 items-center gap-1 rounded-md px-0.5 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground">
            <Icon name={expanded ? "arrow-down-s" : "arrow-right-s"} className="h-3.5 w-3.5" />
          </span>
          <span id={headingId} className="typography-ui-label text-foreground/95">
            {t("sessions.sidebar.scheduled.title")}
          </span>
          {summary.total > 0 ? (
            <span className="typography-micro tabular-nums text-muted-foreground">{summary.total}</span>
          ) : null}
          {summary.running > 0 ? (
            <span className="inline-flex items-center gap-0.5 typography-micro text-status-warning">
              <Icon name="loader-4" className="h-3 w-3 animate-spin" aria-hidden="true" />
              {t("sessions.sidebar.scheduled.runningCount", { count: summary.running })}
            </span>
          ) : null}
          {summary.failing > 0 ? (
            <span className="inline-flex items-center gap-0.5 typography-micro text-status-error">
              <Icon name="error-warning" className="h-3 w-3" aria-hidden="true" />
              {t("sessions.sidebar.scheduled.failingCount", { count: summary.failing })}
            </span>
          ) : null}
          {(!expanded || searchActive) && summary.nextRunAt ? (
            <span className="ml-auto truncate pl-1 typography-micro text-muted-foreground">
              {t("sessions.sidebar.scheduled.nextRun", { when: formatRelativeTime(summary.nextRunAt, t, now) })}
            </span>
          ) : null}
        </button>
        {newTaskControl}
      </div>

      {expanded && !searchActive && hasBody ? (
        <div id={listId} className="max-h-[min(36vh,320px)] overflow-y-auto overscroll-contain">
          {initialLoading ? (
            <div className="space-y-1.5 px-1.5 py-1" aria-busy="true">
              <span className="sr-only">{t("sessions.scheduledTasks.dialog.loading")}</span>
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ) : null}
          {failedGroups.map((group) => (
            <div
              key={`error:${group.directory}`}
              className="flex items-center gap-1.5 px-1.5 py-1 typography-micro text-status-error"
              role="alert"
            >
              <Icon name="error-warning" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate" title={groupStates[group.directory]?.error ?? undefined}>
                {t("sessions.sidebar.scheduled.loadFailed", { project: group.label })}
              </span>
              <button
                type="button"
                className="shrink-0 rounded px-1 text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                onClick={() => void loadGroup(group.directory)}
                aria-label={t("sessions.scheduledTasks.dialog.group.retryAria", { project: group.label })}
              >
                {t("sessions.scheduledTasks.dialog.actions.retry")}
              </button>
            </div>
          ))}
          {entries.length > 0 ? <ul className="space-y-0.5">{entries.map(renderRow)}</ul> : null}
        </div>
      ) : null}

      {actions.dialogs}
    </section>
  )
}

function RowIconButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: "play" | "pause" | "play-circle"
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-40"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon name={icon} className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  )
}
