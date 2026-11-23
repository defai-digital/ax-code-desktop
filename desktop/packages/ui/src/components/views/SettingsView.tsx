import React from "react"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/stores/useUIStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useAgentsStore } from "@/stores/useAgentsStore"
import { useCommandsStore } from "@/stores/useCommandsStore"
import { useMcpConfigStore } from "@/stores/useMcpConfigStore"
import { useSkillsStore } from "@/stores/useSkillsStore"
import { useSkillsCatalogStore } from "@/stores/useSkillsCatalogStore"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { ErrorBoundary } from "@/components/ui/ErrorBoundary"
import { filterByFuzzyQuery } from "@/lib/search/fuzzySearch"
import { AgentsSidebar } from "@/components/sections/agents/AgentsSidebar"
import { AgentsPage } from "@/components/sections/agents/AgentsPage"
import { BehaviorPage } from "@/components/sections/behavior/BehaviorPage"
import { CommandsSidebar } from "@/components/sections/commands/CommandsSidebar"
import { CommandsPage } from "@/components/sections/commands/CommandsPage"
import { McpSidebar } from "@/components/sections/mcp/McpSidebar"
import { McpPage } from "@/components/sections/mcp/McpPage"
import { HooksPage } from "@/components/sections/hooks/HooksPage"
import { SkillsSidebar } from "@/components/sections/skills/SkillsSidebar"
import { SkillsPage } from "@/components/sections/skills/SkillsPage"
import { ProjectsSidebar } from "@/components/sections/projects/ProjectsSidebar"
import { ProjectsPage } from "@/components/sections/projects/ProjectsPage"
import { ProvidersSidebar } from "@/components/sections/providers/ProvidersSidebar"
import { ProvidersPage } from "@/components/sections/providers/ProvidersPage"
import { LocalModelsProvider } from "@/components/sections/models/LocalModelsProvider"
import { showLocalModelsNavigation, useLocalModelsState } from "@/components/sections/models/localModelsState"
import { LocalModelsPage } from "@/components/sections/models/LocalModelsPage"
import { GitPage } from "@/components/sections/git-identities/GitPage"
import type { AXCodeSection } from "@/components/sections/ax-code/types"
import { AXCodePage } from "@/components/sections/ax-code/AXCodePage"
import { useDeviceInfo } from "@/lib/device"
import { isDesktopShell, isWebRuntime } from "@/lib/desktop"
import { useI18n } from "@/lib/i18n"
import { isPlainRecord } from "@/lib/record"
import { parseRoute } from "@/lib/router"
import { Icon } from "@/components/icon/Icon"
import { reloadAxCodeConfiguration } from "@/stores/useAgentsStore"
import {
  SETTINGS_PAGE_METADATA,
  getSettingsPageMeta,
  resolveAvailableSettingsSlug,
  resolveSettingsSlug,
  type SettingsPageSlug,
  type SettingsRuntimeContext,
  type SettingsPageMeta,
} from "@/lib/settings/metadata"
import { getSettingsNavIcon } from "@/lib/settings/navIcons"
import {
  groupSettingsDestinations,
  groupSettingsPages,
  SETTINGS_NAVIGATION,
  settingsFamilyOf,
} from "@/lib/settings/navigation"

// Same constraints as main sidebar
const SETTINGS_NAV_MIN_WIDTH = 176
const SETTINGS_NAV_MAX_WIDTH = 280
const SETTINGS_NAV_RESIZE_STEP = 8
const SETTINGS_DETAIL_HISTORY_KEY = "__openchamberSettingsDetail"

function clampSettingsNavWidth(width: number): number {
  return Math.min(SETTINGS_NAV_MAX_WIDTH, Math.max(SETTINGS_NAV_MIN_WIDTH, width))
}

type MobileStage = "nav" | "page-sidebar" | "page-content"
type SkillsPane = "installed" | "catalog"
type SettingsDetailHistoryEntry = {
  page: SettingsPageSlug
  stage: "page-content"
  /** The Skills pane the detail showed; the catalog and an installed skill share one page. */
  skillsPane: SkillsPane
  /** The installed skill the detail showed. The selection is shared, so a later pick would otherwise replace it. */
  skillName: string | null
}
type PageSidebarSelection = { skillsPane?: SkillsPane }

interface SettingsViewProps {
  onClose?: () => void
  /** Rendered inside a window/dialog (skip traffic light padding) */
  isWindowed?: boolean
}

function buildRuntimeContext(isDesktop: boolean): SettingsRuntimeContext {
  const isWeb = !isDesktop && isWebRuntime()
  return { isWeb, isDesktop }
}

