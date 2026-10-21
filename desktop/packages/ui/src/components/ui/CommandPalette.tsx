import { useMissionControlPullRequests } from "@/hooks/useMissionControlPullRequests"
import { axCodeClient } from "@/lib/ax-code/client"
import { missionProjectKey } from "@/lib/supervision/missionControl"
import { openSessionGrid } from "@/lib/supervision/openSessionGrid"
import { resolveGridSession } from "@/lib/supervision/sessionGrid"
import React from "react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useUIStore } from "@/stores/useUIStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useGlobalSessionsStore, resolveGlobalSessionDirectory } from "@/stores/useGlobalSessionsStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useGitAllBranches, useGitStore } from "@/stores/useGitStore"
import { useFileSearchStore } from "@/stores/useFileSearchStore"
import { useDeviceInfo } from "@/lib/device"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { useEffectiveDirectory } from "@/hooks/useEffectiveDirectory"
import { useRuntimeAPIs } from "@/hooks/useRuntimeAPIs"
import { getContextFileOpenFailureMessage, validateContextFileOpen } from "@/lib/contextFileOpenGuard"
import { toast } from "@/components/ui"
import { FileTypeIcon } from "@/components/icons/FileTypeIcon"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { createWorktreeSession } from "@/lib/worktreeSessionCreator"
import { formatShortcutForDisplay, getEffectiveShortcutCombo } from "@/lib/shortcuts"
import { canUseLocalElectronDesktopIPC, invokeDesktop, isDesktopShell, isWebRuntime } from "@/lib/desktop"
import { SETTINGS_PAGE_METADATA, type SettingsRuntimeContext } from "@/lib/settings/metadata"
import { getSettingsNavIcon } from "@/lib/settings/navIcons"
import { Icon } from "@/components/icon/Icon"
import { scoreByFuzzyQuery } from "@/lib/search/fuzzySearch"
import { truncatePathMiddle } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { sessionEvents } from "@/lib/sessionEvents"
import { openProjectFolder } from "@/lib/projectOpen"
import { useOpenProjectBrowser } from "@/hooks/useWebMcpBrowser"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useThemeSystem } from "@/contexts/useThemeSystem"
import type { ThemeMode } from "@/types/theme"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useSupervisionRows } from "@/hooks/useSupervisionRows"
import { SupervisionStateBadge } from "@/components/supervision/SupervisionStateBadge"
import { paletteHasNeedsYou, rankPaletteSessions } from "@/lib/supervision/paletteRanking"
import { canOpenSessionWindow, openSessionWindow } from "@/lib/supervision/openSessionWindow"
import { nextNeedsHumanSession } from "@/lib/supervision/sessionState"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { openBesideChat } from "@/lib/supervision/openBesideChat"
import { supervisionPopoutPaletteEntry } from "@/lib/supervision/popout"

type CommandEntry = {
  id: string
  title: string
  icon: React.ReactNode
  shortcutId?: string
  searchText: string
  onSelect: () => void
}

type FileHit = { path: string; name: string; relativePath: string }

const normalizePath = (value: string): string => {
  if (!value) return ""
  const raw = value.replace(/\\/g, "/")
  const hadUncPrefix = raw.startsWith("//")
  let normalized = raw.replace(/\/+/g, "/")
  if (hadUncPrefix && !normalized.startsWith("//")) normalized = `/${normalized}`
  const isUnixRoot = normalized === "/"
  const isWindowsDriveRoot = /^[A-Za-z]:\/$/.test(normalized)
  if (!isUnixRoot && !isWindowsDriveRoot) normalized = normalized.replace(/\/+$/, "")
  return normalized
}

