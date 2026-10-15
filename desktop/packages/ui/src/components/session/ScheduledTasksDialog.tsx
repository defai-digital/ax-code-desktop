import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { MobileOverlayPanel } from "@/components/ui/MobileOverlayPanel"
import { ViewLoadingSkeleton } from "@/components/ui/ViewLoadingSkeleton"
import { toast } from "@/components/ui"
import { useConfirmDialog } from "@/components/ui/ConfirmDialog"
import { Icon } from "@/components/icon/Icon"
import type { IconName } from "@/components/icon/icons"
import { useUIStore } from "@/stores/useUIStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { refreshGlobalSessions } from "@/stores/useGlobalSessionsStore"
import { subscribeScheduledTaskEvents } from "@/lib/scheduledTaskEvents"
import { PROJECT_COLOR_MAP, PROJECT_ICON_MAP, getProjectIconImageUrl } from "@/lib/projectMeta"
import { useThemeSystem } from "@/contexts/useThemeSystem"
import { cn, formatDirectoryName } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import type { ProjectEntry } from "@/lib/api/types"
import {
  createScheduledTasks,
  deleteScheduledTask,
  expandPromptSnippets,
  fetchScheduledTasks,
  runScheduledTaskNow,
  setScheduledTaskEnabled,
  updateScheduledTask,
  type ScheduledTask,
  type ScheduledTaskRunDisplayStatus,
} from "@/lib/scheduledTasksApi"
import {
  buildRuntimeScheduledTaskPayloads,
  type RuntimeSchedule,
  type ScheduledTaskDraftInput,
} from "@/lib/scheduledTaskTransform"
import { ScheduledTaskEditorDialog } from "./ScheduledTaskEditorDialog"
import { loadCurrent } from "@/lib/currentLoad"
import { relativeTimeParts } from "./scheduledTaskRelativeTime"
import {
  ALL_PROJECTS_VALUE,
  buildProjectGroups,
  buildTaskRowKey,
  computeSummary,
  directoryForTask,
  groupDirectoryForTask,
  mapWithConcurrencyLimit,
  normalizeDirectory,
  resolveEventTargetDirectories,
  sortScheduledTasks,
} from "./scheduledTaskGroups"

const pad2 = (value: number): string => String(value).padStart(2, "0")

const formatSchedule = (task: ScheduledTask, t: ReturnType<typeof useI18n>["t"]): string => {
  const schedule = task.schedule as RuntimeSchedule
  const timezone = "timezone" in schedule ? schedule.timezone : undefined
  const formatWeekday = (value: number) => {
    if (value === 0) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.sun")
    if (value === 1) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.mon")
    if (value === 2) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.tue")
    if (value === 3) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.wed")
    if (value === 4) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.thu")
    if (value === 5) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.fri")
    if (value === 6) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.sat")
    return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.unknown")
  }
  if (schedule.type === "daily") {
    if (timezone) {
      return t("sessions.scheduledTasks.dialog.schedule.dailyWithTimezone", {
        time: schedule.time,
        timezone,
      })
    }
    return t("sessions.scheduledTasks.dialog.schedule.daily", { time: schedule.time })
  }
  if (schedule.type === "weekly") {
    const days = formatWeekday(schedule.day)
    if (timezone) {
      return t("sessions.scheduledTasks.dialog.schedule.weeklyWithTimezone", {
        days,
        time: schedule.time,
        timezone,
      })
    }
    return t("sessions.scheduledTasks.dialog.schedule.weekly", { days, time: schedule.time })
  }
  if (schedule.type === "once") {
    const runAt = new Date(schedule.runAt)
    const date = `${runAt.getFullYear()}-${pad2(runAt.getMonth() + 1)}-${pad2(runAt.getDate())}`
    const time = `${pad2(runAt.getHours())}:${pad2(runAt.getMinutes())}`
    return t("sessions.scheduledTasks.dialog.schedule.once", { date, time })
  }
  if (timezone) {
    return t("sessions.scheduledTasks.dialog.schedule.cronWithTimezone", {
      cron: schedule.expression,
      timezone,
    })
  }
  return t("sessions.scheduledTasks.dialog.schedule.cron", { cron: schedule.expression })
}