function isPageAvailable(page: SettingsPageMeta, ctx: SettingsRuntimeContext): boolean {
  if (!page.isAvailable) {
    return true
  }
  return page.isAvailable(ctx)
}

function getSettingsDetailHistoryEntry(state: unknown): SettingsDetailHistoryEntry | null {
  if (!isPlainRecord(state)) {
    return null
  }

  const detail = state[SETTINGS_DETAIL_HISTORY_KEY]
  if (!isPlainRecord(detail)) {
    return null
  }

  const page = detail.page
  const stage = detail.stage
  if (typeof page !== "string" || stage !== "page-content") {
    return null
  }

  const resolvedPage = resolveSettingsSlug(page)
  return {
    page: resolvedPage,
    stage,
    skillsPane: detail.skillsPane === "catalog" ? "catalog" : "installed",
    skillName: typeof detail.skillName === "string" ? detail.skillName : null,
  }
}

/**
 * Record what a split page's mobile detail shows. The router pushes an entry for every page change, so Back from a
 * sibling page reaches this entry on its own; a detail entry already on top is updated instead of stacked.
 */
function recordSplitDetailHistory(slug: SettingsPageSlug, pane: SkillsPane): void {
  if (typeof window === "undefined") {
    return
  }

  const state = getCurrentHistoryState()
  const currentDetail = getSettingsDetailHistoryEntry(state)
  const skillName = pane === "installed" ? useSkillsStore.getState().selectedSkillName : null
  if (currentDetail?.page === slug && currentDetail.skillsPane === pane && currentDetail.skillName === skillName) {
    return
  }

  const detail: SettingsDetailHistoryEntry = { page: slug, stage: "page-content", skillsPane: pane, skillName }
  const next = { ...state, [SETTINGS_DETAIL_HISTORY_KEY]: detail }
  if (currentDetail?.page === slug) {
    window.history.replaceState(next, "", window.location.href)
    return
  }
  window.history.pushState(next, "", window.location.href)
}

function mobileStageForPage(slug: SettingsPageSlug): MobileStage {
  const def = getSettingsPageMeta(slug)
  if (!def || def.slug === "home") {
    return "nav"
  }
  return def.kind === "split" ? "page-sidebar" : "page-content"
}


function getCurrentHistoryState(): Record<string, unknown> {
  if (typeof window === "undefined" || !isPlainRecord(window.history.state)) {
    return {}
  }
  return window.history.state
}

const SettingsHome: React.FC<{ onOpen: (slug: SettingsPageSlug) => void }> = ({ onOpen }) => {
  const { t } = useI18n()
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-6 space-y-6">
        <div className="space-y-1">
          <h1 className="typography-ui-header font-semibold text-foreground">{t("settings.view.home.title")}</h1>
          <p className="typography-ui-label text-muted-foreground">{t("settings.view.home.description")}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onOpen("providers")}
            className={cn(
              "rounded-lg border border-border bg-[var(--surface-elevated)] p-4 text-left",
              "hover:bg-[var(--interactive-hover)] transition-colors",
            )}
          >
            <div className="typography-ui-label text-foreground">{t("settings.view.home.cards.providers.title")}</div>
            <div className="typography-micro text-muted-foreground">
              {t("settings.view.home.cards.providers.description")}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onOpen("agents")}
            className={cn(
              "rounded-lg border border-border bg-[var(--surface-elevated)] p-4 text-left",
              "hover:bg-[var(--interactive-hover)] transition-colors",
            )}
          >
            <div className="typography-ui-label text-foreground">{t("settings.view.home.cards.agents.title")}</div>
            <div className="typography-micro text-muted-foreground">
              {t("settings.view.home.cards.agents.description")}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onOpen("skills.installed")}
            className={cn(
              "rounded-lg border border-border bg-[var(--surface-elevated)] p-4 text-left",
              "hover:bg-[var(--interactive-hover)] transition-colors",
            )}
          >
            <div className="typography-ui-label text-foreground">
              {t("settings.view.home.cards.skillsCatalog.title")}
            </div>
            <div className="typography-micro text-muted-foreground">
              {t("settings.view.home.cards.skillsCatalog.description")}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onOpen("mcp")}
            className={cn(
              "rounded-lg border border-border bg-[var(--surface-elevated)] p-4 text-left",
              "hover:bg-[var(--interactive-hover)] transition-colors",
            )}
          >
            <div className="typography-ui-label text-foreground">{t("settings.view.home.cards.mcp.title")}</div>
            <div className="typography-micro text-muted-foreground">
              {t("settings.view.home.cards.mcp.description")}
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