export const CommandPalette: React.FC = () => {
  const { t } = useI18n()
  const openProjectBrowser = useOpenProjectBrowser()

  const isCommandPaletteOpen = useUIStore((s) => s.isCommandPaletteOpen)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const isSearchMode = useUIStore((s) => s.isCommandPaletteSearchMode)
  const setCommandPaletteSearchMode = useUIStore((s) => s.setCommandPaletteSearchMode)
  const setActiveMainTab = useUIStore((s) => s.setActiveMainTab)
  const setSettingsDialogOpen = useUIStore((s) => s.setSettingsDialogOpen)
  const setSettingsPage = useUIStore((s) => s.setSettingsPage)
  const setSessionSwitcherOpen = useUIStore((s) => s.setSessionSwitcherOpen)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar)
  const toggleBottomTerminal = useUIStore((s) => s.toggleBottomTerminal)
  const setTimelineDialogOpen = useUIStore((s) => s.setTimelineDialogOpen)
  const setCrossSessionSearchOpen = useUIStore((s) => s.setCrossSessionSearchOpen)
  const openContextOverview = useUIStore((s) => s.openContextOverview)
  const openContextFile = useUIStore((s) => s.openContextFile)
  const shortcutOverrides = useUIStore((s) => s.shortcutOverrides)
  const { setThemeMode } = useThemeSystem()

  const openNewSessionDraft = useSessionUIStore((s) => s.openNewSessionDraft)
  const setCurrentSession = useSessionUIStore((s) => s.setCurrentSession)
  const currentSessionId = useSessionUIStore((s) => s.currentSessionId)
  const sourceRows = useSupervisionRows()
  const { rows: supervisionRows, setVisibleRows: setPrVisibleRows } = useMissionControlPullRequests(sourceRows)
  const projects = useProjectsStore((s) => s.projects)
  const setActiveProject = useProjectsStore((s) => s.setActiveProject)
  const toggleMissionControl = useSupervisionStore((s) => s.toggleMissionControl)
  const setQuickDispatchOpen = useSupervisionStore((s) => s.setQuickDispatchOpen)
  const setMissionControlOpen = useSupervisionStore((s) => s.setMissionControlOpen)
  const workingSets = useSupervisionStore((s) => s.workingSets)
  const setActiveWorkingSet = useSupervisionStore((s) => s.setActiveWorkingSet)

  const activeSessions = useGlobalSessionsStore((s) => s.activeSessions)
  const currentDirectory = useDirectoryStore((s) => s.currentDirectory)
  const activeProject = useProjectsStore((s) => s.getActiveProject())
  const effectiveDirectory = useEffectiveDirectory()
  const searchFiles = useFileSearchStore((s) => s.searchFiles)
  const { files: filesApi, git: gitApi } = useRuntimeAPIs()
  const ensureGitStatus = useGitStore((s) => s.ensureStatus)
  const { isMobile } = useDeviceInfo()

  const currentRoot = React.useMemo(
    () => (effectiveDirectory ? normalizePath(effectiveDirectory) : null),
    [effectiveDirectory],
  )

  const [query, setQuery] = React.useState("")
  const [scope, setScope] = React.useState("")
  const scopeRef = React.useRef<HTMLSelectElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const helpId = React.useId()
  // The global session index belongs to this window's connected host, never to every configured host.
  const host = new URL(axCodeClient.getBaseUrl(), window.location.href).host
  const scopeProjects = React.useMemo(
    () =>
      Array.from(
        new Map(
          supervisionRows.map((row) => [
            missionProjectKey(row),
            {
              key: missionProjectKey(row),
              label: row.projectLabel ?? row.directory ?? t("supervision.missionControl.noProject"),
            },
          ]),
        ).values(),
      ),
    [supervisionRows, t],
  )
  const debouncedQuery = useDebouncedValue(query, 200)
  const trimmedQuery = debouncedQuery.trim()
  const liveTrimmed = query.trim()

  // Clear query on open (not close) so content stays visible through the
  // close animation instead of emptying mid-flight.
  React.useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery("")
      setScope("")
    }
  }, [isCommandPaletteOpen])

  // Reset search mode when palette closes
  React.useEffect(() => {
    if (!isCommandPaletteOpen) setCommandPaletteSearchMode(false)
  }, [isCommandPaletteOpen, setCommandPaletteSearchMode])

  // Lazy-load git status for every session directory we plan to display so that
  // branch labels become available across all projects, not only the active one.
  // Deferred to idle to keep the first render (and the file-search effect) free
  // from a flood of git store updates.
  React.useEffect(() => {
    if (!isCommandPaletteOpen || !gitApi) return
    const handle = setTimeout(() => {
      const seen = new Set<string>()
      for (const session of activeSessions) {
        const dir = resolveGlobalSessionDirectory(session)
        if (!dir || seen.has(dir)) continue
        seen.add(dir)
        void ensureGitStatus(dir, gitApi)
      }
    }, 0)
    return () => clearTimeout(handle)
  }, [isCommandPaletteOpen, activeSessions, gitApi, ensureGitStatus])

  const close = React.useCallback(() => setCommandPaletteOpen(false), [setCommandPaletteOpen])
  const run = React.useCallback(
    (fn: () => void | Promise<void>) => () => {
      close()
      void fn()
    },
    [close],
  )

  // ---------------------------------------------------------------------------
  // Supervision commands
  // ---------------------------------------------------------------------------
  const supervisionCommands = React.useMemo<CommandEntry[]>(() => {
    const list: CommandEntry[] = [
      {
        id: "supervision:session-grid",
        title: t("sessionGrid.open"),
        icon: <Icon name="window" className="mr-2 h-4 w-4" />,
        searchText: "session grid panes side by side",
        onSelect: run(() => openSessionGrid()),
      },
      {
        id: "supervision:mission-control",
        title: t("supervision.commandPalette.missionControl"),
        icon: <Icon name="compass-3" className="mr-2 h-4 w-4" />,
        shortcutId: "open_mission_control",
        searchText: `${t("supervision.commandPalette.missionControl")} supervision mission control board`,
        onSelect: run(() => toggleMissionControl()),
      },
      {
        id: "supervision:next-needs-you",
        title: t("supervision.commandPalette.nextNeedsYou"),
        icon: <Icon name="arrow-right" className="mr-2 h-4 w-4" />,
        shortcutId: "next_needs_you",
        searchText: `${t("supervision.commandPalette.nextNeedsYou")} supervision next needs you`,
        onSelect: run(() => {
          const sessionId = nextNeedsHumanSession(supervisionRows, currentSessionId)
          if (!sessionId) return
          const row = supervisionRows.find((item) => item.sessionId === sessionId)
          openSupervisedSession({ sessionId, projectId: row?.projectId ?? null, directory: row?.directory ?? null })
        }),
      },
      {
        id: "supervision:quick-dispatch",
        title: t("supervision.commandPalette.quickDispatch"),
        icon: <Icon name="send-plane" className="mr-2 h-4 w-4" />,
        shortcutId: "open_quick_dispatch",
        searchText: `${t("supervision.commandPalette.quickDispatch")} supervision quick dispatch`,
        onSelect: run(() => setQuickDispatchOpen(true)),
      },
      ...(currentSessionId && canOpenSessionWindow()
        ? [
            {
              id: "supervision:open-in-window",
              title: t("supervision.navigation.openInWindow"),
              icon: <Icon name="window" className="mr-2 h-4 w-4" />,
              searchText: `${t("supervision.navigation.openInWindow")} session window side by side`,
              onSelect: run(() => {
                const row = supervisionRows.find((item) => item.sessionId === currentSessionId)
                void openSessionWindow(
                  { sessionId: currentSessionId, directory: row?.directory ?? null },
                  t("supervision.navigation.openInWindowFailed"),
                )
              }),
            },
          ]
        : []),
      {
        id: "supervision:review-changes",
        title: t("supervision.commandPalette.reviewChanges"),
        icon: <Icon name="git-commit" className="mr-2 h-4 w-4" />,
        searchText: `${t("supervision.commandPalette.reviewChanges")} supervision review changes diff`,
        onSelect: run(() => {
          openBesideChat("diff")
        }),
      },
    ]
    const popout = supervisionPopoutPaletteEntry(t("supervision.commandPalette.popOut"))
    if (popout) {
      list.splice(1, 0, {
        id: popout.id,
        title: popout.title,
        icon: <Icon name="window" className="mr-2 h-4 w-4" />,
        searchText: popout.searchText,
        onSelect: run(() => void popout.onSelect()),
      })
    }
    for (const project of projects) {
      const label = project.label?.trim() || project.path
      const title = t("supervision.commandPalette.goToProject", { label })
      list.push({
        id: `supervision:project:${project.id}`,
        title,
        icon: <Icon name="folder-3" className="mr-2 h-4 w-4" />,
        searchText: `${title} supervision project ${project.path}`,
        onSelect: run(() => {
          setActiveProject(project.id)
          setMissionControlOpen(false)
        }),
      })
    }
    for (const workingSet of workingSets) {
      const title = t("supervision.commandPalette.showWorkingSet", { name: workingSet.name })
      list.push({
        id: `supervision:working-set:${workingSet.id}`,
        title,
        icon: <Icon name="checkbox-multiple" className="mr-2 h-4 w-4" />,
        searchText: `${title} supervision working set`,
        onSelect: run(() => {
          setActiveWorkingSet(workingSet.id)
          setMissionControlOpen(true)
        }),
      })
    }
    return list
  }, [
    t,
    run,
    toggleMissionControl,
    supervisionRows,
    currentSessionId,
    setQuickDispatchOpen,
    projects,
    setActiveProject,
    setMissionControlOpen,
    workingSets,
    setActiveWorkingSet,
  ])

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------
  const commands = React.useMemo<CommandEntry[]>(() => {
    const list: CommandEntry[] = [
      {
        id: "new-session",
        title: t("commandPalette.item.newSession"),
        icon: <Icon name="add" className="mr-2 h-4 w-4" />,
        shortcutId: "new_chat",
        searchText: t("commandPalette.item.newSession"),
        onSelect: run(() => {
          setActiveMainTab("chat")
          setSessionSwitcherOpen(false)
          openNewSessionDraft()
        }),
      },
      {
        id: "new-worktree",
        title: t("commandPalette.item.newWorktreeDraft"),
        icon: <Icon name="git-branch" className="mr-2 h-4 w-4" />,
        shortcutId: "new_chat_worktree",
        searchText: t("commandPalette.item.newWorktreeDraft"),
        onSelect: run(() => {
          void createWorktreeSession().catch((error) => {
            console.warn("[command-palette] failed to create a worktree session", error)
          })
        }),
      },
      {
        id: "add-project",
        title: t("commandPalette.item.addProject"),
        icon: <Icon name="folder-add" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.addProject")} open folder`,
        shortcutId: "open_project_folder",
        onSelect: run(() => {
          void openProjectFolder({ t })
        }),
      },
      {
        id: "open-project-browser",
        title: t("commandPalette.item.openProjectBrowser"),
        icon: <Icon name="global" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.openProjectBrowser")} webmcp agent browser tools`,
        onSelect: run(() => {
          openProjectBrowser({ enable: false })
        }),
      },
      {
        id: "add-project-path",
        title: t("commandPalette.item.addProjectByPath"),
        icon: <Icon name="folder-6" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.addProjectByPath")} clone repository path`,
        onSelect: run(() => {
          sessionEvents.requestDirectoryDialog()
        }),
      },
      {
        id: "open-plan-view",
        title: t("commandPalette.item.openPlan"),
        icon: <Icon name="list-check-2" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.openPlan")} plan view main tab`,
        onSelect: run(() => setActiveMainTab("plan")),
      },
      {
        id: "open-git-view",
        title: t("commandPalette.item.openGit"),
        icon: <Icon name="git-branch" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.openGit")} git view main tab`,
        onSelect: run(() => setActiveMainTab("git")),
      },
      {
        id: "open-diff-view",
        title: t("commandPalette.item.openDiff"),
        icon: <Icon name="git-commit" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.openDiff")} diff view main tab`,
        onSelect: run(() => setActiveMainTab("diff")),
      },
      {
        id: "open-files-view",
        title: t("commandPalette.item.openFiles"),
        icon: <Icon name="folder-3" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.openFiles")} files view main tab`,
        onSelect: run(() => setActiveMainTab("files")),
      },
      {
        id: "open-terminal-view",
        title: t("commandPalette.item.openTerminal"),
        icon: <Icon name="terminal-box" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.openTerminal")} terminal view main tab`,
        onSelect: run(() => setActiveMainTab("terminal")),
      },
      {
        id: "open-board-view",
        title: t("commandPalette.item.openBoard"),
        icon: <Icon name="git-pull-request" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.openBoard")} issues pull requests github board`,
        onSelect: run(() => setActiveMainTab("board")),
      },
      {
        id: "toggle-sidebar",
        title: isMobile ? t("commandPalette.item.showSessionSwitcher") : t("commandPalette.item.toggleSidebar"),
        icon: <Icon name="layout-left" className="mr-2 h-4 w-4" />,
        shortcutId: "toggle_sidebar",
        searchText: isMobile ? t("commandPalette.item.showSessionSwitcher") : t("commandPalette.item.toggleSidebar"),
        onSelect: run(() => {
          if (isMobile) {
            const { isSessionSwitcherOpen } = useUIStore.getState()
            setSessionSwitcherOpen(!isSessionSwitcherOpen)
          } else {
            toggleSidebar()
          }
        }),
      },
      {
        id: "toggle-right-sidebar",
        title: t("commandPalette.item.toggleRightSidebar"),
        icon: <Icon name="layout-right" className="mr-2 h-4 w-4" />,
        shortcutId: "toggle_right_sidebar",
        searchText: t("commandPalette.item.toggleRightSidebar"),
        onSelect: run(() => toggleRightSidebar()),
      },
      {
        id: "toggle-terminal",
        title: t("commandPalette.item.toggleTerminal"),
        icon: <Icon name="terminal-box" className="mr-2 h-4 w-4" />,
        shortcutId: "toggle_terminal",
        searchText: t("commandPalette.item.toggleTerminal"),
        onSelect: run(() => toggleBottomTerminal()),
      },
      {
        id: "context-usage",
        title: t("commandPalette.item.showContextUsage"),
        icon: <Icon name="pie-chart" className="mr-2 h-4 w-4" />,
        searchText: t("commandPalette.item.showContextUsage"),
        onSelect: run(() => {
          if (currentDirectory) openContextOverview(currentDirectory)
        }),
      },
      {
        id: "open-settings",
        title: t("commandPalette.item.openSettings"),
        icon: <Icon name="settings-3" className="mr-2 h-4 w-4" />,
        shortcutId: "open_settings",
        searchText: t("commandPalette.item.openSettings"),
        onSelect: run(() => setSettingsDialogOpen(true)),
      },
      {
        id: "search-conversation",
        title: t("commandPalette.item.searchConversation"),
        icon: <Icon name="search" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.searchConversation")} timeline transcript find messages`,
        onSelect: run(() => setTimelineDialogOpen(true)),
      },
      {
        id: "search-all-sessions",
        title: t("commandPalette.item.searchAllSessions"),
        icon: <Icon name="search" className="mr-2 h-4 w-4" />,
        shortcutId: "search_all_sessions",
        searchText: `${t("commandPalette.item.searchAllSessions")} sessions messages find text history`,
        onSelect: run(() => setCrossSessionSearchOpen(true)),
      },
      {
        id: "theme-system",
        title: t("commandPalette.item.themeModeSystem"),
        icon: <Icon name="computer" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.themeModeSystem")} color mode appearance system`,
        onSelect: run(() => setThemeMode("system" as ThemeMode)),
      },
      {
        id: "theme-light",
        title: t("commandPalette.item.themeModeLight"),
        icon: <Icon name="lightbulb" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.themeModeLight")} color mode appearance light`,
        onSelect: run(() => setThemeMode("light" as ThemeMode)),
      },
      {
        id: "theme-dark",
        title: t("commandPalette.item.themeModeDark"),
        icon: <Icon name="palette" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.themeModeDark")} color mode appearance dark`,
        onSelect: run(() => setThemeMode("dark" as ThemeMode)),
      },
      {
        id: "open-appearance",
        title: t("commandPalette.item.openAppearance"),
        icon: <Icon name="palette" className="mr-2 h-4 w-4" />,
        searchText: `${t("commandPalette.item.openAppearance")} theme fonts`,
        onSelect: run(() => {
          setSettingsPage("appearance")
          setSettingsDialogOpen(true)
        }),
      },
    ]
    if (canUseLocalElectronDesktopIPC()) {
      list.splice(1, 0, {
        id: "new-mini-chat",
        title: t("commandPalette.item.newMiniChat"),
        icon: <Icon name="window" className="mr-2 h-4 w-4" />,
        shortcutId: "new_mini_chat",
        searchText: t("commandPalette.item.newMiniChat"),
        onSelect: run(() => {
          void invokeDesktop("desktop_open_draft_mini_chat_window", {
            directory: normalizePath(currentDirectory || activeProject?.path || ""),
            projectId: activeProject?.id ?? null,
          }).catch((error) => {
            console.warn("[command-palette] failed to open draft mini chat window", error)
          })
        }),
      })
    }
    return list
  }, [
    t,
    run,
    openProjectBrowser,
    isMobile,
    setActiveMainTab,
    setSessionSwitcherOpen,
    openNewSessionDraft,
    toggleSidebar,
    toggleRightSidebar,
    toggleBottomTerminal,
    currentDirectory,
    openContextOverview,
    setSettingsDialogOpen,
    setSettingsPage,
    setTimelineDialogOpen,
    setCrossSessionSearchOpen,
    setThemeMode,
    activeProject?.id,
    activeProject?.path,
  ])

  // ---------------------------------------------------------------------------
  // Settings sub-pages (only show when there's a query)
  // ---------------------------------------------------------------------------
  const settingsRuntimeCtx = React.useMemo<SettingsRuntimeContext>(() => {
    const isDesktop = isDesktopShell()
    return { isWeb: !isDesktop && isWebRuntime(), isDesktop }
  }, [])

  const settingsEntries = React.useMemo<CommandEntry[]>(() => {
    return SETTINGS_PAGE_METADATA.filter((p) => p.slug !== "home")
      .filter((p) => (p.isAvailable ? p.isAvailable(settingsRuntimeCtx) : true))
      .map((page) => {
        const iconName = getSettingsNavIcon(page.slug) ?? "settings-3"
        const keywords = (page.keywords ?? []).join(" ")
        return {
          id: `settings:${page.slug}`,
          title: page.title,
          icon: <Icon name={iconName} className="mr-2 h-4 w-4" />,
          searchText: `${page.title} ${page.group} ${keywords}`,
          onSelect: run(() => {
            setSettingsPage(page.slug)
            setSettingsDialogOpen(true)
          }),
        } satisfies CommandEntry
      })
  }, [settingsRuntimeCtx, run, setSettingsPage, setSettingsDialogOpen])

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------
  const sortedActiveSessions = React.useMemo(() => {
    const getUpdated = (s: Session) =>
      (typeof s.time?.updated === "number" ? s.time.updated : 0) ||
      (typeof s.time?.created === "number" ? s.time.created : 0)
    return rankPaletteSessions(
      [...activeSessions].sort((a, b) => getUpdated(b) - getUpdated(a)),
      supervisionRows,
    )
  }, [activeSessions, supervisionRows])
  const rowBySession = React.useMemo(
    () => new Map(supervisionRows.map((row) => [row.sessionId, row])),
    [supervisionRows],
  )
  const sessionsFirst = paletteHasNeedsYou(supervisionRows)

  const allBranches = useGitAllBranches()
  const worktreeMetadata = useSessionUIStore((s) => s.worktreeMetadata)

  const branchForSession = React.useCallback(
    (sessionId: string, dir: string | null): string | null => {
      const meta = worktreeMetadata.get(sessionId)
      if (meta?.branch) return meta.branch.trim() || null
      if (dir) return allBranches.get(dir)?.trim() || null
      return null
    },
    [worktreeMetadata, allBranches],
  )

  // ---------------------------------------------------------------------------
  // File search
  // ---------------------------------------------------------------------------
  const [fileResults, setFileResults] = React.useState<FileHit[]>([])
  const [isSearchingFiles, setIsSearchingFiles] = React.useState(false)

  React.useEffect(() => {
    if (!isCommandPaletteOpen) {
      setFileResults([])
      setIsSearchingFiles(false)
      return
    }
    if (!currentRoot || trimmedQuery.length === 0 || trimmedQuery.startsWith("#") || scope) {
      setFileResults([])
      setIsSearchingFiles(false)
      return
    }
    let cancelled = false
    setIsSearchingFiles(true)
    void searchFiles(currentRoot, trimmedQuery, 10, { type: "file" })
      .then((results) => {
        if (cancelled) return
        setFileResults(
          results.map((file) => ({
            path: normalizePath(file.path),
            name: file.name,
            relativePath: file.relativePath,
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setFileResults([])
      })
      .finally(() => {
        if (!cancelled) setIsSearchingFiles(false)
      })
    return () => {
      cancelled = true
    }
  }, [isCommandPaletteOpen, currentRoot, trimmedQuery, searchFiles, scope])

  // ---------------------------------------------------------------------------
  // Filter visible items
  // ---------------------------------------------------------------------------
  const hasQuery = liveTrimmed.length > 0

  const scoredSupervision = React.useMemo(() => {
    if (!hasQuery) return supervisionCommands.map((item) => ({ item, score: 0 }))
    return scoreByFuzzyQuery(supervisionCommands, liveTrimmed, (c) => c.searchText, {
      limit: 7,
      noFuzzy: true,
    })
  }, [supervisionCommands, liveTrimmed, hasQuery])

  const scoredCommands = React.useMemo(() => {
    if (!hasQuery) return commands.map((item) => ({ item, score: 0 }))
    return scoreByFuzzyQuery(commands, liveTrimmed, (c) => c.searchText, {
      limit: 7,
      noFuzzy: true,
    })
  }, [commands, liveTrimmed, hasQuery])

  const scoredSettings = React.useMemo(() => {
    if (!hasQuery) return []
    return scoreByFuzzyQuery(settingsEntries, liveTrimmed, (c) => c.searchText, {
      limit: 7,
      noFuzzy: true,
    })
  }, [settingsEntries, liveTrimmed, hasQuery])

  const sessionSearch = liveTrimmed.startsWith("#") || Boolean(scope)
  const sessionCandidates = React.useMemo(() => {
    const candidates = sortedActiveSessions.filter((session) => {
      if (!scope || scope === "host") return true
      const row = rowBySession.get(session.id)
      return row && `project:${missionProjectKey(row)}` === scope
    })
    if (liveTrimmed.startsWith("#")) {
      const expression = liveTrimmed
        .slice(1)
        .trim()
        .toLowerCase()
        .replace(/^pr\b\s*/, "")
      return candidates
        .filter((session) => {
          const pr = rowBySession.get(session.id)?.pullRequest
          if (!pr) return false
          return expression
            .split(/\s+/)
            .filter(Boolean)
            .every((term) => (/^#?\d+$/.test(term) ? pr.number === Number(term.replace(/^#/, "")) : pr.state === term))
        })
        .map((item) => ({ item, score: 0 }))
    }
    if (!hasQuery) return candidates.slice(0, 8).map((item) => ({ item, score: 0 }))
    return scoreByFuzzyQuery(
      candidates,
      liveTrimmed,
      (s) => `${s.title || ""} ${rowBySession.get(s.id)?.projectLabel ?? ""}`,
      { limit: 7, threshold: 0.2 },
    )
  }, [sortedActiveSessions, liveTrimmed, hasQuery, rowBySession, scope])

  const scoredSessions = React.useMemo(
    () =>
      liveTrimmed.startsWith("#")
        ? sessionCandidates.filter(({ item }) => !rowBySession.get(item.id)?.pullRequest?.stale).slice(0, 50)
        : sessionCandidates,
    [sessionCandidates, liveTrimmed, rowBySession],
  )

  const scoredFiles = React.useMemo(() => {
    if (!hasQuery || fileResults.length === 0) return []
    // Server already ranked by relevance; compute a comparable client score on
    // basename so we can decide file group placement vs sessions/commands.
    return scoreByFuzzyQuery(fileResults, liveTrimmed, (f) => f.name, {
      limit: 10,
      threshold: 0.4,
    })
  }, [fileResults, liveTrimmed, hasQuery])

  const visibleSupervision = (sessionSearch ? [] : scoredSupervision).map((x) => x.item)
  const visibleCommands = (sessionSearch ? [] : scoredCommands).map((x) => x.item)
  const visibleSettings = (sessionSearch ? [] : scoredSettings).map((x) => x.item)
  const visibleSessions = scoredSessions.map((x) => x.item)
  const visibleFiles = hasQuery && !sessionSearch ? scoredFiles.map((x) => x.item) : []

  React.useEffect(() => {
    // Demand known PR matches before hiding stale data. The shared cache limits refresh concurrency to two.
    setPrVisibleRows(
      isCommandPaletteOpen
        ? supervisionRows.filter((row) => sessionCandidates.some(({ item }) => item.id === row.sessionId))
        : [],
    )
  }, [isCommandPaletteOpen, supervisionRows, sessionCandidates, setPrVisibleRows])

  const groupOrder = React.useMemo<("supervision" | "commands" | "settings" | "sessions" | "files")[]>(() => {
    // Like a jump palette: when a session waits on the user, the ranked sessions come first.
    if (!hasQuery)
      return sessionsFirst ? ["sessions", "supervision", "commands"] : ["supervision", "commands", "sessions"]
    const best = (arr: { score: number }[]): number => (arr.length ? arr[0].score : Infinity)
    const groups: { key: "commands" | "settings" | "sessions" | "files"; score: number }[] = [
      { key: "commands", score: best(scoredCommands) },
      { key: "settings", score: best(scoredSettings) },
      { key: "sessions", score: best(scoredSessions) },
      { key: "files", score: best(scoredFiles) },
    ]
    groups.sort((a, b) => a.score - b.score)
    return ["supervision", ...groups.map((g) => g.key)]
  }, [hasQuery, sessionsFirst, scoredCommands, scoredSettings, scoredSessions, scoredFiles])

  const handleOpenSession = React.useCallback(
    (session: Session) => {
      close()
      setCurrentSession(session.id, resolveGlobalSessionDirectory(session))
    },
    [close, setCurrentSession],
  )

  const handleSplitSession = (session: Session) => {
    const chosenDirectory = resolveGlobalSessionDirectory(session)
    const current = activeSessions.find((item) => item.id === currentSessionId)
    const currentDir =
      (current && resolveGlobalSessionDirectory(current)) ||
      rowBySession.get(currentSessionId ?? "")?.directory
    const currentSlot = currentSessionId && currentDir ? { sessionId: currentSessionId, directory: currentDir } : null
    const chosenSlot = chosenDirectory ? { sessionId: session.id, directory: chosenDirectory } : null
    if (
      !currentSlot ||
      !chosenSlot ||
      session.id === currentSessionId ||
      !resolveGridSession(currentSlot, sourceRows) ||
      !resolveGridSession(chosenSlot, sourceRows)
    ) {
      handleOpenSession(session)
      return
    }
    openSessionGrid([currentSlot, chosenSlot])
    close()
  }

  const handleOpenFile = React.useCallback(
    async (filePath: string) => {
      if (!currentRoot) return
      const validation = await validateContextFileOpen(filesApi, filePath)
      if (!validation.ok) {
        toast.error(getContextFileOpenFailureMessage(validation.reason))
        return
      }
      openContextFile(currentRoot, filePath)
      close()
    },
    [currentRoot, filesApi, openContextFile, close],
  )

  const shortcut = React.useCallback(
    (actionId: string) => formatShortcutForDisplay(getEffectiveShortcutCombo(actionId, shortcutOverrides)),
    [shortcutOverrides],
  )

  return (
    <Dialog open={isCommandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <DialogContent className="overflow-hidden p-0" showCloseButton>
        {/* Inside DialogContent: a header left outside it renders into the page even
            while closed, leaking a screen-reader-only "Command Palette" heading. */}
        <DialogHeader className="sr-only">
          <DialogTitle>{t("commandPalette.title")}</DialogTitle>
          <DialogDescription>{t("commandPalette.description")}</DialogDescription>
        </DialogHeader>
        {isSearchMode ? (
          <div className="flex items-center gap-2 border-b border-border/40 px-3 py-1.5">
            <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 typography-micro font-medium text-primary">
              {t("commandPalette.searchMode.badge")}
            </span>
            <span className="typography-meta text-muted-foreground">{t("commandPalette.description")}</span>
          </div>
        ) : null}
        <Command
          shouldFilter={false}
          label={t("commandPalette.input.placeholder")}
          onKeyDownCapture={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === "Tab" && !event.shiftKey && event.target === inputRef.current) {
              event.preventDefault()
              scopeRef.current?.focus()
            }
            if (event.key === "Enter" && event.shiftKey && event.target === inputRef.current) {
              event.preventDefault()
              event.stopPropagation()
              const value = event.currentTarget
                .querySelector('[cmdk-item][aria-selected="true"]')
                ?.getAttribute("data-value")
              const session = visibleSessions.find((item) => `session:${item.id}` === value)
              if (session) handleSplitSession(session)
            }
          }}
          className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-8 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-1.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4 [&_[cmdk-item]]:typography-meta"
        >
          <CommandInput
            ref={inputRef}
            aria-label={t("commandPalette.input.placeholder")}
            aria-describedby={helpId}
            value={query}
            onValueChange={setQuery}
            placeholder={
              isSearchMode ? t("commandPalette.searchMode.placeholder") : t("commandPalette.input.placeholder")
            }
          />
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <label htmlFor={`${helpId}-scope`} className="typography-micro">
              {t("commandPalette.scope.label")}
            </label>
            <select
              id={`${helpId}-scope`}
              ref={scopeRef}
              value={scope}
              className="min-w-0 flex-1 rounded border bg-background p-1 typography-meta focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setScope(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation()
                // Native macOS menus defer selection until Enter; commit arrow navigation here so
                // Enter can consistently return to the search input on every desktop platform.
                if (!event.altKey && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                  event.preventDefault()
                  const select = event.currentTarget
                  const index =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? select.options.length - 1
                        : Math.max(
                            0,
                            Math.min(
                              select.options.length - 1,
                              select.selectedIndex + (event.key === "ArrowDown" ? 1 : -1),
                            ),
                          )
                  setScope(select.options[index].value)
                }
                if (event.key === "Enter" || (event.key === "Tab" && event.shiftKey)) {
                  event.preventDefault()
                  inputRef.current?.focus()
                }
              }}
            >
              <option value="">{t("commandPalette.scope.all")}</option>
              <optgroup label={t("commandPalette.scope.host")}>
                <option value="host">{host}</option>
              </optgroup>
              <optgroup label={t("commandPalette.scope.project")}>
                {scopeProjects.map((project) => (
                  <option key={project.key} value={`project:${project.key}`}>
                    {project.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <p id={helpId} className="px-3 py-2 typography-micro text-muted-foreground">
            {t("commandPalette.session.help")}
          </p>
          <CommandList>
            <CommandEmpty>{t("commandPalette.empty.noResults")}</CommandEmpty>

            {groupOrder.map((groupKey) => {
              if (groupKey === "supervision" && visibleSupervision.length > 0) {
                return (
                  <CommandGroup key="supervision" heading={t("supervision.commandPalette.group")}>
                    {visibleSupervision.map((cmd) => (
                      <CommandItem key={cmd.id} value={cmd.id} onSelect={cmd.onSelect}>
                        {cmd.icon}
                        <span>{cmd.title}</span>
                        {cmd.shortcutId ? <CommandShortcut>{shortcut(cmd.shortcutId)}</CommandShortcut> : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )
              }
              if (groupKey === "commands" && visibleCommands.length > 0) {
                return (
                  <CommandGroup key="commands" heading={t("commandPalette.group.commands")}>
                    {visibleCommands.map((cmd) => (
                      <CommandItem key={cmd.id} value={cmd.id} onSelect={cmd.onSelect}>
                        {cmd.icon}
                        <span>{cmd.title}</span>
                        {cmd.shortcutId ? <CommandShortcut>{shortcut(cmd.shortcutId)}</CommandShortcut> : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )
              }
              if (groupKey === "settings" && visibleSettings.length > 0) {
                return (
                  <CommandGroup key="settings" heading={t("commandPalette.group.settings")}>
                    {visibleSettings.map((cmd) => (
                      <CommandItem key={cmd.id} value={cmd.id} onSelect={cmd.onSelect}>
                        {cmd.icon}
                        <span>{cmd.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )
              }
              if (groupKey === "sessions" && visibleSessions.length > 0) {
                return (
                  <CommandGroup key="sessions" heading={t("commandPalette.group.sessions")}>
                    {visibleSessions.map((session) => {
                      const title = session.title || t("commandPalette.session.untitled")
                      const dir = resolveGlobalSessionDirectory(session)
                      const branch = branchForSession(session.id, dir)
                      const row = rowBySession.get(session.id)
                      return (
                        <CommandItem
                          key={session.id}
                          value={`session:${session.id}`}
                          onSelect={() => handleOpenSession(session)}
                        >
                          <Icon name="chat-ai-3" className="mr-2 h-4 w-4" />
                          {/* The title wins the space; a long, disambiguated project label truncates first. */}
                          <span className="min-w-[8rem] flex-1 truncate">{title}</span>
                          {row?.pullRequest && !row.pullRequest.stale ? (
                            <span className="shrink-0 typography-micro" data-palette-pr={row.pullRequest.number}>
                              #{row.pullRequest.number} {t(`supervision.missionControl.facet.${row.pullRequest.state}`)}
                            </span>
                          ) : null}
                          {row?.projectLabel ? (
                            <span
                              className="min-w-0 max-w-[35%] shrink truncate text-muted-foreground typography-meta"
                              title={row.projectLabel}
                            >
                              {row.projectLabel}
                            </span>
                          ) : null}
                          {row && row.state !== "idle" ? (
                            <span className="shrink-0" data-palette-session-state={row.state}>
                              <SupervisionStateBadge state={row.state} />
                            </span>
                          ) : null}
                          {branch ? (
                            <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground typography-meta">
                              <Icon name="git-branch" className="h-3 w-3" />
                              <span className="truncate max-w-[160px]">{branch}</span>
                            </span>
                          ) : null}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                )
              }
              if (groupKey === "files" && visibleFiles.length > 0) {
                return (
                  <CommandGroup key="files" heading={t("commandPalette.group.files")}>
                    {visibleFiles.map((file) => {
                      const display = truncatePathMiddle(file.relativePath || file.name, {
                        maxLength: 80,
                      })
                      return (
                        <CommandItem
                          key={`file:${file.path}`}
                          value={`file:${file.path}`}
                          onSelect={() => {
                            void handleOpenFile(file.path)
                          }}
                        >
                          <FileTypeIcon filePath={file.path} className="mr-2 size-4 shrink-0" />
                          <span className="truncate" aria-label={file.relativePath}>
                            {display}
                          </span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                )
              }
              return null
            })}

            {hasQuery && isSearchingFiles && visibleFiles.length === 0 ? (
              <div className="px-3 py-2 typography-meta text-muted-foreground">
                {t("commandPalette.empty.searchingFiles")}
              </div>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
