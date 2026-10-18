import React from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/components/ui"
import { Icon } from "@/components/icon/Icon"
import { cn } from "@/lib/utils"
import { useRuntimeAPIs } from "@/hooks/useRuntimeAPIs"
import { useDeviceInfo } from "@/lib/device"
import { useUIStore } from "@/stores/useUIStore"
import { useTerminalStore } from "@/stores/useTerminalStore"
import { openExternalUrl } from "@/lib/url"
import { useI18n } from "@/lib/i18n"
import {
  getProjectActionsState,
  saveProjectActionsState,
  type OpenChamberProjectAction,
  type ProjectRef,
} from "@/lib/openchamberConfig"
import {
  normalizeProjectActionDirectory,
  PROJECT_ACTIONS_UPDATED_EVENT,
  PROJECT_ACTION_ICON_MAP,
  toProjectActionRunKey,
} from "@/lib/projectActions"
import { projectScopedEventMatchesProject } from "@/lib/projectScopedEvents"
import { detectDevServerCommand, detectStreamlitEntrypoints, readPackageJsonScripts } from "@/lib/detectDevServer"
import { connectTerminalStream, getTerminalSessionOutput, terminalStreamConsumerKey } from "@/lib/terminalApi"
import { ensureClaimedTerminalSession } from "@/lib/terminalSessionCoordinator"
import { isSupportedRecipeShell, readyProjectActionUrl } from "@/lib/streamlitProjectAction"
import { StreamlitRunDialog } from "@/components/sections/projects/StreamlitRunDialog"
import { createManagedStreamlitAction, streamlitRunCommand, streamlitProgress } from "@/lib/streamlitRecipe"
import { isLoopbackHostname } from "@/lib/loopback"
import { ANALYSIS_APP_RUN_EVENT, claimAnalysisAppRun } from "@/lib/analysisAppArtifact"
import { useSessionUIStore } from "@/sync/session-ui-store"

type UrlWatchEntry = {
  lastSeenChunkId: number | null
  openedUrl: boolean
  tail: string
  openInPreview: boolean
}

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

interface ProjectActionsButtonProps {
  projectRef: ProjectRef | null
  directory: string
  className?: string
  compact?: boolean
  allowMobile?: boolean
}