const formatClockTime = (value?: number): string => {
  if (!value || !Number.isFinite(value)) {
    return ""
  }
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

const formatRelativeTime = (value: number | undefined, t: ReturnType<typeof useI18n>["t"]): string => {
  const parts = relativeTimeParts(value)
  switch (parts.kind) {
    case "empty":
      return ""
    case "seconds":
      return parts.future
        ? t("sessions.scheduledTasks.dialog.relativeTime.inLessThanOneMinute")
        : t("sessions.scheduledTasks.dialog.relativeTime.justNow")
    case "minutes":
      return parts.future
        ? t("sessions.scheduledTasks.dialog.relativeTime.inMinutes", { count: parts.count })
        : t("sessions.scheduledTasks.dialog.relativeTime.minutesAgo", { count: parts.count })
    case "duration":
      return parts.future
        ? t("sessions.scheduledTasks.dialog.relativeTime.inDuration", { duration: parts.body })
        : t("sessions.scheduledTasks.dialog.relativeTime.durationAgo", { duration: parts.body })
  }
}

type ScheduledTaskStatusTone = "success" | "error" | "warning" | "muted"

const STATUS_META: Record<
  ScheduledTaskRunDisplayStatus,
  {
    tone: ScheduledTaskStatusTone
    Icon: IconName
    spin?: boolean
  }
> = {
  success: { tone: "success", Icon: "checkbox-circle" },
  error: { tone: "error", Icon: "error-warning" },
  running: { tone: "warning", Icon: "loader-4", spin: true },
  idle: { tone: "muted", Icon: "pulse" },
}

const toneStyle = (tone: ScheduledTaskStatusTone): React.CSSProperties => {
  if (tone === "muted") {
    return {}
  }
  return {
    color: `var(--status-${tone})`,
    backgroundColor: `var(--status-${tone}-background)`,
    borderColor: `var(--status-${tone}-border)`,
  }
}

type GroupLoadState = {
  tasks: ScheduledTask[]
  loading: boolean
  error: string | null
  hasLoaded: boolean
}

const EMPTY_GROUP_STATE: GroupLoadState = { tasks: [], loading: false, error: null, hasLoaded: false }

export function ScheduledTasksDialog() {
  const { t, plural } = useI18n()
  const open = useUIStore((state) => state.isScheduledTasksDialogOpen)
  const setOpen = useUIStore((state) => state.setScheduledTasksDialogOpen)
  const isMobile = useUIStore((state) => state.isMobile)
  const projects = useProjectsStore((state) => state.projects)
  const activeProject = useProjectsStore((state) => state.getActiveProject())
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory)
  const { currentTheme } = useThemeSystem()

  const [selectedProjectID, setSelectedProjectID] = React.useState<string>("")
  const [groupStateByDirectory, setGroupStateByDirectory] = React.useState<Map<string, GroupLoadState>>(() => new Map())
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editorTask, setEditorTask] = React.useState<ScheduledTask | null>(null)
  const [editorDirectory, setEditorDirectory] = React.useState<string>("")
  const [mutatingRowKeys, setMutatingRowKeys] = React.useState<ReadonlySet<string>>(() => new Set())
  const { requestConfirm, confirmDialog } = useConfirmDialog()

  const openRef = React.useRef(false)
  const selectedProjectIDRef = React.useRef("")
  const projectsRef = React.useRef<ProjectEntry[]>(projects)
  const openGenerationRef = React.useRef(0)
  const requestSeqByDirectoryRef = React.useRef<Map<string, number>>(new Map())
  const selectionInitializedRef = React.useRef(false)
  const userSelectedRef = React.useRef(false)
  const eventTimersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const attemptedDirectoriesRef = React.useRef<Set<string>>(new Set())
  const queuedDirectoriesRef = React.useRef<Set<string>>(new Set())

  React.useEffect(() => {
    projectsRef.current = projects
  }, [projects])

  const clearEventTimers = React.useCallback(() => {
    for (const timer of eventTimersRef.current.values()) {
      clearTimeout(timer)
    }
    eventTimersRef.current.clear()
  }, [])

  React.useEffect(() => {
    openRef.current = open
    if (!open) {
      openGenerationRef.current += 1
      requestSeqByDirectoryRef.current.clear()
      clearEventTimers()
      selectionInitializedRef.current = false
      userSelectedRef.current = false
      attemptedDirectoriesRef.current.clear()
      queuedDirectoriesRef.current.clear()
      selectedProjectIDRef.current = ""
      setSelectedProjectID("")
      setGroupStateByDirectory(new Map())
      setMutatingRowKeys(new Set())
      setEditorDirectory("")
    } else {
      openGenerationRef.current += 1
      selectionInitializedRef.current = false
      userSelectedRef.current = false
    }
  }, [open, clearEventTimers])

  const isAllMode = selectedProjectID === ALL_PROJECTS_VALUE

  const selectedProject = React.useMemo(
    () => (isAllMode ? null : projects.find((project) => project.id === selectedProjectID) || null),
    [projects, selectedProjectID, isAllMode],
  )

  const projectGroups = React.useMemo(() => buildProjectGroups(projects), [projects])

  const groupViews = React.useMemo(
    () =>
      projectGroups.map((group) => ({
        ...group,
        state: groupStateByDirectory.get(group.directory) ?? EMPTY_GROUP_STATE,
      })),
    [projectGroups, groupStateByDirectory],
  )

  const projectDisplayLabel = React.useCallback(
    (project: ProjectEntry): string =>
      project.label?.trim() || formatDirectoryName(project.path, homeDirectory || undefined),
    [homeDirectory],
  )

  const renderProjectLabel = React.useCallback(
    (project: ProjectEntry) => {
      const displayLabel = projectDisplayLabel(project)
      const imageUrl = getProjectIconImageUrl(
        { id: project.id, iconImage: project.iconImage ?? null },
        {
          themeVariant: currentTheme.metadata.variant,
          iconColor: currentTheme.colors.surface.foreground,
        },
      )
      const projectIconName = project.icon ? PROJECT_ICON_MAP[project.icon] : null
      const iconColor = project.color ? PROJECT_COLOR_MAP[project.color] : undefined

      return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {imageUrl ? (
            <span
              className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center overflow-hidden rounded-[3px]"
              style={project.iconBackground ? { backgroundColor: project.iconBackground } : undefined}
            >
              <img src={imageUrl} alt="" className="h-full w-full object-contain" draggable={false} />
            </span>
          ) : projectIconName ? (
            <Icon
              name={projectIconName}
              className="h-3.5 w-3.5 shrink-0"
              style={iconColor ? { color: iconColor } : undefined}
            />
          ) : (
            <Icon
              name="folder"
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              style={iconColor ? { color: iconColor } : undefined}
            />
          )}
          <span className="truncate">{displayLabel}</span>
        </span>
      )
    },
    [projectDisplayLabel, currentTheme.metadata.variant, currentTheme.colors.surface.foreground],
  )

  // Runtime scheduled tasks are scoped by project directory (the runtime's
  // `?directory=` instance key), not by the desktop project id.
  const directoryForProject = React.useCallback(
    (projectID: string): string => projectsRef.current.find((project) => project.id === projectID)?.path || "",
    [],
  )

  const updateGroupState = React.useCallback((directory: string, updater: (prev: GroupLoadState) => GroupLoadState) => {
    setGroupStateByDirectory((prev) => {
      const next = new Map(prev)
      next.set(directory, updater(next.get(directory) ?? EMPTY_GROUP_STATE))
      return next
    })
  }, [])

  const isDirectorySelected = React.useCallback((directory: string): boolean => {
    const selection = selectedProjectIDRef.current
    if (!selection) {
      return false
    }
    if (selection === ALL_PROJECTS_VALUE) {
      return buildProjectGroups(projectsRef.current).some((group) => group.directory === directory)
    }
    const project = projectsRef.current.find((item) => item.id === selection)
    return project ? normalizeDirectory(project.path) === directory : false
  }, [])

  const loadGroup = React.useCallback(
    async (directory: string, options?: { silent?: boolean }) => {
      const normalized = normalizeDirectory(directory)
      if (!normalized) {
        return
      }
      const generation = openGenerationRef.current
      const seq = (requestSeqByDirectoryRef.current.get(normalized) ?? 0) + 1
      requestSeqByDirectoryRef.current.set(normalized, seq)
      attemptedDirectoriesRef.current.add(normalized)
      updateGroupState(normalized, (prev) => ({ ...prev, loading: true }))

      const loaded = await loadCurrent({
        load: () => fetchScheduledTasks(normalized),
        isCurrent: () =>
          openRef.current &&
          openGenerationRef.current === generation &&
          requestSeqByDirectoryRef.current.get(normalized) === seq &&
          isDirectorySelected(normalized),
      })

      if (loaded.status === "loaded") {
        updateGroupState(normalized, (prev) => ({
          ...prev,
          tasks: sortScheduledTasks(loaded.result),
          loading: false,
          error: null,
          hasLoaded: true,
        }))
      } else if (loaded.status === "failed") {
        if (selectedProjectIDRef.current === ALL_PROJECTS_VALUE) {
          // One failing project must not blank the others or raise a toast.
          updateGroupState(normalized, (prev) => ({
            ...prev,
            loading: false,
            error:
              loaded.error instanceof Error
                ? loaded.error.message
                : t("sessions.scheduledTasks.dialog.group.loadFailed"),
          }))
        } else {
          toast.error(
            loaded.error instanceof Error ? loaded.error.message : t("sessions.scheduledTasks.dialog.toast.loadFailed"),
          )
          updateGroupState(normalized, (prev) => ({
            ...prev,
            loading: false,
            error: null,
            tasks: options?.silent ? prev.tasks : [],
          }))
        }
      }
      if (loaded.status === "stale") {
        // A newer request for this directory owns the group state. Otherwise
        // (selection switch, project removed) release the loading flag and the
        // attempted marker so the group can load again if it reappears; a
        // closed dialog already reset everything.
        // A directory still queued in a batch stays owned by that batch.
        if (
          openGenerationRef.current === generation &&
          requestSeqByDirectoryRef.current.get(normalized) === seq &&
          !queuedDirectoriesRef.current.has(normalized)
        ) {
          attemptedDirectoriesRef.current.delete(normalized)
          updateGroupState(normalized, (prev) => ({ ...prev, loading: false }))
        }
      }
    },
    [isDirectorySelected, updateGroupState, t],
  )

  const loadGroups = React.useCallback(
    async (directories: readonly string[], options?: { silent?: boolean }) => {
      // Mark the whole batch before the concurrency limit queues it, so queued
      // groups render as loading (not empty) and are not picked up again as
      // newly registered projects.
      const batch = [...new Set(directories.map(normalizeDirectory).filter(Boolean))]
      const generation = openGenerationRef.current
      for (const directory of batch) {
        attemptedDirectoriesRef.current.add(directory)
        queuedDirectoriesRef.current.add(directory)
      }
      setGroupStateByDirectory((prev) => {
        const next = new Map(prev)
        for (const directory of batch) {
          next.set(directory, { ...(next.get(directory) ?? EMPTY_GROUP_STATE), loading: true })
        }
        return next
      })
      await mapWithConcurrencyLimit(batch, 3, async (directory) => {
        queuedDirectoriesRef.current.delete(directory)
        if (openGenerationRef.current !== generation) {
          return
        }
        // Skip queued work the dialog no longer shows (selection switch or
        // project removed) instead of fetching only to discard the result.
        if (!openRef.current || !isDirectorySelected(directory)) {
          attemptedDirectoriesRef.current.delete(directory)
          updateGroupState(directory, (prev) => ({ ...prev, loading: false }))
          return
        }
        await loadGroup(directory, options)
      })
    },
    [isDirectorySelected, loadGroup, updateGroupState],
  )

  const loadAllGroups = React.useCallback(
    async (options?: { silent?: boolean }) => {
      const directories = buildProjectGroups(projectsRef.current).map((group) => group.directory)
      await loadGroups(directories, options)
    },
    [loadGroups],
  )

  // Initialize the selection once per open. Later store updates do not reset
  // it; if no projects exist yet, the first non-empty list initializes it
  // unless the user already picked something.
  React.useEffect(() => {
    if (!open || selectionInitializedRef.current || userSelectedRef.current) {
      return
    }
    if (projects.length === 0) {
      return
    }
    const initial = projects.length >= 2 ? ALL_PROJECTS_VALUE : activeProject?.id || projects[0]?.id || ""
    if (!initial) {
      return
    }
    selectionInitializedRef.current = true
    selectedProjectIDRef.current = initial
    setSelectedProjectID(initial)
  }, [open, projects, activeProject])

  // A selected project that is removed while the dialog is open falls back to
  // the default selection instead of leaving a dangling id.
  React.useEffect(() => {
    if (!open || !selectedProjectID || selectedProjectID === ALL_PROJECTS_VALUE) {
      return
    }
    if (projects.some((project) => project.id === selectedProjectID)) {
      return
    }
    const fallback = projects.length >= 2 ? ALL_PROJECTS_VALUE : activeProject?.id || projects[0]?.id || ""
    if (!fallback) {
      // Nothing to fall back to: let the initializer pick a project once one
      // is added while the dialog is open.
      selectionInitializedRef.current = false
      userSelectedRef.current = false
    }
    selectedProjectIDRef.current = fallback
    setSelectedProjectID(fallback)
  }, [open, projects, activeProject, selectedProjectID])

  const selectedDirectory = selectedProject ? normalizeDirectory(selectedProject.path) : ""

  // Load whenever the selection changes (initial pick or user switch) or the
  // selected project's directory changes.
  React.useEffect(() => {
    if (!open || !selectedProjectID) {
      return
    }
    if (selectedProjectID === ALL_PROJECTS_VALUE) {
      void loadAllGroups()
      return
    }
    if (selectedDirectory) {
      void loadGroup(selectedDirectory)
    }
  }, [open, selectedProjectID, selectedDirectory, loadAllGroups, loadGroup])

  // In All mode, load groups for projects registered while the dialog is open.
  React.useEffect(() => {
    if (!open || selectedProjectID !== ALL_PROJECTS_VALUE) {
      return
    }
    const missing = projectGroups
      .filter((group) => !attemptedDirectoriesRef.current.has(group.directory))
      .map((group) => group.directory)
    if (missing.length > 0) {
      void loadGroups(missing, { silent: true })
    }
  }, [open, selectedProjectID, projectGroups, groupStateByDirectory, loadGroups])

  React.useEffect(() => {
    if (!open) {
      return
    }
    const scheduleGroupReload = (directory: string) => {
      const existing = eventTimersRef.current.get(directory)
      if (existing) {
        clearTimeout(existing)
      }
      const timer = setTimeout(() => {
        eventTimersRef.current.delete(directory)
        void loadGroup(directory, { silent: true })
      }, 400)
      eventTimersRef.current.set(directory, timer)
    }

    const unsubscribe = subscribeScheduledTaskEvents((event) => {
      if (selectedProjectIDRef.current === ALL_PROJECTS_VALUE) {
        const known = buildProjectGroups(projectsRef.current).map((group) => group.directory)
        for (const directory of resolveEventTargetDirectories(event.directory, known)) {
          scheduleGroupReload(directory)
        }
        return
      }
      const selection = selectedProjectIDRef.current
      if (!selection) {
        return
      }
      const directory = normalizeDirectory(directoryForProject(selection))
      if (!directory) {
        return
      }
      // Events without a directory always trigger a refresh; directory-scoped
      // events must match the selection (same as before All mode existed).
      if (event.directory && normalizeDirectory(event.directory) !== directory) {
        return
      }
      scheduleGroupReload(directory)
    })
    return () => {
      clearEventTimers()
      unsubscribe()
    }
  }, [open, selectedProjectID, loadGroup, directoryForProject, clearEventTimers])

  const handleSaveTask = React.useCallback(
    async (submit: { id?: string; enabled: boolean; input: ScheduledTaskDraftInput }) => {
      const directory = normalizeDirectory(editorDirectory)
      if (!directory) {
        throw new Error(t("sessions.scheduledTasks.dialog.error.chooseProjectFirst"))
      }
      // Client-side fan-out: a multi-time/multi-weekday draft becomes N
      // runtime tasks (same naming as the S2.6 migration). When editing, the
      // first slot updates the edited task and any extra slots become new
      // sibling tasks. Snippet references are pre-expanded — the runtime
      // executes the stored prompt verbatim.
      const prompt = await expandPromptSnippets(directory, submit.input.prompt)
      const payloads = buildRuntimeScheduledTaskPayloads({ ...submit.input, prompt })
      if (!payloads || payloads.length === 0) {
        throw new Error(t("sessions.scheduledTasks.dialog.toast.updateFailed"))
      }
      if (submit.id) {
        const [first, ...rest] = payloads
        await updateScheduledTask(directory, submit.id, {
          title: first.title,
          prompt: first.prompt,
          schedule: first.schedule,
          ...(first.agent ? { agent: first.agent } : {}),
          ...(first.model ? { model: first.model } : {}),
          catchUpPolicy: first.catchUpPolicy,
          status: submit.enabled ? "active" : "paused",
        })
        if (rest.length > 0) {
          await createScheduledTasks(directory, rest, { pause: !submit.enabled })
        }
      } else {
        await createScheduledTasks(directory, payloads, { pause: !submit.enabled })
      }
      await loadGroup(directory)
      toast.success(t("sessions.scheduledTasks.dialog.toast.saved"))
    },
    [editorDirectory, loadGroup, t],
  )

  const markRowBusy = React.useCallback((rowKey: string, busy: boolean) => {
    setMutatingRowKeys((prev) => {
      if (prev.has(rowKey) === busy) {
        return prev
      }
      const next = new Set(prev)
      if (busy) {
        next.add(rowKey)
      } else {
        next.delete(rowKey)
      }
      return next
    })
  }, [])

  const directoryForTaskRow = React.useCallback((task: ScheduledTask): string => {
    const known = buildProjectGroups(projectsRef.current).map((group) => group.directory)
    return groupDirectoryForTask(task, known)
  }, [])

  const handleToggleEnabled = React.useCallback(
    async (task: ScheduledTask, enabled: boolean) => {
      const directory = directoryForTaskRow(task)
      if (!directory) {
        return
      }
      const rowKey = buildTaskRowKey(directory, task.id)
      markRowBusy(rowKey, true)
      updateGroupState(directory, (prev) => ({
        ...prev,
        tasks: prev.tasks.map((item) =>
          item.id === task.id ? { ...item, status: enabled ? "active" : "paused" } : item,
        ),
      }))
      try {
        await setScheduledTaskEnabled(directory, task.id, enabled)
        await loadGroup(directory, { silent: true })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("sessions.scheduledTasks.dialog.toast.updateFailed"))
        await loadGroup(directory, { silent: true })
      } finally {
        markRowBusy(rowKey, false)
      }
    },
    [directoryForTaskRow, loadGroup, markRowBusy, updateGroupState, t],
  )

  const handleDeleteTask = React.useCallback(
    async (task: ScheduledTask) => {
      const directory = directoryForTaskRow(task)
      if (!directory) {
        return
      }
      const confirmed = await requestConfirm(
        t("sessions.scheduledTasks.dialog.confirm.deleteTask", { taskName: task.title }),
        { destructive: true },
      )
      if (!confirmed) {
        return
      }

      const rowKey = buildTaskRowKey(directory, task.id)
      markRowBusy(rowKey, true)
      try {
        await deleteScheduledTask(directory, task.id)
        await loadGroup(directory, { silent: true })
        toast.success(t("sessions.scheduledTasks.dialog.toast.deleted"))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("sessions.scheduledTasks.dialog.toast.deleteFailed"))
      } finally {
        markRowBusy(rowKey, false)
      }
    },
    [directoryForTaskRow, loadGroup, markRowBusy, t, requestConfirm],
  )

  const handleRunNow = React.useCallback(
    async (task: ScheduledTask) => {
      const directory = directoryForTaskRow(task)
      if (!directory) {
        return
      }
      const rowKey = buildTaskRowKey(directory, task.id)
      markRowBusy(rowKey, true)
      try {
        await runScheduledTaskNow(directory, task.id)
        await Promise.all([loadGroup(directory, { silent: true }), refreshGlobalSessions()])
        toast.success(t("sessions.scheduledTasks.dialog.toast.started"))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("sessions.scheduledTasks.dialog.toast.runFailed"))
      } finally {
        markRowBusy(rowKey, false)
      }
    },
    [directoryForTaskRow, loadGroup, markRowBusy, t],
  )

  const projectSelector = (
    <div className="flex flex-col items-start gap-1">
      <span className="typography-meta text-muted-foreground">{t("sessions.scheduledTasks.dialog.project.label")}</span>
      <Select
        value={selectedProjectID || "__none"}
        onValueChange={(value) => {
          const nextProjectID = value === "__none" ? "" : value
          userSelectedRef.current = true
          selectionInitializedRef.current = true
          selectedProjectIDRef.current = nextProjectID
          setSelectedProjectID(nextProjectID)
        }}
      >
        <SelectTrigger className={isMobile ? "w-full" : undefined}>
          {isAllMode ? (
            <SelectValue>{t("sessions.scheduledTasks.dialog.project.allProjects")}</SelectValue>
          ) : selectedProject ? (
            <SelectValue>{renderProjectLabel(selectedProject)}</SelectValue>
          ) : (
            <SelectValue placeholder={t("sessions.scheduledTasks.dialog.project.placeholder")} />
          )}
        </SelectTrigger>
        <SelectContent>
          {projects.length === 0 ? (
            <SelectItem value="__none">{t("sessions.scheduledTasks.dialog.project.empty")}</SelectItem>
          ) : null}
          {projects.length > 0 ? (
            <SelectItem value={ALL_PROJECTS_VALUE}>
              {t("sessions.scheduledTasks.dialog.project.allProjects")}
            </SelectItem>
          ) : null}
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {renderProjectLabel(project)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const openNewTaskEditor = (directory: string) => {
    setEditorDirectory(normalizeDirectory(directory))
    setEditorTask(null)
    setEditorOpen(true)
  }

  const openEditTaskEditor = (task: ScheduledTask) => {
    setEditorDirectory(directoryForTaskRow(task))
    setEditorTask(task)
    setEditorOpen(true)
  }

  const renderTaskRow = (task: ScheduledTask) => {
    const rowKey = buildTaskRowKey(directoryForTask(task), task.id)
    const isBusy = mutatingRowKeys.has(rowKey)
    const isActive = task.status === "active"
    const status = task.lastRunStatus
    const meta = STATUS_META[status]
    const statusLabel =
      status === "success"
        ? t("sessions.scheduledTasks.dialog.status.success")
        : status === "error"
          ? t("sessions.scheduledTasks.dialog.status.error")
          : status === "running"
            ? t("sessions.scheduledTasks.dialog.status.running")
            : t("sessions.scheduledTasks.dialog.status.idle")
    const nextAt = task.nextRunAt
    const lastAt = task.lastRunAt

    return (
      <div
        key={rowKey}
        className={cn("rounded-lg border border-border p-4 transition-opacity", !isActive && "opacity-60")}
      >
        <div className="min-w-0">
          <div className="typography-ui-header truncate font-semibold text-foreground">{task.title}</div>
          <div className="typography-micro truncate text-muted-foreground">{formatSchedule(task, t)}</div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 typography-micro text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="timer" className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{t("sessions.scheduledTasks.dialog.nextRun.label")}</span>
            {nextAt ? (
              <>
                <span className="text-foreground">{formatRelativeTime(nextAt, t)}</span>
                <span className="text-muted-foreground">·</span>
                <span>{formatClockTime(nextAt)}</span>
              </>
            ) : (
              <span>—</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="history" className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{t("sessions.scheduledTasks.dialog.lastRun.label")}</span>
            {status === "running" ? (
              <span className="inline-flex items-center gap-1" style={{ color: "var(--status-warning)" }}>
                <Icon name="loader-4" className="h-3.5 w-3.5 animate-spin" />
                {t("sessions.scheduledTasks.dialog.lastRun.runningNow")}
              </span>
            ) : lastAt ? (
              <>
                {meta.tone !== "muted" ? (
                  <span className="inline-flex items-center gap-1" style={{ color: `var(--status-${meta.tone})` }}>
                    <Icon name={meta.Icon} className="h-3.5 w-3.5" />
                    {statusLabel}
                  </span>
                ) : null}
                <span className="text-muted-foreground">·</span>
                <span>{formatRelativeTime(lastAt, t)}</span>
              </>
            ) : (
              <span>{t("sessions.scheduledTasks.dialog.lastRun.never")}</span>
            )}
          </span>
        </div>

        {task.lastError ? (
          <div
            className="mt-3 flex items-start gap-2 rounded-md border p-2 typography-micro"
            style={toneStyle("error")}
          >
            <Icon name="error-warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">{task.lastError}</span>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <label
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 typography-micro font-medium",
              isActive ? "text-foreground" : "text-muted-foreground",
              isBusy && "cursor-not-allowed opacity-50",
            )}
          >
            <Checkbox
              checked={isActive}
              onChange={(enabled) => void handleToggleEnabled(task, enabled)}
              ariaLabel={
                isActive
                  ? t("sessions.scheduledTasks.dialog.taskToggle.pauseAria", { taskName: task.title })
                  : t("sessions.scheduledTasks.dialog.taskToggle.enableAria", { taskName: task.title })
              }
              disabled={isBusy}
            />
            {isActive
              ? t("sessions.scheduledTasks.dialog.taskToggle.enabled")
              : t("sessions.scheduledTasks.dialog.taskToggle.paused")}
          </label>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRunNow(task)}
              disabled={isBusy}
              aria-label={t("sessions.scheduledTasks.dialog.actions.runNowAria", { taskName: task.title })}
            >
              <Icon name="play" className="h-4 w-4" /> {t("sessions.scheduledTasks.dialog.actions.runNow")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openEditTaskEditor(task)}
              disabled={isBusy}
              aria-label={t("sessions.scheduledTasks.dialog.actions.editAria", { taskName: task.title })}
            >
              <Icon name="edit-2" className="h-4 w-4" /> {t("sessions.scheduledTasks.dialog.actions.edit")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleDeleteTask(task)}
              disabled={isBusy}
              aria-label={t("sessions.scheduledTasks.dialog.actions.deleteAria", { taskName: task.title })}
            >
              <Icon name="delete-bin" className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const summary = computeSummary(
    groupViews.map((group) => ({
      directory: group.directory,
      tasks: group.state.tasks,
      error: group.state.error,
      hasLoaded: group.state.hasLoaded,
    })),
  )

  const summaryLine = isAllMode ? (
    <p className="typography-meta text-muted-foreground">
      {t("sessions.scheduledTasks.dialog.summary.activeTotal", {
        active: summary.active,
        total: summary.total,
        projects: summary.projects,
      })}
      {summary.running > 0 ? (
        <> · {t("sessions.scheduledTasks.dialog.summary.running", { running: summary.running })}</>
      ) : null}
      {summary.failing > 0 ? (
        <> · {t("sessions.scheduledTasks.dialog.summary.failing", { failing: summary.failing })}</>
      ) : null}
      {summary.unavailable > 0 ? (
        <> · {t("sessions.scheduledTasks.dialog.summary.unavailable", { count: summary.unavailable })}</>
      ) : null}
    </p>
  ) : null

  const singleGroup =
    !isAllMode && selectedProject
      ? groupViews.find((group) => group.directory === normalizeDirectory(selectedProject.path))
      : undefined
  const singleTasks = singleGroup?.state.tasks ?? []
  // Until the selected project's first response arrives (or fails), show the
  // skeleton rather than flashing the empty state.
  const singleLoading = Boolean(
    selectedProject && (!singleGroup || (singleGroup.state.loading && !singleGroup.state.hasLoaded)),
  )
  const allInitiallyLoading =
    groupViews.length > 0 && groupViews.every((group) => group.state.loading && !group.state.hasLoaded)

  const renderGroupTasks = (group: (typeof groupViews)[number]) => {
    const { state } = group
    if (state.loading && !state.hasLoaded) {
      return <ViewLoadingSkeleton rows={2} label={t("sessions.scheduledTasks.dialog.loading")} />
    }
    return (
      <>
        {state.error ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 typography-micro"
            style={toneStyle("error")}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <Icon name="error-warning" className="h-3.5 w-3.5 shrink-0" />
              <span className="break-words">{t("sessions.scheduledTasks.dialog.group.loadFailed")}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadGroup(group.directory)}
              aria-label={t("sessions.scheduledTasks.dialog.group.retryAria", {
                project: projectDisplayLabel(group.project),
              })}
            >
              {t("sessions.scheduledTasks.dialog.actions.retry")}
            </Button>
          </div>
        ) : null}
        {state.tasks.length > 0 ? (
          <div className="space-y-2.5">{state.tasks.map((task) => renderTaskRow(task))}</div>
        ) : !state.error ? (
          <div className="rounded-lg border border-dashed border-border p-4 typography-meta text-muted-foreground">
            {t("sessions.scheduledTasks.dialog.empty.noTasks")}
          </div>
        ) : null}
      </>
    )
  }

  const tasksContent = (
    <div className="space-y-4">
      {!isMobile ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {projectSelector}
          {!isAllMode ? (
            <Button
              onClick={() => openNewTaskEditor(directoryForProject(selectedProjectID))}
              disabled={!selectedProjectID}
            >
              <Icon name="add" className="mr-1 h-4 w-4" /> {t("sessions.scheduledTasks.dialog.actions.newTask")}
            </Button>
          ) : null}
        </div>
      ) : (
        projectSelector
      )}

      {summaryLine}

      <div className="min-h-[280px]">
        {isAllMode ? (
          allInitiallyLoading ? (
            <ViewLoadingSkeleton rows={4} label={t("sessions.scheduledTasks.dialog.loading")} />
          ) : (
            <div className="space-y-6">
              {groupViews.map((group) => (
                <section
                  key={group.directory}
                  className="space-y-2.5"
                  aria-label={t("sessions.scheduledTasks.dialog.group.sectionAria", {
                    project: projectDisplayLabel(group.project),
                  })}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex min-w-0 items-center gap-2">
                      {renderProjectLabel(group.project)}
                      {group.state.hasLoaded ? (
                        <span className="typography-micro tabular-nums text-muted-foreground">
                          {plural("common.itemCount", group.state.tasks.length)}
                        </span>
                      ) : null}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openNewTaskEditor(group.directory)}
                      aria-label={t("sessions.scheduledTasks.dialog.group.newTaskAria", {
                        project: projectDisplayLabel(group.project),
                      })}
                    >
                      <Icon name="add" className="mr-1 h-4 w-4" /> {t("sessions.scheduledTasks.dialog.actions.newTask")}
                    </Button>
                  </div>
                  {renderGroupTasks(group)}
                </section>
              ))}
            </div>
          )
        ) : singleLoading ? (
          <ViewLoadingSkeleton rows={4} label={t("sessions.scheduledTasks.dialog.loading")} />
        ) : !selectedProjectID ? (
          <div className="rounded-lg border border-dashed border-border p-4 typography-meta text-muted-foreground">
            {t("sessions.scheduledTasks.dialog.empty.selectProject")}
          </div>
        ) : singleTasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 typography-meta text-muted-foreground">
            {t("sessions.scheduledTasks.dialog.empty.noTasks")}
          </div>
        ) : (
          <div className="space-y-2.5">{singleTasks.map((task) => renderTaskRow(task))}</div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {isMobile ? (
        <MobileOverlayPanel
          open={open}
          title={t("sessions.scheduledTasks.dialog.title")}
          onClose={() => setOpen(false)}
          contentMaxHeightClassName="max-h-[min(80vh,640px)]"
          renderHeader={(closeButton) => (
            <div className="flex flex-col gap-1 border-b border-border/40 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="typography-ui-label font-semibold text-foreground">
                  {t("sessions.scheduledTasks.dialog.title")}
                </h2>
                {closeButton}
              </div>
              <p className="typography-micro text-muted-foreground">
                {t("sessions.scheduledTasks.dialog.description")}
              </p>
            </div>
          )}
          footer={
            isAllMode ? undefined : (
              <Button
                className="w-full"
                onClick={() => openNewTaskEditor(directoryForProject(selectedProjectID))}
                disabled={!selectedProjectID}
              >
                <Icon name="add" className="mr-1 h-4 w-4" /> {t("sessions.scheduledTasks.dialog.actions.newTask")}
              </Button>
            )
          }
        >
          {tasksContent}
        </MobileOverlayPanel>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("sessions.scheduledTasks.dialog.title")}</DialogTitle>
              <DialogDescription>{t("sessions.scheduledTasks.dialog.description")}</DialogDescription>
            </DialogHeader>
            {tasksContent}
          </DialogContent>
        </Dialog>
      )}

      <ScheduledTaskEditorDialog
        open={editorOpen}
        task={editorTask}
        onOpenChange={setEditorOpen}
        onSave={handleSaveTask}
      />
      {confirmDialog}
    </>
  )
}
