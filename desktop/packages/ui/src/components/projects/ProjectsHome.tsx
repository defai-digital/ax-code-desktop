import React from "react"
import type { ProjectEntry } from "@/lib/api/types"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useUIStore } from "@/stores/useUIStore"
import { useI18n } from "@/lib/i18n"
import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import { cn, formatPathForDisplay } from "@/lib/utils"
import { PROJECT_COLOR_MAP, PROJECT_ICON_MAP, getProjectIconImageUrl } from "@/lib/projectMeta"
import { sortProjectsForDisplay } from "@/lib/projectOrdering"
import { formatProjectLastUsed } from "@/lib/projectLastUsed"
import { deriveProjectActivity, type ProjectActivity } from "@/lib/projectStatus"
import { attentionSessionForProject, needsYouReason, type NeedsYouSessionInput } from "@/lib/needsYou"
import { FollowUpList } from "@/components/projects/FollowUpList"
import { NeedsYouQueue } from "@/components/projects/NeedsYouQueue"
import { useEnsureDirectoriesGitStatus, useNeedsYouSessionInputs } from "@/hooks/useNeedsYouSessions"
import { openProjectFolder } from "@/lib/projectOpen"
import { formatShortcutForDisplay, getEffectiveShortcutCombo } from "@/lib/shortcuts"
import { useThemeSystem } from "@/contexts/useThemeSystem"
import { sessionEvents } from "@/lib/sessionEvents"
import { useAllLiveSessions, useAllSessionStatuses, usePendingPermissionSessionIds } from "@/sync/sync-context"
import { resolveGlobalSessionDirectory } from "@/stores/useGlobalSessionsStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { ImportProjectsDialog } from "@/components/projects/ImportProjectsDialog"

type ProjectsHomeProps = {
  /** When true, render a denser list suitable for the sidebar empty state. */
  compact?: boolean
  /**
   * "draft" renders the list under the new-session composer: same rows and actions,
   * no hero, and nothing at all when there are no projects.
   */
  variant?: "home" | "draft"
  className?: string
  onOpenProject?: (projectId: string) => void
  onNewSession?: (projectId: string) => void
}

const IDLE: ProjectActivity = {
  tone: "idle",
  activeSessions: 0,
  busySessions: 0,
  pendingApprovals: 0,
  attentionSessions: 0,
}

/** Live per-project activity, derived from the sessions the runtime reports. */
function useProjectActivity(
  projects: ProjectEntry[],
  needsYouInputs: readonly NeedsYouSessionInput[],
): Map<string, ProjectActivity> {
  const sessions = useAllLiveSessions()
  const statuses = useAllSessionStatuses()
  const pendingPermissionSessionIds = usePendingPermissionSessionIds()
  const worktreeMetadata = useSessionUIStore((state) => state.worktreeMetadata)
  const needsAttentionSessionIds = React.useMemo(
    () =>
      new Set(needsYouInputs.filter((input) => needsYouReason(input) !== null).map((input) => input.id)),
    [needsYouInputs],
  )
  return React.useMemo(
    () =>
      deriveProjectActivity({
        projects,
        sessions: sessions.map((session) => ({
          id: session.id,
          directory: resolveGlobalSessionDirectory(session),
          projectDirectory: worktreeMetadata.get(session.id)?.projectDirectory ?? null,
          archived: Boolean(session.time?.archived),
        })),
        statuses,
        pendingPermissionSessionIds,
        needsAttentionSessionIds,
      }),
    [needsAttentionSessionIds, pendingPermissionSessionIds, projects, sessions, statuses, worktreeMetadata],
  )
}

function useOpenFolderShortcutLabel(): string {
  const shortcutOverrides = useUIStore((state) => state.shortcutOverrides)
  return React.useMemo(
    () => formatShortcutForDisplay(getEffectiveShortcutCombo("open_project_folder", shortcutOverrides)),
    [shortcutOverrides],
  )
}

const ActivityDot: React.FC<{ activity: ProjectActivity }> = ({ activity }) => (
  <span
    aria-hidden
    className={cn(
      "status-dot",
      activity.tone === "attention" && "bg-status-warning",
      activity.tone === "running" && "bg-status-success status-dot-running",
      activity.tone === "idle" && "bg-muted-foreground/35",
    )}
  />
)

/**
 * Project-first home. The primary action is always "open a folder" through the
 * OS picker; cloning, typed paths and imports stay one click away. Rows show
 * what the runtime actually knows about each project, never a decorative status.
 */