export const SettingsView: React.FC<SettingsViewProps> = (props) => {
  const open = useUIStore((state) => state.isSettingsDialogOpen)
  return (
    <LocalModelsProvider enabled={Boolean(open || props.isWindowed)}>
      <SettingsViewContent {...props} />
    </LocalModelsProvider>
  )
}

const SettingsViewContent: React.FC<SettingsViewProps> = ({ onClose, isWindowed }) => {
  const localModels = useLocalModelsState()
  const showModels = showLocalModelsNavigation(localModels.data, localModels.connection, localModels.error)
  const { t } = useI18n()
  const deviceInfo = useDeviceInfo()
  const isMobile = deviceInfo.isMobile

  const settingsPageRaw = useUIStore((state) => state.settingsPage)
  const isSettingsDialogOpen = useUIStore((state) => state.isSettingsDialogOpen)
  const setSettingsPage = useUIStore((state) => state.setSettingsPage)

  const [mobileStage, setMobileStage] = React.useState<MobileStage>("nav")
  const autoNavSlugRef = React.useRef<string | null>(null)
  const [navQuery, setNavQuery] = React.useState("")
  const navId = React.useId()
  const [skillsPane, setSkillsPane] = React.useState<SkillsPane>("installed")

  const [navWidth, setNavWidth] = React.useState(216)
  const [hasManuallyResized, setHasManuallyResized] = React.useState(false)
  const [isResizing, setIsResizing] = React.useState(false)
  const startXRef = React.useRef(0)
  const startWidthRef = React.useRef(navWidth)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const isDesktopApp = React.useMemo(() => {
    return isDesktopShell()
  }, [])

  // keep platform check available for future window chrome tweaks

  const runtimeCtx = React.useMemo(() => buildRuntimeContext(isDesktopApp), [isDesktopApp])
  const settingsSlug = resolveAvailableSettingsSlug(settingsPageRaw, runtimeCtx)
  const skillsCatalogFullWidth = settingsSlug === "skills.installed" && skillsPane === "catalog"

  React.useEffect(() => {
    if (settingsSlug !== "skills.installed") {
      setSkillsPane("installed")
    }
  }, [settingsSlug])

  const visiblePages = React.useMemo(() => {
    return SETTINGS_PAGE_METADATA.filter((page) => page.slug !== "home")
      .filter((page) => !page.hideFromNavigation)
      .filter((page) => isPageAvailable(page, runtimeCtx))
      .filter((page) => !(isMobile && page.slug === "shortcuts"))
      .filter((page) => page.slug !== "models" || showModels || Boolean(navQuery.trim()))
  }, [runtimeCtx, isMobile, showModels, navQuery])

  const sortedFilteredPages = React.useMemo(() => {
    return groupSettingsPages(visiblePages).flatMap(group => group.pages)
  }, [visiblePages])

  const activeProjectId = useProjectsStore((state) => state.activeProjectId)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const handleResize = () => {
      if (!hasManuallyResized) {
        const proportionalWidth = clampSettingsNavWidth(Math.floor(window.innerWidth * 0.12))
        setNavWidth(proportionalWidth)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [hasManuallyResized])

  React.useEffect(() => {
    if (!isResizing) return
    const handlePointerMove = (event: PointerEvent) => {
      const delta = event.clientX - startXRef.current
      const nextWidth = clampSettingsNavWidth(startWidthRef.current + delta)
      setNavWidth(nextWidth)
      setHasManuallyResized(true)
    }
    const handlePointerUp = () => setIsResizing(false)
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp, { once: true })
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [isResizing])

  const handlePointerDown = (event: React.PointerEvent) => {
    setIsResizing(true)
    startXRef.current = event.clientX
    startWidthRef.current = navWidth
    event.preventDefault()
  }

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? SETTINGS_NAV_RESIZE_STEP * 4 : SETTINGS_NAV_RESIZE_STEP
    let nextWidth: number

    switch (event.key) {
      case "ArrowLeft":
        nextWidth = navWidth - step
        break
      case "ArrowRight":
        nextWidth = navWidth + step
        break
      case "Home":
        nextWidth = SETTINGS_NAV_MIN_WIDTH
        break
      case "End":
        nextWidth = SETTINGS_NAV_MAX_WIDTH
        break
      default:
        return
    }

    event.preventDefault()
    setNavWidth(clampSettingsNavWidth(nextWidth))
    setHasManuallyResized(true)
  }

  // Load stores when project changes or when a page becomes active.
  React.useEffect(() => {
    if (!isSettingsDialogOpen && !isWindowed) {
      return
    }

    if (settingsSlug === "agents") {
      void useAgentsStore.getState().loadAgents()
      return
    }
    if (settingsSlug === "commands") {
      void useCommandsStore.getState().loadCommands()
      return
    }
    if (settingsSlug === "mcp") {
      void useMcpConfigStore.getState().loadMcpConfigs()
      return
    }
    if (settingsSlug === "skills.installed") {
      void useSkillsStore.getState().loadSkills()
      void useSkillsCatalogStore.getState().loadCatalog()
    }
  }, [activeProjectId, isSettingsDialogOpen, isWindowed, settingsSlug])

  const openPage = React.useCallback(
    (slug: SettingsPageSlug) => {
      setSettingsPage(slug)
      autoNavSlugRef.current = slug
      if (!isMobile) {
        return
      }
      setMobileStage(mobileStageForPage(slug))
    },
    [isMobile, setSettingsPage],
  )

  const activePageMeta = React.useMemo(() => {
    return getSettingsPageMeta(settingsSlug)
  }, [settingsSlug])

  const axCodeSectionBySlug: Partial<Record<SettingsPageSlug, AXCodeSection>> = React.useMemo(
    () => ({
      appearance: "visual",
      chat: "chat",
      shortcuts: "shortcuts",
      sessions: "sessions",
      notifications: "notifications",
    }),
    [],
  )

  const getPageTitle = React.useCallback(
    (slug: SettingsPageSlug): string => {
      switch (slug) {
        case "models":
          return t("settings.page.models.title")
        case "projects":
          return t("settings.page.projects.title")
        case "providers":
          return t("settings.page.providers.title")
        case "agents":
          return t("settings.page.agents.title")
        case "behavior":
          return t("settings.page.behavior.title")
        case "commands":
          return t("settings.page.commands.title")
        case "mcp":
          return t("settings.page.mcp.title")
        case "hooks":
          return t("settings.page.hooks.title")
        case "skills.installed":
          return t("settings.page.skills.title")
        case "git":
          return t("settings.page.git.title")
        case "appearance":
          return t("settings.page.appearance.title")
        case "chat":
          return t("settings.page.chat.title")
        case "shortcuts":
          return t("settings.page.shortcuts.title")
        case "sessions":
          return t("settings.page.sessions.title")
        case "notifications":
          return t("settings.page.notifications.title")
        case "home":
        default:
          return t("settings.view.home.title")
      }
    },
    [t],
  )

  const navSearchablePages = React.useMemo(() => {
    const query = navQuery.trim()
    if (!query) {
      return sortedFilteredPages
    }
    const exactGroup = SETTINGS_NAVIGATION.find(group =>
      [group.id, t(group.titleKey)].some(label => label.toLowerCase() === query.toLowerCase()))
    if (exactGroup) return sortedFilteredPages.filter(page => page.group === exactGroup.id)
    return filterByFuzzyQuery(sortedFilteredPages, query, (page) => {
      const group = SETTINGS_NAVIGATION.find(group => group.id === page.group)
      return [getPageTitle(page.slug), group ? t(group.titleKey) : page.group,
        page.group, ...(page.keywords ?? [])].join(" ")
    })
  }, [sortedFilteredPages, navQuery, getPageTitle, t])
  // Browsing shows one entry per family; a search lists every matching page so nothing hides behind a tab.
  const navSearching = Boolean(navQuery.trim())
  const navGroups = React.useMemo(
    () => (navSearching ? groupSettingsPages(navSearchablePages) : groupSettingsDestinations(navSearchablePages)),
    [navSearchablePages, navSearching],
  )
  const activeFamily = React.useMemo(() => settingsFamilyOf(settingsSlug), [settingsSlug])
  const familyTabs = React.useMemo(
    () => sortedFilteredPages.filter(page => activeFamily.includes(page.slug)),
    [sortedFilteredPages, activeFamily],
  )

  const renderUnavailable = React.useCallback(() => {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="typography-ui-header font-semibold text-foreground">
            {t("settings.view.unavailable.title")}
          </div>
          <p className="typography-ui-label text-muted-foreground mt-1">{t("settings.view.unavailable.description")}</p>
        </div>
      </div>
    )
  }, [t])

  const renderPageSidebar = React.useCallback((
    slug: SettingsPageSlug,
    opts: { onItemSelect?: (selection?: PageSidebarSelection) => void },
  ) => {
    switch (slug) {
      case "projects":
        return <ProjectsSidebar onItemSelect={opts.onItemSelect} />
      case "agents":
        return <AgentsSidebar onItemSelect={opts.onItemSelect} />
      case "commands":
        return <CommandsSidebar onItemSelect={opts.onItemSelect} />
      case "mcp":
        return <McpSidebar onItemSelect={opts.onItemSelect} />
      case "hooks":
        return null
      case "skills.installed":
        return (
          <SkillsSidebar
            onItemSelect={() => {
              setSkillsPane("installed")
              opts.onItemSelect?.({ skillsPane: "installed" })
            }}
            onOpenCatalog={() => {
              setSkillsPane("catalog")
              opts.onItemSelect?.({ skillsPane: "catalog" })
            }}
          />
        )
      case "providers":
        return <ProvidersSidebar onItemSelect={opts.onItemSelect} />
      default:
        return null
    }
  }, [])

  const renderPageContent = React.useCallback(
    (slug: SettingsPageSlug) => {
      const meta = getSettingsPageMeta(slug)
      if (meta && !isPageAvailable(meta, runtimeCtx)) {
        return renderUnavailable()
      }

      switch (slug) {
        case "home":
          return <SettingsHome onOpen={openPage} />
        case "models":
          return <LocalModelsPage />
        case "projects":
          return <ProjectsPage />
        case "agents":
          return <AgentsPage />
        case "behavior":
          return <BehaviorPage />
        case "commands":
          return <CommandsPage />
        case "mcp":
          return <McpPage />
        case "hooks":
          return <HooksPage />
        case "skills.installed":
          return (
            <SkillsPage
              view={skillsPane}
              onShowInstalled={() => {
                setSkillsPane("installed")
                // The catalog's own Back button: the detail entry on top now shows the installed pane.
                if (isMobile && getSettingsDetailHistoryEntry(getCurrentHistoryState())?.page === "skills.installed") {
                  recordSplitDetailHistory("skills.installed", "installed")
                }
              }}
            />
          )
        case "providers":
          return <ProvidersPage />
        case "git":
          return <GitPage />
        case "appearance":
        case "chat":
        case "shortcuts":
        case "sessions":
        case "notifications": {
          const section = axCodeSectionBySlug[slug] ?? "visual"
          return <AXCodePage section={section} />
        }
        default:
          return <SettingsHome onOpen={openPage} />
      }
    },
    [axCodeSectionBySlug, isMobile, openPage, renderUnavailable, runtimeCtx, skillsPane],
  )

  // Mobile: if opened via deep-link / palette to a non-home page, jump into it once.
  React.useEffect(() => {
    if (!isMobile) {
      return
    }
    if (mobileStage !== "nav") {
      return
    }
    if (settingsSlug === "home") {
      return
    }
    if (autoNavSlugRef.current === settingsSlug) {
      return
    }
    const def = getSettingsPageMeta(settingsSlug)
    if (!def || def.slug === "home") {
      return
    }
    autoNavSlugRef.current = settingsSlug
    setMobileStage(def.kind === "split" ? "page-sidebar" : "page-content")
  }, [isMobile, mobileStage, settingsSlug])

  const showBackButton = isMobile && mobileStage !== "nav"
  const backButtonTargetsPageSidebar = isMobile && mobileStage === "page-content" && settingsSlug === "skills.installed"
  const showOpenPageSidebarButton =
    mobileStage === "page-content" && activePageMeta?.kind === "split" && !backButtonTargetsPageSidebar
  const mobileBackButtonLabel = backButtonTargetsPageSidebar
    ? t("settings.view.actions.back")
    : showBackButton
      ? t("settings.view.actions.backToSettings")
      : t("settings.view.actions.closeSettings")

  const handleMobilePageSidebarItemSelect = React.useCallback(
    (selection?: PageSidebarSelection) => {
      setMobileStage("page-content")
      if (settingsSlug === "skills.installed") {
        // Other sidebars may hand their click event through; only an explicit catalog selection names that pane.
        recordSplitDetailHistory(settingsSlug, selection?.skillsPane === "catalog" ? "catalog" : "installed")
      }
    },
    [settingsSlug],
  )

  // Each restore and each unmount or layout change moves this on, so a list load that settles later acts only for the
  // restore that started it, in the view that started it.
  const restoreRunRef = React.useRef(0)
  React.useEffect(
    () => () => {
      restoreRunRef.current += 1
    },
    [isMobile],
  )
  const restoreSkillsDetail = React.useCallback((detail: SettingsDetailHistoryEntry) => {
    const run = ++restoreRunRef.current
    // The deep-link jump compares against this; a stale sibling slug would bounce "Back to Settings" into Skills.
    autoNavSlugRef.current = "skills.installed"
    setSkillsPane(detail.skillsPane)
    setMobileStage("page-content")
    if (detail.skillsPane !== "installed") {
      return
    }
    // The entry names the selection it showed, an empty one included; the shared selection may have moved since.
    const skillName = detail.skillName
    useSkillsStore.getState().setSelectedSkill(skillName)
    if (!skillName) {
      return
    }
    // Only a list that loaded can say the skill is gone: a list still loading or one that failed to load cannot.
    void useSkillsStore
      .getState()
      .loadSkills()
      .catch(() => false)
      .then((loaded) => {
        if (run !== restoreRunRef.current) {
          return
        }
        const skills = useSkillsStore.getState()
        // A new skill exists only as its draft until it is saved.
        if (!loaded || skills.getSkillByName(skillName) || skills.skillDraft?.name === skillName) {
          return
        }
        const current = getSettingsDetailHistoryEntry(getCurrentHistoryState())
        if (current?.page !== "skills.installed" || current.skillName !== skillName) {
          return
        }
        // Show the list in its place, and turn the entry into the list's so Back does not land on it again.
        skills.setSelectedSkill(null)
        setMobileStage("page-sidebar")
        const state = { ...getCurrentHistoryState() }
        delete state[SETTINGS_DETAIL_HISTORY_KEY]
        window.history.replaceState(state, "", window.location.href)
      })
  }, [])

  const handleBack = React.useCallback(() => {
    if (backButtonTargetsPageSidebar) {
      const currentDetail = typeof window !== "undefined" ? getSettingsDetailHistoryEntry(window.history.state) : null
      if (currentDetail?.page === settingsSlug) {
        window.history.back()
        return
      }
      setMobileStage("page-sidebar")
      return
    }

    setMobileStage("nav")
  }, [backButtonTargetsPageSidebar, settingsSlug])

  React.useEffect(() => {
    if (!isMobile) {
      return
    }

    const handlePopState = (event: PopStateEvent) => {
      const detail = getSettingsDetailHistoryEntry(event.state)
      if (detail?.page === "skills.installed") {
        setSettingsPage(detail.page)
        restoreSkillsDetail(detail)
        return
      }

      // Any other entry is a page itself. The router opens the page in the URL; it starts at that page's first stage,
      // not at whatever stage the page being left was on. This view's slug is still the page being left, so it only
      // stands in when the URL names no page.
      const destination = parseRoute().settingsPath
      const slug = destination ? resolveSettingsSlug(destination) : settingsSlug
      autoNavSlugRef.current = slug
      setMobileStage(mobileStageForPage(slug))
    }

    window.addEventListener("popstate", handlePopState)
    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [isMobile, restoreSkillsDetail, setSettingsPage, settingsSlug])

  // The router reopens a closed Settings from the URL when history returns to a detail entry; this view mounted after
  // that popstate, so it reads the entry it landed on.
  React.useEffect(() => {
    if (!isMobile) {
      return
    }
    const detail = getSettingsDetailHistoryEntry(getCurrentHistoryState())
    if (detail?.page === "skills.installed" && settingsSlug === "skills.installed") {
      restoreSkillsDetail(detail)
    }
    // Only on mount: later arrivals on a detail entry come through popstate.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once, when the view mounts
  }, [])

  // The detail entry follows what the installed pane shows, so history returns to it even after a save renames the
  // skill or the list selects another one.
  const selectedSkillName = useSkillsStore((state) => state.selectedSkillName)
  React.useEffect(() => {
    if (!isMobile || mobileStage !== "page-content" || settingsSlug !== "skills.installed" || skillsPane !== "installed") {
      return
    }
    const detail = getSettingsDetailHistoryEntry(getCurrentHistoryState())
    if (detail?.page === "skills.installed" && selectedSkillName && detail.skillName !== selectedSkillName) {
      recordSplitDetailHistory("skills.installed", "installed")
    }
  }, [isMobile, mobileStage, selectedSkillName, settingsSlug, skillsPane])

  const handleOpenPageSidebar = React.useCallback(() => {
    setMobileStage("page-sidebar")
  }, [])

  const renderSettingsNav = () => {
    return (
      <nav aria-label={t("settings.view.home.title")} data-settings-navigation className="flex h-full flex-col overflow-hidden">
        <div className="px-2 pt-3">
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
            />
            <Input
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              placeholder={t("settings.view.nav.searchPlaceholder")}
              className="h-7 pl-8 w-full"
            />
          </div>
        </div>

        {/* Scrollable nav items */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="flex flex-col gap-0.5 pt-2 pb-2 px-2">
            {navSearchablePages.length === 0 && (
              <div className="px-2 py-3 typography-meta text-muted-foreground">
                {t("settings.view.nav.searchNoResults")}
              </div>
            )}
            {navGroups.map(group => (
              <div key={group.id} role="group" aria-labelledby={`${navId}-${group.id}`} data-settings-group={group.id}
                className="space-y-0.5 first:mt-0 mt-3">
                <h2 id={`${navId}-${group.id}`} className="px-2 pb-1 typography-micro font-medium text-muted-foreground">
                  {t(group.titleKey)}
                </h2>
                {group.pages.map((page) => {
                  const selected = navSearching ? settingsSlug === page.slug : activeFamily.includes(page.slug)
                  const iconName = getSettingsNavIcon(page.slug)
                  if (!iconName) return null

                  return (
                    <Tooltip key={page.slug}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => openPage(page.slug)}
                          aria-current={selected ? "page" : undefined}
                          className={cn(
                            "flex h-8 w-full items-center gap-2 rounded-md px-2 overflow-hidden",
                            selected
                              ? "bg-interactive-selection text-foreground"
                              : "text-foreground hover:bg-interactive-hover",
                          )}
                        >
                          <Icon name={iconName} className="h-4 w-4 shrink-0" />
                          <span className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden transition-opacity duration-150 opacity-100">
                            <span className="typography-ui-label font-normal truncate">{getPageTitle(page.slug)}</span>
                          </span>
                        </button>
                      </TooltipTrigger>
                    </Tooltip>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="overflow-hidden transition-opacity duration-150 opacity-100">
          <div className="border-t border-border bg-sidebar px-2 py-1 space-y-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-7 w-full items-center gap-2 rounded-md px-2 overflow-hidden whitespace-nowrap",
                    "typography-ui-label font-semibold text-sidebar-foreground/90",
                    "hover:text-sidebar-foreground hover:bg-interactive-hover",
                  )}
                  onClick={() =>
                    void reloadAxCodeConfiguration({
                      message: "Restarting AX Code…",
                      mode: "projects",
                      scopes: ["all"],
                    })
                  }
                >
                  <Icon name="restart" className="h-4 w-4 shrink-0" />
                  <span>{t("settings.view.actions.reloadAxCode")}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("settings.view.actions.reloadAxCodeTooltip")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </nav>
    )
  }

  const renderMobileStage = () => {
    if (mobileStage === "nav") {
      return (
        <div className="flex-1 min-h-0 overflow-hidden bg-sidebar">
          <div className="flex h-full min-h-0 flex-col">
            <ErrorBoundary>{renderSettingsNav()}</ErrorBoundary>
          </div>
        </div>
      )
    }

    if (!activePageMeta) {
      return <div className="flex-1 bg-background" />
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {renderFamilyTabs()}
        {renderMobilePage(activePageMeta)}
      </div>
    )
  }

  const renderMobilePage = (activePageMeta: SettingsPageMeta) => {
    if (mobileStage === "page-sidebar") {
      if (activePageMeta.kind !== "split") {
        // No sidebar available; fall back to direct content.
        const fallback = renderPageContent(settingsSlug)
        return (
          <div className="flex-1 min-h-0 overflow-hidden bg-background">
            <ErrorBoundary>{fallback}</ErrorBoundary>
          </div>
        )
      }
      return (
        <div className="flex-1 min-h-0 overflow-hidden bg-sidebar">
          <ErrorBoundary>
            {renderPageSidebar(settingsSlug, { onItemSelect: handleMobilePageSidebarItemSelect })}
          </ErrorBoundary>
        </div>
      )
    }

    // page-content
    const content = renderPageContent(settingsSlug)

    return (
      <div className="flex-1 min-h-0 overflow-hidden bg-background">
        <ErrorBoundary>{content}</ErrorBoundary>
      </div>
    )
  }

  // The pages that share this navigation entry, as links: each is a page of its own, not a panel of one page.
  // Hidden when the page stands alone.
  const renderFamilyTabs = () => {
    if (familyTabs.length < 2 || !familyTabs.some(page => page.slug === settingsSlug)) return null
    return (
      <nav
        aria-label={getPageTitle(familyTabs[0].slug)}
        data-settings-family-tabs
        className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/60 bg-background px-3 py-1.5"
      >
        {familyTabs.map(page => {
          const active = page.slug === settingsSlug
          return (
            <button
              key={page.slug}
              type="button"
              aria-current={active ? "page" : undefined}
              // The current page is already open; opening it again would send a phone back to the page's list.
              onClick={() => (active ? undefined : openPage(page.slug))}
              className={cn(
                "h-7 rounded-md px-2.5 typography-ui-label",
                active
                  ? "bg-interactive-selection text-foreground"
                  : "text-muted-foreground hover:bg-interactive-hover hover:text-foreground",
              )}
            >
              {getPageTitle(page.slug)}
            </button>
          )
        })}
      </nav>
    )
  }

  const renderDesktopContent = () => {
    if (!activePageMeta || settingsSlug === "home") {
      return <SettingsHome onOpen={openPage} />
    }
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {renderFamilyTabs()}
        <div className="min-h-0 flex-1 overflow-hidden">{renderDesktopPage(activePageMeta)}</div>
      </div>
    )
  }

  const renderDesktopPage = (activePageMeta: SettingsPageMeta) => {

    if (activePageMeta.kind === "split" && !skillsCatalogFullWidth) {
      return (
        <div className="flex h-full min-h-0 overflow-hidden">
          <div
            className="w-[264px] min-w-[264px] border-r bg-sidebar"
            style={{ borderColor: "var(--interactive-border)" }}
          >
            <ErrorBoundary>{renderPageSidebar(settingsSlug, {})}</ErrorBoundary>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden bg-background">
            <ErrorBoundary>{renderPageContent(settingsSlug)}</ErrorBoundary>
          </div>
        </div>
      )
    }

    return (
      <div className="h-full min-h-0 overflow-hidden bg-background">
        <ErrorBoundary>{renderPageContent(settingsSlug)}</ErrorBoundary>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      data-settings-view="true"
      className={cn("relative flex h-full min-h-0 flex-col overflow-hidden bg-background")}
    >
      {isMobile ? (
        <div
          className={cn("flex items-center gap-2 px-3 py-2 border-b", "bg-background")}
          style={{ borderColor: "var(--interactive-border)" }}
        >
          <button
            type="button"
            onClick={showBackButton ? handleBack : onClose}
            aria-label={mobileBackButtonLabel}
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="arrow-left-s" className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 typography-ui-label font-medium text-foreground truncate">
            {mobileStage === "nav"
              ? t("settings.view.home.title")
              : activePageMeta
                ? getPageTitle(activePageMeta.slug)
                : t("settings.view.home.title")}
          </div>

          {showOpenPageSidebarButton && (
            <button
              type="button"
              onClick={handleOpenPageSidebar}
              aria-label={t("settings.view.actions.openSectionList")}
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon name="list-unordered" className="h-5 w-5" />
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("settings.view.actions.closeSettings")}
              title={t("settings.view.actions.closeSettings")}
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          )}
        </div>
      ) : (
        <>
          {showBackButton && (
            <div className={cn("absolute left-3 z-50", isWindowed ? "top-2" : "top-3")}>
              <button
                type="button"
                onClick={handleBack}
                aria-label={t("settings.view.actions.back")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon name="arrow-left-s" className="h-5 w-5" />
              </button>
            </div>
          )}

          {onClose && (
            <div className={cn("absolute right-0.5 z-50", isWindowed ? "top-0.5" : "top-1")}>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("settings.view.actions.closeSettings")}
                title={t("settings.view.actions.closeSettings")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
          )}
        </>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {isMobile ? (
          renderMobileStage()
        ) : (
          <>
            <div
              className={cn(
                "relative flex h-full min-h-0 flex-col overflow-hidden border-r",
                "bg-sidebar",
                isResizing ? "" : "transition-[width,min-width] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
              )}
              style={{
                width: `${navWidth}px`,
                minWidth: `${navWidth}px`,
                borderColor: "var(--interactive-border)",
              }}
            >
              <div
                className={cn(
                  "absolute right-0 top-0 z-20 h-full w-[6px] -mr-[3px] cursor-col-resize",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
                  isResizing ? "bg-primary/30" : "bg-transparent hover:bg-primary/20",
                )}
                tabIndex={0}
                onPointerDown={handlePointerDown}
                onKeyDown={handleResizeKeyDown}
                role="separator"
                aria-orientation="vertical"
                aria-valuemin={SETTINGS_NAV_MIN_WIDTH}
                aria-valuemax={SETTINGS_NAV_MAX_WIDTH}
                aria-valuenow={navWidth}
                aria-label={t("settings.view.actions.resizeNavigation")}
              />
              <ErrorBoundary>{renderSettingsNav()}</ErrorBoundary>
            </div>

            <div className="flex-1 overflow-hidden bg-background">{renderDesktopContent()}</div>
          </>
        )}
      </div>
    </div>
  )
}