const ANSI_ESCAPE_PREFIX = String.fromCharCode(27)
const ANSI_ESCAPE_PATTERN = new RegExp(`${ANSI_ESCAPE_PREFIX}\\[[0-9;?]*[ -/]*[@-~]`, "g")
const URL_GLOBAL_PATTERN = /https?:\/\/[^\s<>'"`]+/gi
const AUTO_DISCOVER_ACTION_ID = "__openchamber_auto_discover_preview__"
const AUTO_DISCOVER_PREVIEW_WAIT_TIMEOUT_MS = 15_000
// Thrown when the request's staleness predicate flips mid-flight (the user switched
// sessions or projects while a chunked command was still being sent). It is not an
// error the user should see: the run record never started, so it is dropped silently.
const STALE_ACTION_REQUEST_ERROR = new Error("stale project action request")

const stripControlChars = (value: string): string => {
  let next = ""
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    const isControl =
      (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127
    if (!isControl) {
      next += value[index]
    }
  }
  return next
}

const normalizeManualOpenUrl = (value: string | undefined): string | null => {
  const raw = (value || "").trim()
  if (!raw) {
    return null
  }

  const candidate = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

const extractBestUrl = (value: string): string | null => {
  const cleaned = value.replace(ANSI_ESCAPE_PATTERN, "")
  const matches = cleaned.match(URL_GLOBAL_PATTERN)
  if (!matches || matches.length === 0) {
    return null
  }

  const normalized = matches.map((entry) => entry.replace(/[),.;]+$/, "")).filter(Boolean)

  if (normalized.length === 0) {
    return null
  }

  const portCandidates: Array<{ raw: string; parsed: URL }> = []
  for (const candidate of normalized) {
    try {
      const parsed = new URL(candidate)
      if (parsed.port && parsed.port.length > 0) {
        portCandidates.push({ raw: candidate, parsed })
      }
    } catch {
      // noop
    }
  }

  if (portCandidates.length > 0) {
    const scoreCandidate = (entry: { raw: string; parsed: URL }): number => {
      const { parsed } = entry
      const isLocalHost = isLoopbackHostname(parsed.hostname)
      const normalizedPath = parsed.pathname || "/"
      const pathSegments = normalizedPath.split("/").filter(Boolean).length
      const hasRootPath = normalizedPath === "/" || normalizedPath === ""
      const hasQueryOrHash = Boolean(parsed.search || parsed.hash)

      let score = 0
      if (isLocalHost) score += 50
      if (hasRootPath) score += 30
      score -= Math.min(pathSegments * 5, 20)
      if (hasQueryOrHash) score -= 10
      return score
    }

    portCandidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
    return portCandidates[0]?.parsed.origin ?? portCandidates[0]?.raw ?? null
  }

  return normalized[0] ?? null
}

export const ProjectActionsButton = ({
  projectRef,
  directory,
  className,
  compact = false,
  allowMobile = false,
}: ProjectActionsButtonProps) => {
  const { t } = useI18n()
  const { terminal } = useRuntimeAPIs()
  const { isMobile } = useDeviceInfo()

  const setBottomTerminalOpen = useUIStore((state) => state.setBottomTerminalOpen)
  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab)
  const setSettingsPage = useUIStore((state) => state.setSettingsPage)
  const setSettingsDialogOpen = useUIStore((state) => state.setSettingsDialogOpen)
  const setSettingsProjectsSelectedId = useUIStore((state) => state.setSettingsProjectsSelectedId)
  const openContextPreview = useUIStore((state) => state.openContextPreview)

  const terminalSessions = useTerminalStore((state) => state.sessions)
  const ensureDirectory = useTerminalStore((state) => state.ensureDirectory)
  const setTabLabel = useTerminalStore((state) => state.setTabLabel)
  const setTabIconKey = useTerminalStore((state) => state.setTabIconKey)
  const setActiveTab = useTerminalStore((state) => state.setActiveTab)
  const setConnecting = useTerminalStore((state) => state.setConnecting)
  const setTabSessionId = useTerminalStore((state) => state.setTabSessionId)
  const setTabPreviewUrl = useTerminalStore((state) => state.setTabPreviewUrl)
  const projectActionRuns = useTerminalStore((state) => state.projectActionRuns)
  const setProjectActionRun = useTerminalStore((state) => state.setProjectActionRun)
  const updateProjectActionRunStatus = useTerminalStore((state) => state.updateProjectActionRunStatus)
  const removeProjectActionRun = useTerminalStore((state) => state.removeProjectActionRun)

  const [streamlitDialog, setStreamlitDialog] = React.useState<OpenChamberProjectAction | true | null>(null)
  const [actions, setActions] = React.useState<OpenChamberProjectAction[]>([])
  const [selectedActionId, setSelectedActionId] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const tabByKeyRef = React.useRef<Record<string, string>>({})
  const urlWatchByRunKeyRef = React.useRef<Record<string, UrlWatchEntry>>({})
  const streamCleanupByRunKeyRef = React.useRef<Record<string, () => void>>({})
  const previewWaitTimeoutByRunKeyRef = React.useRef<Record<string, number>>({})
  const loadRequestIdRef = React.useRef(0)
  // Runs whose command has been dispatched but whose store entry does not exist yet: the snapshot
  // guard above cannot see a run that `setProjectActionRun` has not written, so two clicks while
  // the session was being created both reached `terminal.sendInput` and ran the command twice.
  const startingRunKeysRef = React.useRef<Set<string>>(new Set())

  const currentDirectoryRef = React.useRef(directory)
  currentDirectoryRef.current = directory
  const mountedRef = React.useRef(true)
  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const projectId = projectRef?.id ?? null
  const projectPath = projectRef?.path ?? ""
  const currentProjectIdRef = React.useRef(projectId)
  currentProjectIdRef.current = projectId

  const stableProjectRef = React.useMemo(() => {
    if (!projectId) {
      return null
    }
    return { id: projectId, path: projectPath }
  }, [projectId, projectPath])

  const openExternal = React.useCallback(async (url: string) => {
    await openExternalUrl(url)
  }, [])

  const loadActions = React.useCallback(async () => {
    if (!stableProjectRef) {
      return
    }

    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId

    setIsLoading(true)
    try {
      const state = await getProjectActionsState(stableProjectRef)
      if (loadRequestIdRef.current !== requestId) {
        return
      }
      const filtered = state.actions
      setActions(filtered)
      setSelectedActionId((current) => {
        if (current === AUTO_DISCOVER_ACTION_ID) {
          return current
        }
        if (current && filtered.some((entry) => entry.id === current)) {
          return current
        }
        return state.primaryActionId ?? null
      })
    } catch {
      if (loadRequestIdRef.current !== requestId) {
        return
      }
      // Keep last known actions while next project loads or transient fetch fails.
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [stableProjectRef])

  const normalizedDirectory = React.useMemo(() => {
    return normalizeProjectActionDirectory(directory || stableProjectRef?.path || "")
  }, [directory, stableProjectRef?.path])

  const selectedAction = React.useMemo(() => {
    if (!selectedActionId) {
      return null
    }
    return actions.find((entry) => entry.id === selectedActionId) ?? null
  }, [actions, selectedActionId])

  const autoDiscoverAction = React.useMemo<OpenChamberProjectAction>(
    () => ({
      id: AUTO_DISCOVER_ACTION_ID,
      name: t("projectActions.actions.autoDiscover"),
      command: "",
      icon: "search",
      autoOpenUrl: true,
    }),
    [t],
  )

  const canUseAutoDiscover = !isMobile
  const displayActions = React.useMemo(
    () => (canUseAutoDiscover ? [autoDiscoverAction, ...actions] : actions),
    [actions, autoDiscoverAction, canUseAutoDiscover],
  )

  React.useEffect(() => {
    setStreamlitDialog(null)
    void loadActions()
  }, [loadActions])

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const handler = (event: Event) => {
      if (!projectId) {
        return
      }
      if (!projectScopedEventMatchesProject(event, projectId)) {
        return
      }
      void loadActions()
    }

    window.addEventListener(PROJECT_ACTIONS_UPDATED_EVENT, handler)
    return () => {
      window.removeEventListener(PROJECT_ACTIONS_UPDATED_EVENT, handler)
    }
  }, [loadActions, projectId])

  React.useEffect(() => {
    return () => {
      // The terminal streams and the preview waits belong to this button, so they are released on
      // unmount exactly as they are at the end of a run: a stream left behind keeps the shared
      // socket delivering into a component that is gone.
      for (const cleanup of Object.values(streamCleanupByRunKeyRef.current)) {
        cleanup()
      }
      streamCleanupByRunKeyRef.current = {}
      for (const timer of Object.values(previewWaitTimeoutByRunKeyRef.current)) {
        window.clearTimeout(timer)
      }
      previewWaitTimeoutByRunKeyRef.current = {}
    }
  }, [])

  React.useEffect(() => {
    if (!selectedActionId) {
      return
    }
    if (selectedActionId === AUTO_DISCOVER_ACTION_ID && canUseAutoDiscover) {
      return
    }
    if (!actions.some((entry) => entry.id === selectedActionId)) {
      setSelectedActionId(null)
    }
  }, [actions, canUseAutoDiscover, selectedActionId])

  React.useEffect(() => {
    for (const [key, entry] of Object.entries(projectActionRuns)) {
      const directoryState = terminalSessions.get(entry.directory)
      const tab = directoryState?.tabs.find((item) => item.id === entry.tabId)
      if (!tab || tab.terminalSessionId !== entry.sessionId) {
        removeProjectActionRun(key)
      }
    }
  }, [projectActionRuns, removeProjectActionRun, terminalSessions])

  React.useEffect(() => {
    for (const [runKey, entry] of Object.entries(projectActionRuns)) {
      if (entry.directory !== normalizedDirectory || entry.status === "stopping") continue
      let action = entry.action ?? displayActions.find((item) => item.id === entry.actionId)
      if (!action) continue
      const watch = urlWatchByRunKeyRef.current[runKey] ?? {
        lastSeenChunkId: null,
        // A remounted launcher did not initiate this run; do not reopen a preview the user left.
        openedUrl: action.waitForUrl === true,
        tail: "",
        openInPreview: false,
      }
      urlWatchByRunKeyRef.current[runKey] = watch

      const directoryState = terminalSessions.get(entry.directory)
      const tab = directoryState?.tabs.find((item) => item.id === entry.tabId)
      if (!tab || !Array.isArray(tab.bufferChunks) || tab.bufferChunks.length === 0) {
        continue
      }

      const nextChunks = tab.bufferChunks.filter((chunk) => {
        if (watch.lastSeenChunkId === null) {
          return true
        }
        return chunk.id > watch.lastSeenChunkId
      })

      if (nextChunks.length === 0) {
        continue
      }

      const combined = nextChunks.map((chunk) => chunk.data).join("")
      const textForScan = `${watch.tail}${combined}`
      if (entry.token) {
        for (const progress of streamlitProgress(textForScan, entry.token)) {
          const current = useTerminalStore.getState().projectActionRuns[runKey]
          if (!current || current.token !== entry.token || current.status === "stopping") continue
          if (progress.stage === "launching") {
            action = { ...action, openUrl: progress.url }
            setProjectActionRun({ ...current, action, progress, status: "waiting-for-preview" })
            window.clearTimeout(previewWaitTimeoutByRunKeyRef.current[runKey])
            previewWaitTimeoutByRunKeyRef.current[runKey] = window.setTimeout(() => {
              const live = useTerminalStore.getState().projectActionRuns[runKey]
              if (live?.token === entry.token && live.status === "waiting-for-preview")
                updateProjectActionRunStatus(runKey, "preview-unavailable")
            }, AUTO_DISCOVER_PREVIEW_WAIT_TIMEOUT_MS)
          } else {
            const status =
              progress.stage === "setup-required" || progress.stage === "failed" ? progress.stage : "preparing"
            setProjectActionRun({ ...current, progress, status })
            if (status === "setup-required" || status === "failed") {
              window.clearTimeout(previewWaitTimeoutByRunKeyRef.current[runKey])
              setStreamlitDialog(action)
            }
          }
        }
      }
      const maybeUrl =
        action.autoOpenUrl === true &&
        (!watch.openedUrl ||
          (action.waitForUrl && ["preparing", "waiting-for-preview", "preview-unavailable"].includes(entry.status)))
          ? action.waitForUrl
            ? readyProjectActionUrl(textForScan, action.openUrl || "")
            : extractBestUrl(textForScan)
          : null
      const lastChunkId = nextChunks[nextChunks.length - 1]?.id ?? watch.lastSeenChunkId

      watch.lastSeenChunkId = lastChunkId
      watch.tail = entry.token
        ? textForScan.slice(textForScan.lastIndexOf("\n") + 1).slice(-4096)
        : textForScan.slice(-512)

      if (maybeUrl) {
        const run = useTerminalStore.getState().projectActionRuns[runKey]
        // Readiness belongs to the run even when a remounted launcher must not navigate.
        if (run && (watch.openInPreview || action.waitForUrl)) {
          setTabPreviewUrl(run.directory, run.tabId, maybeUrl, { locked: false, autoOpened: false })
          if (run.status === "waiting-for-preview" || run.status === "preview-unavailable") {
            updateProjectActionRunStatus(runKey, "running")
          }
          window.clearTimeout(previewWaitTimeoutByRunKeyRef.current[runKey])
          delete previewWaitTimeoutByRunKeyRef.current[runKey]
        }
        if (!watch.openedUrl) {
          watch.openedUrl = true
          if (watch.openInPreview) {
            if (run) openContextPreview(run.directory, maybeUrl)
          } else {
            void openExternal(maybeUrl)
            toast.success(t("projectActions.toast.openedUrlFromOutput"))
          }
        }
      }
      urlWatchByRunKeyRef.current[runKey] = watch
    }

    for (const runKey of Object.keys(urlWatchByRunKeyRef.current)) {
      if (!projectActionRuns[runKey]) {
        delete urlWatchByRunKeyRef.current[runKey]
        window.clearTimeout(previewWaitTimeoutByRunKeyRef.current[runKey])
        delete previewWaitTimeoutByRunKeyRef.current[runKey]
      }
    }
  }, [
    displayActions,
    normalizedDirectory,
    openContextPreview,
    openExternal,
    projectActionRuns,
    setTabPreviewUrl,
    setProjectActionRun,
    t,
    terminalSessions,
    updateProjectActionRunStatus,
  ])

  const getOrCreateActionTab = React.useCallback(
    async (action: OpenChamberProjectAction, options: { revealTerminal?: boolean } = {}) => {
      if (!normalizedDirectory) {
        throw new Error(t("projectActions.error.noActiveDirectory"))
      }

      const key = toProjectActionRunKey(normalizedDirectory, action.id)
      ensureDirectory(normalizedDirectory)

      const currentStore = useTerminalStore.getState()
      const existingDirectoryState = currentStore.getDirectoryState(normalizedDirectory)

      let tabId = tabByKeyRef.current[key] || null
      const hasTab = tabId ? Boolean(existingDirectoryState?.tabs.some((entry) => entry.id === tabId)) : false

      if (!tabId || !hasTab) {
        tabId = currentStore.createTab(normalizedDirectory)
        tabByKeyRef.current[key] = tabId
      }

      setTabLabel(normalizedDirectory, tabId, `Action: ${action.name}`)
      setTabIconKey(normalizedDirectory, tabId, action.icon || "play")
      if (options.revealTerminal !== false) {
        setActiveTab(normalizedDirectory, tabId)
        setBottomTerminalOpen(true)
        setActiveMainTab("terminal")
      }

      const stateAfterTab = useTerminalStore.getState().getDirectoryState(normalizedDirectory)
      const tab = stateAfterTab?.tabs.find((entry) => entry.id === tabId)
      return {
        key,
        tabId,
        sessionId: tab?.terminalSessionId ?? null,
      }
    },
    [
      ensureDirectory,
      normalizedDirectory,
      setActiveMainTab,
      setActiveTab,
      setBottomTerminalOpen,
      setTabIconKey,
      setTabLabel,
      t,
    ],
  )

  const runAction = React.useCallback(
    async (action: OpenChamberProjectAction, setup = false, requestIsCurrent?: () => boolean) => {
      if (requestIsCurrent && !requestIsCurrent()) return
      if (!allowMobile && isMobile) {
        return
      }

      if (!normalizedDirectory) {
        toast.error(t("projectActions.error.noActiveDirectoryForAction"))
        return
      }

      let runKey = toProjectActionRunKey(normalizedDirectory, action.id)
      const initialRunKey = runKey
      const existingRun = useTerminalStore.getState().projectActionRuns[runKey]
      if (existingRun && !["failed", "setup-required"].includes(existingRun.status)) {
        return
      }
      // The store only learns about the run at the end of this function's await chain, so the
      // snapshot above is empty for every click until then: two clicks sent the command into the
      // same shell twice (dev servers then failed on a taken port). The ref is set synchronously.
      if (startingRunKeysRef.current.has(runKey)) {
        return
      }
      startingRunKeysRef.current.add(runKey)
      const claimedRunKeys = [runKey]
      let acquiredTerminal: { tabId: string; sessionId: string } | undefined

      try {
        let discovered =
          action.id === AUTO_DISCOVER_ACTION_ID
            ? await (async (): Promise<OpenChamberProjectAction | null> => {
                const [actionsState, scripts] = await Promise.all([
                  getProjectActionsState({ id: stableProjectRef?.id ?? "", path: normalizedDirectory }),
                  readPackageJsonScripts(normalizedDirectory),
                ])
                const devServer = await detectDevServerCommand(normalizedDirectory, actionsState.actions, scripts)
                if (!devServer) {
                  if ((await detectStreamlitEntrypoints(normalizedDirectory)).length > 1) return null
                  throw new Error(t("contextPanel.preview.noDevServer"))
                }
                if (devServer.action) return devServer.action
                return {
                  id: AUTO_DISCOVER_ACTION_ID,
                  name: t("projectActions.actions.autoDiscover"),
                  command: devServer.command,
                  icon: "search",
                  autoOpenUrl: true,
                  openUrl: devServer.previewUrlHint || "",
                }
              })()
            : action

        if (!discovered) {
          setStreamlitDialog(true)
          return
        }
        if (discovered.streamlit && stableProjectRef) {
          const saved = await getProjectActionsState(stableProjectRef)
          if (requestIsCurrent && !requestIsCurrent()) return
          const entrypoint = discovered.streamlit.entrypoint
          const sameApp = saved.actions.find((item) => item.streamlit?.entrypoint === entrypoint)
          if (sameApp) discovered = { ...discovered, id: sameApp.id, name: sameApp.name }
        }
        runKey = toProjectActionRunKey(normalizedDirectory, discovered.id)
        if (runKey !== initialRunKey) {
          const live = useTerminalStore.getState().projectActionRuns[runKey]
          if (startingRunKeysRef.current.has(runKey) || (live && !["failed", "setup-required"].includes(live.status)))
            return
          startingRunKeysRef.current.add(runKey)
          claimedRunKeys.push(runKey)
        }
        if (discovered.streamlit && stableProjectRef) {
          const saved = await getProjectActionsState(stableProjectRef)
          if (requestIsCurrent && !requestIsCurrent()) return
          const next = [...saved.actions.filter((item) => item.id !== discovered.id), discovered]
          if (!(await saveProjectActionsState(stableProjectRef, { actions: next, primaryActionId: discovered.id }))) {
            throw new Error(t("settings.projects.actions.toast.saveFailed"))
          }
          if (
            normalizeProjectActionDirectory(currentDirectoryRef.current) !== normalizedDirectory ||
            !mountedRef.current ||
            (requestIsCurrent && !requestIsCurrent())
          )
            return
          setActions(next)
          setSelectedActionId(discovered.id)
          window.dispatchEvent(
            new CustomEvent(PROJECT_ACTIONS_UPDATED_EVENT, {
              detail: { projectId: stableProjectRef.id, projectPath: stableProjectRef.path },
            }),
          )
        } else if (action.id === AUTO_DISCOVER_ACTION_ID && discovered.id !== action.id) {
          setSelectedActionId(discovered.id)
        }
        const token = discovered.streamlit ? crypto.randomUUID() : undefined
        const hasCustomOpenUrl = discovered.autoOpenUrl === true && (discovered.openUrl || "").trim().length > 0
        const { key, tabId, sessionId } = await getOrCreateActionTab(discovered, {
          revealTerminal: !hasCustomOpenUrl && action.id !== AUTO_DISCOVER_ACTION_ID,
        })
        let activeSessionId = sessionId
        let createdSession = false

        if (!activeSessionId) {
          setConnecting(normalizedDirectory, tabId, true)
          try {
            activeSessionId = await ensureClaimedTerminalSession(normalizedDirectory, tabId, {
              getClaimedSessionId: () =>
                useTerminalStore
                  .getState()
                  .getDirectoryState(normalizedDirectory)
                  ?.tabs.find((entry) => entry.id === tabId)?.terminalSessionId ?? null,
              createSession: async () => {
                const created = await terminal.createSession({ cwd: normalizedDirectory })
                return created.sessionId
              },
              claimSession: (sessionId) => {
                setTabSessionId(normalizedDirectory, tabId, sessionId)
                return (
                  useTerminalStore
                    .getState()
                    .getDirectoryState(normalizedDirectory)
                    ?.tabs.find((entry) => entry.id === tabId)?.terminalSessionId === sessionId
                )
              },
              closeSession: terminal.close,
            })
            createdSession = Boolean(activeSessionId)
          } finally {
            setConnecting(normalizedDirectory, tabId, false)
          }
        }

        if (!activeSessionId) {
          throw new Error(t("projectActions.error.failedToCreateTerminalSession"))
        }
        const runningSessionId = activeSessionId
        acquiredTerminal = { tabId, sessionId: runningSessionId }
        const isCurrentTerminal = () =>
          useTerminalStore
            .getState()
            .getDirectoryState(normalizedDirectory)
            ?.tabs.find((entry) => entry.id === tabId)?.terminalSessionId === runningSessionId

        if (createdSession) {
          await sleep(350)
        }
        if (!isCurrentTerminal()) throw new Error(t("projectActions.error.failedToRunAction"))

        if (
          discovered.id === AUTO_DISCOVER_ACTION_ID ||
          (discovered.autoOpenUrl === true && discovered.waitForUrl === true)
        ) {
          streamCleanupByRunKeyRef.current[key]?.()
          setConnecting(normalizedDirectory, tabId, true)
          streamCleanupByRunKeyRef.current[key] = connectTerminalStream(
            runningSessionId,
            (event) => {
              if (!isCurrentTerminal()) return
              if (event.type === "connected") {
                setConnecting(normalizedDirectory, tabId, false)
              }
              if (event.type === "data" && typeof event.data === "string" && event.data.length > 0) {
                useTerminalStore.getState().appendToBuffer(normalizedDirectory, tabId, event.data, {
                  expectedSessionId: runningSessionId,
                })
              }
              if (event.type === "exit") {
                useTerminalStore.getState().setTabSessionId(normalizedDirectory, tabId, null, {
                  lifecycle: "exited",
                  expectedSessionId: runningSessionId,
                })
                useTerminalStore.getState().setConnecting(normalizedDirectory, tabId, false)
                useTerminalStore.getState().removeProjectActionRun(key)
                delete urlWatchByRunKeyRef.current[key]
                streamCleanupByRunKeyRef.current[key]?.()
                delete streamCleanupByRunKeyRef.current[key]
                window.clearTimeout(previewWaitTimeoutByRunKeyRef.current[key])
                delete previewWaitTimeoutByRunKeyRef.current[key]
              }
            },
            (_error, fatal) => {
              if (!isCurrentTerminal()) return
              useTerminalStore.getState().setConnecting(normalizedDirectory, tabId, false)
              if (!fatal) {
                return
              }
              useTerminalStore.getState().setTabSessionId(normalizedDirectory, tabId, null, {
                lifecycle: "exited",
                expectedSessionId: runningSessionId,
              })
              useTerminalStore.getState().removeProjectActionRun(key)
              delete urlWatchByRunKeyRef.current[key]
              streamCleanupByRunKeyRef.current[key]?.()
              delete streamCleanupByRunKeyRef.current[key]
              window.clearTimeout(previewWaitTimeoutByRunKeyRef.current[key])
              delete previewWaitTimeoutByRunKeyRef.current[key]
            },
            {
              maxRetries: 60,
              initialRetryDelay: 250,
              maxRetryDelay: 2000,
              connectionTimeout: 5000,
              consumerKey: terminalStreamConsumerKey(normalizedDirectory, tabId),
            },
          )
        }

        const manualOpenUrl = discovered.autoOpenUrl ? normalizeManualOpenUrl(discovered.openUrl) : null
        const waitForUrl =
          Boolean(discovered.streamlit) ||
          (discovered.autoOpenUrl === true && discovered.waitForUrl === true && Boolean(manualOpenUrl))
        if (discovered.shell === "posix") {
          const { shell } = await getTerminalSessionOutput(runningSessionId)
          if (!isSupportedRecipeShell(shell)) throw new Error(t("projectActions.error.unsupportedRecipeShell"))
        }
        if (!isCurrentTerminal()) throw new Error(t("projectActions.error.failedToRunAction"))

        setProjectActionRun({
          key,
          directory: normalizedDirectory,
          actionId: discovered.id,
          tabId,
          sessionId: runningSessionId,
          action: discovered,
          token,
          status: discovered.streamlit
            ? "preparing"
            : waitForUrl || (discovered.id === AUTO_DISCOVER_ACTION_ID && !manualOpenUrl)
              ? "waiting-for-preview"
              : "running",
        })
        window.clearTimeout(previewWaitTimeoutByRunKeyRef.current[key])
        delete previewWaitTimeoutByRunKeyRef.current[key]
        if (!discovered.streamlit && (waitForUrl || (discovered.id === AUTO_DISCOVER_ACTION_ID && !manualOpenUrl))) {
          previewWaitTimeoutByRunKeyRef.current[key] = window.setTimeout(() => {
            const current = useTerminalStore.getState().projectActionRuns[key]
            if (current?.sessionId === runningSessionId && current.status === "waiting-for-preview") {
              useTerminalStore
                .getState()
                .updateProjectActionRunStatus(key, waitForUrl ? "preview-unavailable" : "running")
              if (
                waitForUrl &&
                mountedRef.current &&
                normalizeProjectActionDirectory(currentDirectoryRef.current) === normalizedDirectory
              ) {
                toast.error(t("projectActions.preview.unavailable"))
              }
            }
            delete previewWaitTimeoutByRunKeyRef.current[key]
          }, AUTO_DISCOVER_PREVIEW_WAIT_TIMEOUT_MS)
        }

        // Ignore old terminal output when restarting a configured action.
        const previousChunks = useTerminalStore
          .getState()
          .getDirectoryState(normalizedDirectory)
          ?.tabs.find((tab) => tab.id === tabId)?.bufferChunks
        urlWatchByRunKeyRef.current[key] = {
          lastSeenChunkId: previousChunks?.[previousChunks.length - 1]?.id ?? null,
          openedUrl: waitForUrl ? false : Boolean(manualOpenUrl) || hasCustomOpenUrl,
          tail: "",
          openInPreview: waitForUrl || discovered.id === AUTO_DISCOVER_ACTION_ID,
        }
        setTabPreviewUrl(normalizedDirectory, tabId, null, { locked: hasCustomOpenUrl, autoOpened: false })

        const command =
          discovered.streamlit && token
            ? await streamlitRunCommand(discovered.streamlit, token, setup, normalizedDirectory)
            : discovered.command
        const normalizedCommand = stripControlChars(command.trim().replace(/\r\n|\r/g, "\n"))
        if (requestIsCurrent && !requestIsCurrent()) throw new Error(t("projectActions.error.failedToRunAction"))
        if (discovered.streamlit) {
          // Bound PTY input bursts so interactive shells can consume the command.
          const input = `${normalizedCommand}\r`
          for (let offset = 0; offset < input.length; offset += 512) {
            // The predicate is only checked before the loop otherwise: a session or
            // project switch mid-send would still finish an old request's command.
            if (requestIsCurrent && !requestIsCurrent()) throw STALE_ACTION_REQUEST_ERROR
            const live = useTerminalStore.getState().projectActionRuns[key]
            if (!isCurrentTerminal() || live?.token !== token || live.status === "stopping") return
            await terminal.sendInput(runningSessionId, input.slice(offset, offset + 512))
            await sleep(10)
          }
        } else {
          await terminal.sendInput(runningSessionId, `${normalizedCommand}\r`)
        }
        const currentRun = useTerminalStore.getState().projectActionRuns[key]
        if (
          currentRun?.sessionId === runningSessionId &&
          currentRun.status !== "stopping" &&
          mountedRef.current &&
          normalizeProjectActionDirectory(currentDirectoryRef.current) === normalizedDirectory
        ) {
          if (manualOpenUrl && !waitForUrl) {
            setTabPreviewUrl(normalizedDirectory, tabId, manualOpenUrl, { locked: true, autoOpened: true })
            openContextPreview(normalizedDirectory, manualOpenUrl)
            toast.success(t("projectActions.toast.openedActionUrl"))
          } else if (hasCustomOpenUrl && !manualOpenUrl) {
            toast.error(t("projectActions.error.invalidCustomUrlFormat"))
          }
        }
      } catch (error) {
        if (acquiredTerminal) {
          const { tabId, sessionId } = acquiredTerminal
          const tab = useTerminalStore
            .getState()
            .getDirectoryState(normalizedDirectory)
            ?.tabs.find((entry) => entry.id === tabId)
          if (tab?.terminalSessionId === sessionId) {
            setConnecting(normalizedDirectory, tabId, false)
          }
        }
        const failedRun = useTerminalStore.getState().projectActionRuns[runKey]
        if (!failedRun || failedRun.sessionId === acquiredTerminal?.sessionId) removeProjectActionRun(runKey)
        delete urlWatchByRunKeyRef.current[runKey]
        streamCleanupByRunKeyRef.current[runKey]?.()
        delete streamCleanupByRunKeyRef.current[runKey]
        window.clearTimeout(previewWaitTimeoutByRunKeyRef.current[runKey])
        delete previewWaitTimeoutByRunKeyRef.current[runKey]
        // A stale request aborts silently: the user moved on, so there is no
        // failure to report. The dropped run record must still be cleaned up.
        if (error === STALE_ACTION_REQUEST_ERROR) {
          return false
        }
        toast.error(error instanceof Error ? error.message : t("projectActions.error.failedToRunAction"))
        return false
      } finally {
        // The run is in the store from here on, so the snapshot guard can see it again.
        for (const claimed of claimedRunKeys) startingRunKeysRef.current.delete(claimed)
      }
    },
    [
      getOrCreateActionTab,
      allowMobile,
      isMobile,
      normalizedDirectory,
      openContextPreview,
      removeProjectActionRun,
      setConnecting,
      setProjectActionRun,
      setTabPreviewUrl,
      setTabSessionId,
      stableProjectRef,
      t,
      terminal,
    ],
  )

  React.useEffect(() => {
    if (!stableProjectRef || (!allowMobile && isMobile)) return
    const handleRequest = (event: Event) => {
      const request = claimAnalysisAppRun(event, useSessionUIStore.getState().currentSessionId, normalizedDirectory)
      if (!request) return
      const stillCurrent = () =>
        mountedRef.current &&
        currentProjectIdRef.current === stableProjectRef.id &&
        useSessionUIStore.getState().currentSessionId === request.sessionId &&
        normalizeProjectActionDirectory(currentDirectoryRef.current) === request.directory
      void (async () => {
        try {
          const saved = await getProjectActionsState(stableProjectRef)
          if (!stillCurrent()) return
          const entrypoint = request.artifact.entrypoint
          const action =
            saved.actions.find((item) => item.streamlit?.entrypoint === entrypoint) ??
            createManagedStreamlitAction(`streamlit-artifact:${entrypoint}`, entrypoint, { version: 1, entrypoint })
          const running =
            useTerminalStore.getState().projectActionRuns[toProjectActionRunKey(normalizedDirectory, action.id)]
          setSelectedActionId(action.id)
          if (running?.status === "failed" || running?.status === "setup-required") {
            setStreamlitDialog(running.action ?? action)
          } else if (running) {
            const url = useTerminalStore
              .getState()
              .getDirectoryState(normalizedDirectory)
              ?.tabs.find((tab) => tab.id === running.tabId)?.previewUrl
            if (url && running.status !== "stopping") openContextPreview(normalizedDirectory, url)
          } else {
            await runAction(action, false, stillCurrent)
          }
        } catch (error) {
          if (stillCurrent())
            toast.error(error instanceof Error ? error.message : t("projectActions.error.failedToRunAction"))
        }
      })()
    }
    window.addEventListener(ANALYSIS_APP_RUN_EVENT, handleRequest)
    return () => {
      window.removeEventListener(ANALYSIS_APP_RUN_EVENT, handleRequest)
    }
  }, [stableProjectRef, allowMobile, isMobile, normalizedDirectory, runAction, openContextPreview, t])

  const stopAction = React.useCallback(
    async (action: OpenChamberProjectAction) => {
      const runKey = toProjectActionRunKey(normalizedDirectory, action.id)
      const activeRun = projectActionRuns[runKey]
      if (!activeRun) {
        return
      }

      updateProjectActionRunStatus(runKey, "stopping")

      try {
        await terminal.sendInput(activeRun.sessionId, "\x03")
      } catch {
        // noop
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 1000)
      })

      const afterTab = useTerminalStore
        .getState()
        .getDirectoryState(activeRun.directory)
        ?.tabs.find((entry) => entry.id === activeRun.tabId)

      const sessionStillSame = afterTab?.terminalSessionId === activeRun.sessionId

      if (sessionStillSame) {
        if (typeof terminal.forceKill === "function") {
          try {
            await terminal.forceKill({ sessionId: activeRun.sessionId })
          } catch {
            // noop
          }
        } else {
          try {
            await terminal.close(activeRun.sessionId)
          } catch {
            // noop
          }
        }
        setTabSessionId(activeRun.directory, activeRun.tabId, null, {
          lifecycle: "exited",
          expectedSessionId: activeRun.sessionId,
        })
      }

      removeProjectActionRun(runKey)
      delete urlWatchByRunKeyRef.current[runKey]
      streamCleanupByRunKeyRef.current[runKey]?.()
      delete streamCleanupByRunKeyRef.current[runKey]
      window.clearTimeout(previewWaitTimeoutByRunKeyRef.current[runKey])
      delete previewWaitTimeoutByRunKeyRef.current[runKey]
    },
    [
      normalizedDirectory,
      projectActionRuns,
      removeProjectActionRun,
      setTabSessionId,
      terminal,
      updateProjectActionRunStatus,
    ],
  )

  const handlePrimaryClick = React.useCallback(() => {
    const action = selectedAction ?? displayActions[0]
    if (!action) {
      return
    }
    const runKey = toProjectActionRunKey(normalizedDirectory, action.id)
    const runningEntry = projectActionRuns[runKey]
    if (runningEntry?.status === "stopping") {
      return
    }
    if (runningEntry?.status === "setup-required" || runningEntry?.status === "failed") {
      setStreamlitDialog(runningEntry.action ?? action)
      return
    }
    if (action.streamlit && runningEntry?.status === "running") {
      const url = useTerminalStore
        .getState()
        .getDirectoryState(normalizedDirectory)
        ?.tabs.find((tab) => tab.id === runningEntry.tabId)?.previewUrl
      if (url) openContextPreview(normalizedDirectory, url)
      return
    }
    if (runningEntry) {
      void stopAction(action)
      return
    }
    void runAction(action)
  }, [
    displayActions,
    normalizedDirectory,
    runAction,
    projectActionRuns,
    selectedAction,
    stopAction,
    openContextPreview,
  ])

  const handleSelectAction = React.useCallback(
    (action: OpenChamberProjectAction, toggleStopIfRunning = false) => {
      setSelectedActionId(action.id)

      if (!toggleStopIfRunning) {
        void runAction(action)
        return
      }

      const runKey = toProjectActionRunKey(normalizedDirectory, action.id)
      const runningEntry = projectActionRuns[runKey]
      if (runningEntry?.status === "stopping") {
        return
      }
      if (runningEntry?.status === "setup-required" || runningEntry?.status === "failed") {
        setStreamlitDialog(runningEntry.action ?? action)
        return
      }
      if (runningEntry) {
        void stopAction(action)
        return
      }
      void runAction(action)
    },
    [normalizedDirectory, runAction, projectActionRuns, stopAction],
  )

  const openProjectActionsSettings = React.useCallback(() => {
    if (!stableProjectRef?.id) {
      return
    }
    setSettingsProjectsSelectedId(stableProjectRef.id)
    setSettingsPage("projects")
    setSettingsDialogOpen(true)
  }, [setSettingsDialogOpen, setSettingsPage, setSettingsProjectsSelectedId, stableProjectRef?.id])

  if ((!allowMobile && isMobile) || !stableProjectRef || !normalizedDirectory) {
    return null
  }

  const resolvedSelected = selectedAction ?? displayActions[0] ?? null
  if (!resolvedSelected) {
    return null
  }

  const selectedIconKey = (resolvedSelected.icon || "play") as keyof typeof PROJECT_ACTION_ICON_MAP
  const selectedIconName =
    resolvedSelected.id === AUTO_DISCOVER_ACTION_ID ? "search" : PROJECT_ACTION_ICON_MAP[selectedIconKey] || "play"
  const selectedRunKey = toProjectActionRunKey(normalizedDirectory, resolvedSelected.id)
  const selectedRunning = projectActionRuns[selectedRunKey]
  const recoverable = selectedRunning?.status === "setup-required" || selectedRunning?.status === "failed"
  const managedReady = Boolean(resolvedSelected.streamlit && selectedRunning?.status === "running")
  const isStoppingSelected = selectedRunning?.status === "stopping"
  const isWaitingForSelectedPreview = selectedRunning?.status === "waiting-for-preview"
  const previewUnavailable = selectedRunning?.status === "preview-unavailable"
  const previewStatus =
    selectedRunning?.status === "preparing"
      ? t("projectActions.streamlit.preparing")
      : previewUnavailable
        ? t("projectActions.preview.unavailable")
        : isWaitingForSelectedPreview
          ? t("projectActions.preview.waiting")
          : undefined
  const selectedRunPreviewUrl = selectedRunning
    ? (terminalSessions.get(selectedRunning.directory)?.tabs.find((tab) => tab.id === selectedRunning.tabId)
        ?.previewUrl ?? null)
    : null
  const showSelectedPreviewButton = Boolean(selectedRunning && selectedRunPreviewUrl)
  const handleOpenSelectedPreview = () => {
    if (!selectedRunning || !selectedRunPreviewUrl) {
      return
    }
    openContextPreview(selectedRunning.directory, selectedRunPreviewUrl)
  }

  const dialogAction = streamlitDialog === true ? undefined : (streamlitDialog ?? undefined)
  const dialogRun = dialogAction
    ? projectActionRuns[toProjectActionRunKey(normalizedDirectory, dialogAction.id)]
    : undefined
  const streamlitDialogContent = streamlitDialog ? (
    <StreamlitRunDialog
      key={normalizedDirectory + (dialogAction?.id ?? "new")}
      directory={normalizedDirectory}
      action={dialogAction}
      progress={dialogRun?.progress}
      onClose={() => setStreamlitDialog((current) => (current === streamlitDialog ? null : current))}
      onRun={runAction}
    />
  ) : null
  const streamlitMenuItem = (
    <DropdownMenuItem onClick={() => setStreamlitDialog(true)}>
      <Icon name="server" className="mr-2 h-4 w-4" />
      {t("projectActions.streamlit.run")}
    </DropdownMenuItem>
  )
  const primaryLabel = managedReady
    ? t("projectActions.actions.openPreview")
    : selectedRunning && !recoverable
      ? t("projectActions.actions.stopNamedAria", { name: resolvedSelected.name })
      : t("projectActions.actions.runNamedAria", { name: resolvedSelected.name })
  const managedStop = managedReady ? (
    <button
      type="button"
      className="px-2"
      aria-label={t("projectActions.actions.stopNamedAria", { name: resolvedSelected.name })}
      onClick={() => void stopAction(resolvedSelected)}
    >
      <Icon name="stop" className="h-4 w-4" />
    </button>
  ) : null

  if (compact) {
    return (
      <div className="inline-flex items-center">
        {streamlitDialogContent}
        {managedStop}
        <button
          type="button"
          disabled={isLoading || isStoppingSelected}
          className={cn(
            "app-region-no-drag inline-flex h-9 w-9 items-center justify-center rounded-[10px] squircle p-2",
            "typography-ui-label font-medium text-muted-foreground hover:bg-interactive-hover hover:text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            "disabled:cursor-not-allowed",
            className,
          )}
          onClick={handlePrimaryClick}
          title={previewStatus}
          aria-description={previewStatus}
          aria-label={primaryLabel}
        >
          {managedReady ? (
            <Icon name="global" className="h-4 w-4" />
          ) : previewUnavailable || recoverable ? (
            <Icon name="error-warning" className="h-4 w-4 text-[var(--status-warning)]" />
          ) : isStoppingSelected || isWaitingForSelectedPreview || selectedRunning?.status === "preparing" ? (
            <Icon name="loader-4" className="h-5 w-5 animate-spin text-[var(--status-warning)]" />
          ) : selectedRunning ? (
            <Icon name="stop" className="h-5 w-5 text-[var(--status-warning)]" />
          ) : (
            <Icon name={selectedIconName} className="h-5 w-5" />
          )}
        </button>
        {showSelectedPreviewButton ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="app-region-no-drag -ml-1 inline-flex h-9 w-7 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={t("projectActions.actions.openPreview")}
                onClick={handleOpenSelectedPreview}
              >
                <Icon name="global" className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>{t("projectActions.actions.openPreview")}</TooltipContent>
          </Tooltip>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="app-region-no-drag -ml-1 inline-flex h-9 w-5 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={t("projectActions.actions.chooseActionAria")}
            >
              <Icon name="arrow-down-s" className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 max-h-[70vh] overflow-y-auto">
            <DropdownMenuItem className="flex items-center gap-2" onClick={openProjectActionsSettings}>
              <Icon name="add" className="h-4 w-4" />
              <span className="typography-ui-label text-foreground">{t("projectActions.actions.addNewAction")}</span>
            </DropdownMenuItem>
            {streamlitMenuItem}
            <DropdownMenuSeparator />
            {displayActions.map((entry) => {
              const iconKey = (entry.icon || "play") as keyof typeof PROJECT_ACTION_ICON_MAP
              const iconName =
                entry.id === AUTO_DISCOVER_ACTION_ID ? "search" : PROJECT_ACTION_ICON_MAP[iconKey] || "play"
              const runKey = toProjectActionRunKey(normalizedDirectory, entry.id)
              const runState = projectActionRuns[runKey]
              const isRunning = Boolean(runState)
              const isStopping = runState?.status === "stopping"

              return (
                <DropdownMenuItem
                  key={entry.id}
                  className="flex items-center gap-2"
                  onClick={() => {
                    handleSelectAction(entry, true)
                  }}
                >
                  <Icon name={iconName} className="h-4 w-4" />
                  <span className="typography-ui-label text-foreground truncate">{entry.name}</span>
                  {isStopping || runState?.status === "waiting-for-preview" ? (
                    <Icon name="loader-4" className="ml-auto h-4 w-4 animate-spin text-[var(--status-warning)]" />
                  ) : isRunning ? (
                    <Icon name="stop" className="ml-auto h-4 w-4 text-[var(--status-warning)]" />
                  ) : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "app-region-no-drag inline-flex shrink-0 items-center self-center rounded-[9px] squircle",
        "bg-[var(--surface-elevated)] overflow-hidden",
        "border border-border/60",
        "h-7",
        className,
      )}
    >
      {streamlitDialogContent}
      {managedStop}
      <button
        type="button"
        onClick={handlePrimaryClick}
        title={previewStatus}
        aria-description={previewStatus}
        disabled={isLoading || isStoppingSelected}
        className={cn(
          "inline-flex h-full items-center justify-center typography-ui-label font-medium text-foreground hover:bg-interactive-hover",
          "px-2.5",
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed",
        )}
        aria-label={primaryLabel}
      >
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
          {managedReady ? (
            <Icon name="global" className="h-4 w-4" />
          ) : previewUnavailable || recoverable ? (
            <Icon name="error-warning" className="h-4 w-4 text-[var(--status-warning)]" />
          ) : isStoppingSelected || isWaitingForSelectedPreview || selectedRunning?.status === "preparing" ? (
            <Icon name="loader-4" className="h-4 w-4 animate-spin text-[var(--status-warning)]" />
          ) : selectedRunning ? (
            <Icon name="stop" className="h-4 w-4 text-[var(--status-warning)]" />
          ) : (
            <Icon name={selectedIconName} className="h-4 w-4" />
          )}
        </span>
      </button>

      {showSelectedPreviewButton ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleOpenSelectedPreview}
              className={cn(
                "inline-flex h-full w-7 items-center justify-center",
                "border-l border-[var(--interactive-border)] text-foreground",
                "hover:bg-interactive-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              )}
              aria-label={t("projectActions.actions.openPreview")}
            >
              <Icon name="global" className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent sideOffset={6}>{t("projectActions.actions.openPreview")}</TooltipContent>
        </Tooltip>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-full w-7 items-center justify-center",
              "border-l border-[var(--interactive-border)] text-muted-foreground",
              "hover:bg-interactive-hover hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
            aria-label={t("projectActions.actions.chooseActionAria")}
          >
            <Icon name="arrow-down-s" className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52 max-h-[70vh] overflow-y-auto">
          <DropdownMenuItem className="flex items-center gap-2" onClick={openProjectActionsSettings}>
            <Icon name="add" className="h-4 w-4" />
            <span className="typography-ui-label text-foreground">{t("projectActions.actions.addNewAction")}</span>
          </DropdownMenuItem>
          {streamlitMenuItem}
          <DropdownMenuSeparator />
          {displayActions.map((entry) => {
            const iconKey = (entry.icon || "play") as keyof typeof PROJECT_ACTION_ICON_MAP
            const iconName =
              entry.id === AUTO_DISCOVER_ACTION_ID ? "search" : PROJECT_ACTION_ICON_MAP[iconKey] || "play"
            const runKey = toProjectActionRunKey(normalizedDirectory, entry.id)
            const runState = projectActionRuns[runKey]
            const isRunning = Boolean(runState)
            const isStopping = runState?.status === "stopping"

            return (
              <DropdownMenuItem
                key={entry.id}
                className="flex items-center gap-2"
                onClick={() => {
                  handleSelectAction(entry, true)
                }}
              >
                <Icon name={iconName} className="h-4 w-4" />
                <span className="typography-ui-label text-foreground truncate">{entry.name}</span>
                {isStopping || runState?.status === "waiting-for-preview" ? (
                  <Icon name="loader-4" className="ml-auto h-4 w-4 animate-spin text-[var(--status-warning)]" />
                ) : isRunning ? (
                  <Icon name="stop" className="ml-auto h-4 w-4 text-[var(--status-warning)]" />
                ) : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