export const ProjectsHome: React.FC<ProjectsHomeProps> = ({
  compact = false,
  variant = "home",
  className,
  onOpenProject,
  onNewSession,
}) => {
  const { t } = useI18n()
  const { currentTheme } = useThemeSystem()
  const projects = useProjectsStore((state) => state.projects)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const setActiveProject = useProjectsStore((state) => state.setActiveProject)
  const setProjectPinned = useProjectsStore((state) => state.setProjectPinned)
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory)
  const shortcutLabel = useOpenFolderShortcutLabel()
  const [importOpen, setImportOpen] = React.useState(false)
  const [brokenIconIds, setBrokenIconIds] = React.useState<Set<string>>(new Set())
  const [focusIndex, setFocusIndex] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement | null>(null)

  const ordered = React.useMemo(() => sortProjectsForDisplay(projects), [projects])
  const projectLabels = React.useMemo(() => {
    const labels = ordered.map(project => {
      const pathLabel = formatPathForDisplay(project.path, homeDirectory)
      const title = project.label?.trim() || (pathLabel === "~" ? t("sessions.sidebar.project.home") : pathLabel)
      return { id: project.id, title, pathLabel }
    })
    // Displayed text and native control names collapse whitespace.
    const titleKey = (title: string) => title.replace(/\s+/g, " ").trim()
    const counts = new Map<string, number>()
    for (const label of labels) counts.set(titleKey(label.title), (counts.get(titleKey(label.title)) ?? 0) + 1)
    return new Map(labels.map(label => {
      const ambiguous = (counts.get(titleKey(label.title)) ?? 0) > 1
      return [label.id, { ...label, ambiguous, contextName: ambiguous ? `${label.title} · ${label.pathLabel}` : label.title }]
    }))
  }, [ordered, homeDirectory, t])
  const needsYouInputs = useNeedsYouSessionInputs()
  const activity = useProjectActivity(ordered, needsYouInputs)
  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab)
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession)
  const gitStatusDirectories = React.useMemo(() => {
    if (variant !== "home") return []
    const directories = new Set<string>()
    for (const project of ordered) directories.add(project.path)
    for (const session of needsYouInputs) {
      if (session.directory) directories.add(session.directory)
    }
    return Array.from(directories)
  }, [needsYouInputs, ordered, variant])
  useEnsureDirectoriesGitStatus(gitStatusDirectories)

  const openNeedsYouSession = React.useCallback(
    (sessionId: string) => {
      const session = needsYouInputs.find((item) => item.id === sessionId)
      if (session?.projectId) setActiveProject(session.projectId)
      setActiveMainTab("chat")
      setCurrentSession(sessionId, session?.directory ?? null)
    },
    [needsYouInputs, setActiveMainTab, setActiveProject, setCurrentSession],
  )
  const handleOpenFolder = React.useCallback(() => {
    void openProjectFolder({ t })
  }, [t])
  const handleClone = React.useCallback(() => sessionEvents.requestDirectoryDialog({ mode: "clone" }), [])
  const handleBrowsePath = React.useCallback(() => sessionEvents.requestDirectoryDialog({ mode: "browse" }), [])

  const handleOpen = React.useCallback(
    (project: ProjectEntry) => {
      setActiveProject(project.id)
      onOpenProject?.(project.id)
    },
    [onOpenProject, setActiveProject],
  )

  const handleNewSession = React.useCallback(
    (project: ProjectEntry, event: React.SyntheticEvent) => {
      event.stopPropagation()
      setActiveProject(project.id)
      onNewSession?.(project.id)
    },
    [onNewSession, setActiveProject],
  )

  const handleTogglePin = React.useCallback(
    (project: ProjectEntry, event: React.SyntheticEvent) => {
      event.stopPropagation()
      setProjectPinned(project.id, project.pinned !== true)
    },
    [setProjectPinned],
  )

  // One roving tab stop: Up/Down move between rows, Enter/Space open the focused row.
  const handleListKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-project-row]") ?? [])
    if (rows.length === 0) return
    const index = rows.findIndex((row) => row === document.activeElement || row.contains(document.activeElement))
    const next = event.key === "ArrowDown" ? Math.min(rows.length - 1, index + 1) : Math.max(0, index - 1)
    event.preventDefault()
    setFocusIndex(next)
    rows[next]?.focus()
  }, [])

  const openFolderButton = (size: "sm" | "default") => (
    <Button type="button" size={size} onClick={handleOpenFolder} className={cn("gap-1.5", size === "sm" && "h-7 px-2")}>
      <Icon name="folder-add" className="h-3.5 w-3.5" />
      {t("projects.home.actions.openFolder")}
      {size === "default" && shortcutLabel ? (
        <kbd className="ml-1 rounded border border-primary-foreground/30 px-1 py-px font-sans typography-micro font-normal text-primary-foreground/80">
          {shortcutLabel}
        </kbd>
      ) : null}
    </Button>
  )

  if (ordered.length === 0 && variant === "draft") return null

  if (ordered.length === 0) {
    return (
      <div
        className={cn(
          "flex w-full flex-col items-center text-center",
          compact ? "gap-3 py-4" : "gap-6 py-2",
          className,
        )}
      >
        <div className={cn("flex flex-col items-center", compact ? "gap-1.5" : "gap-2")}>
          <span
            className={cn("font-medium text-foreground", compact ? "typography-ui-label" : "text-xl tracking-tight")}
          >
            {t("projects.home.empty.title")}
          </span>
          <span className="typography-meta max-w-sm text-muted-foreground leading-relaxed">
            {t("projects.home.empty.description")}
          </span>
        </div>
        <div className="flex flex-col items-center gap-2.5">
          {openFolderButton(compact ? "sm" : "default")}
          <div className="flex flex-wrap items-center justify-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleClone}
              className="h-7 gap-1 px-2 text-muted-foreground"
            >
              <Icon name="git-repository" className="h-3.5 w-3.5" />
              {t("projects.home.actions.clone")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleBrowsePath}
              className="h-7 gap-1 px-2 text-muted-foreground"
            >
              <Icon name="folder-6" className="h-3.5 w-3.5" />
              {t("projects.home.actions.browsePath")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setImportOpen(true)}
              className="h-7 gap-1 px-2 text-muted-foreground"
            >
              <Icon name="download-cloud" className="h-3.5 w-3.5" />
              {t("projects.home.actions.import")}
            </Button>
          </div>
        </div>
        <ImportProjectsDialog open={importOpen} onOpenChange={setImportOpen} />
      </div>
    )
  }

  return (
    <div className={cn("flex w-full flex-col", compact ? "gap-2" : "gap-3", className)}>
      {/* Sessions waiting on a person's decision lead the home, as their own section above Projects. */}
      {variant === "home" && !compact ? <NeedsYouQueue className="mb-2" /> : null}
      {/* Failures and finished work hold no decision: listed quietly below, never counted as needing a person. */}
      {variant === "home" && !compact ? <FollowUpList className="mb-2" /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2" data-projects-home-header>
        <div className="min-w-0">
          <h2 className={cn("font-medium text-foreground", compact ? "typography-ui-label" : "typography-ui-header")}>
            {t("projects.home.title")}
          </h2>
          {!compact && variant === "home" ? (
            <p className="typography-meta mt-0.5 text-muted-foreground">{t("projects.home.subtitle")}</p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1" data-projects-home-actions>
          {!compact ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleClone}
                className="h-7 gap-1 px-2 text-muted-foreground"
                aria-label={t("projects.home.actions.clone")}
              >
                <Icon name="git-repository" className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("projects.home.actions.clone")}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleBrowsePath}
                className="h-7 gap-1 px-2 text-muted-foreground"
                title={t("projects.home.actions.browsePath")}
                aria-label={t("projects.home.actions.browsePath")}
              >
                <Icon name="folder-6" className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{t("projects.home.actions.browsePath")}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setImportOpen(true)}
                className="h-7 gap-1 px-2 text-muted-foreground"
                title={t("projects.home.actions.import")}
                aria-label={t("projects.home.actions.import")}
              >
                <Icon name="download-cloud" className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("projects.home.actions.import")}</span>
              </Button>
            </>
          ) : null}
          {openFolderButton("sm")}
        </div>
      </div>

      <div
        ref={listRef}
        aria-label={t("projects.home.title")}
        onKeyDown={handleListKeyDown}
        className={cn("flex w-full flex-col", compact ? "gap-1" : "surface-inset p-1.5 gap-0.5")}
      >
        {ordered.map((project, index) => {
          const isActive = project.id === activeProjectId
          const imageFailureKey = `${project.id}:${project.iconImage?.updatedAt ?? 0}`
          const imageUrl = brokenIconIds.has(imageFailureKey)
            ? null
            : getProjectIconImageUrl(project, {
                themeVariant: currentTheme.metadata.variant,
                iconColor: currentTheme.colors.surface.foreground,
              })
          const iconName = project.icon ? PROJECT_ICON_MAP[project.icon] : null
          const color = project.color ? (PROJECT_COLOR_MAP[project.color] ?? null) : null
          const lastUsed = formatProjectLastUsed(project.lastOpenedAt, t)
          const { title, pathLabel, ambiguous, contextName } = projectLabels.get(project.id)!
          const projectActivity = activity.get(project.id) ?? IDLE
          const attentionTarget =
            projectActivity.tone === "attention" ? attentionSessionForProject(project.id, needsYouInputs) : null
          const statusLabel =
            projectActivity.tone === "attention"
              ? t("projects.home.status.needsYou", { count: projectActivity.attentionSessions })
              : projectActivity.tone === "running"
                ? t("projects.home.status.running", { count: projectActivity.busySessions })
                : projectActivity.activeSessions > 0
                  ? t("projects.home.status.sessions", { count: projectActivity.activeSessions })
                  : t("projects.home.status.idle")

          return (
            <div
              key={project.id}
              role="button"
              aria-label={contextName}
              aria-current={isActive ? "true" : undefined}
              data-project-row={project.id}
              data-project-directory={project.path}
              tabIndex={index === Math.min(focusIndex, ordered.length - 1) ? 0 : -1}
              onFocus={(event) => {
                if (event.target === event.currentTarget) setFocusIndex(index)
              }}
              onClick={() => handleOpen(project)}
              onKeyDown={(event) => {
                // Keys pressed on the hover actions belong to those buttons, not the row.
                if (event.target !== event.currentTarget) return
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  handleOpen(project)
                }
              }}
              className={cn(
                "group surface-inset-row flex w-full cursor-pointer items-center gap-3 text-left transition-colors",
                compact ? "px-2 py-1.5" : "px-2.5 py-2",
                "hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
                isActive && "bg-interactive-selection/60",
              )}
            >
              <span
                className={cn(
                  "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-background",
                  compact ? "h-6 w-6" : "h-7 w-7",
                )}
                style={project.iconBackground ? { backgroundColor: project.iconBackground } : undefined}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    className="h-full w-full object-contain"
                    draggable={false}
                    onError={() => {
                      setBrokenIconIds((prev) => {
                        if (prev.has(imageFailureKey)) return prev
                        const next = new Set(prev)
                        next.add(imageFailureKey)
                        return next
                      })
                    }}
                  />
                ) : iconName ? (
                  <Icon name={iconName} className="h-4 w-4" style={color ? { color } : undefined} />
                ) : (
                  <Icon name="folder" className="h-4 w-4 text-muted-foreground" style={color ? { color } : undefined} />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate typography-ui-label font-medium text-foreground">{title}</span>
                  {project.pinned ? (
                    <Icon name="pushpin-2-fill" className="h-3 w-3 shrink-0 text-primary" aria-hidden />
                  ) : null}
                </span>
                <span className={cn("block font-mono typography-micro text-muted-foreground", ambiguous ? "break-all" : "truncate")}>{pathLabel}</span>
              </span>

              <span className="flex shrink-0 items-center gap-2">
                {attentionTarget ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 typography-micro text-muted-foreground"
                    title={statusLabel}
                    aria-label={`${statusLabel} · ${contextName}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      openNeedsYouSession(attentionTarget)
                    }}
                  >
                    <ActivityDot activity={projectActivity} />
                    {!compact ? (
                      <span className="font-medium text-[var(--status-warning)]">{statusLabel}</span>
                    ) : null}
                  </button>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 typography-micro text-muted-foreground"
                    title={statusLabel}
                  >
                    <ActivityDot activity={projectActivity} />
                    {!compact ? <span>{statusLabel}</span> : null}
                    {!compact && lastUsed && projectActivity.tone === "idle" ? (
                      <span className="hidden md:inline">· {lastUsed}</span>
                    ) : null}
                  </span>
                )}
                <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={(event) => handleTogglePin(project, event)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                    aria-label={`${project.pinned ? t("projects.home.actions.unpin") : t("projects.home.actions.pin")} · ${contextName}`}
                    title={project.pinned ? t("projects.home.actions.unpin") : t("projects.home.actions.pin")}
                  >
                    <Icon name={project.pinned ? "pushpin-2-fill" : "pushpin-2"} className="h-3.5 w-3.5" />
                  </button>
                  {onNewSession ? (
                    <button
                      type="button"
                      onClick={(event) => handleNewSession(project, event)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                      aria-label={`${t("projects.home.actions.newSession")} · ${contextName}`}
                      title={t("projects.home.actions.newSession")}
                    >
                      <Icon name="chat-new" className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </span>
              </span>
            </div>
          )
        })}
      </div>

      <ImportProjectsDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}
