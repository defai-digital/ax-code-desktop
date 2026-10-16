import React from "react"
import { DIRECTORY_SELECTION_CANCELLED } from "@/lib/desktop"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useGitIdentitiesStore } from "@/stores/useGitIdentitiesStore"
import { useFileSystemAccess } from "@/hooks/useFileSystemAccess"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui"
import { IdentityDropdown } from "@/components/views/git/GitHeader"
import { useDeviceInfo } from "@/lib/device"
import { MobileOverlayPanel } from "@/components/ui/MobileOverlayPanel"
import { Icon } from "@/components/icon/Icon"
import { axCodeClient } from "@/lib/ax-code/client"
import { API_ENDPOINTS } from "@/lib/http"
import { setDirectoryShowHidden, useDirectoryShowHidden } from "@/lib/directoryShowHidden"
import { useI18n } from "@/lib/i18n"
import { normalizeDirectoryExplorerProjectPathKey as normalizeDirectoryPath } from "./DirectoryExplorerDialog-paths"
import { inspectGitRepositories, type GitRepositoryHints } from "@/lib/gitApi"
import { isChildHintDismissed, useRepositoryHintStore } from "@/stores/useRepositoryHintStore"

interface DirectoryExplorerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Which mode the dialog opens in; "clone" shows the repository URL field first. */
  initialMode?: "browse" | "clone"
}

type BrowseEntry = {
  name: string
  path: string
}

type BrowseRow =
  | { type: "up"; value: "browse:up"; name: string; path: string | null; added?: false }
  // `added` only means "already a project": the folder stays browsable, because projects are often
  // nested (a ~/code project with repositories under it) and a subfolder is a valid project too.
  | { type: "directory"; value: string; name: string; path: string; added: boolean }

const isRootPath = (value: string): boolean => value === "/"

const normalizeSeparators = (value: string): string => value.replace(/\\/g, "/")

const trimTrailingSeparators = (value: string): string => {
  if (!value || isRootPath(value)) return value
  let result = value
  while (result.length > 1 && result.endsWith("/")) {
    result = result.slice(0, -1)
  }
  return result
}

const hasTrailingPathSeparator = (value: string): boolean => value.endsWith("/")

const ensureBrowseDirectoryPath = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed || hasTrailingPathSeparator(trimmed)) return trimmed
  return `${trimmed}/`
}

const getLastPathSeparatorIndex = (value: string): number => value.lastIndexOf("/")

const getBrowseDirectoryPath = (value: string): string => {
  if (hasTrailingPathSeparator(value)) return value
  const lastSeparator = getLastPathSeparatorIndex(value)
  if (lastSeparator < 0) return value
  return value.slice(0, lastSeparator + 1)
}

const getBrowseLeafPathSegment = (value: string): string => {
  const lastSeparator = getLastPathSeparatorIndex(value)
  return value.slice(lastSeparator + 1)
}

const getBrowseParentPath = (value: string): string | null => {
  const trimmed = trimTrailingSeparators(value.trim())
  if (!trimmed || trimmed === "~" || trimmed === "~/" || trimmed === "/") return null
  const lastSeparator = getLastPathSeparatorIndex(trimmed)
  if (lastSeparator < 0) return null
  if (trimmed.startsWith("~/") && lastSeparator <= 1) return "~/"
  if (lastSeparator === 0) return "/"
  return `${trimmed.slice(0, lastSeparator)}/`
}

const canNavigateUp = (value: string): boolean => hasTrailingPathSeparator(value) && getBrowseParentPath(value) !== null

const appendBrowsePathSegment = (currentPath: string, segment: string): string =>
  `${getBrowseDirectoryPath(currentPath)}${segment}/`

const displayPathToAbsolutePath = (value: string, homeDirectory: string): string => {
  const trimmed = value.trim()
  if (trimmed === "~") return homeDirectory
  if (trimmed.startsWith("~/")) return `${homeDirectory}${trimmed.slice(1)}`
  return trimmed
}

const isPrimaryModifierPressed = (event: React.KeyboardEvent<HTMLInputElement>): boolean => {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

const focusPathInput = (input: HTMLInputElement | null): void => {
  if (!input) return
  input.focus({ preventScroll: true })
  const valueLength = input.value.length
  input.setSelectionRange(valueLength, valueLength)
  input.scrollLeft = input.scrollWidth
}

const resolveFreshFilesystemHome = async (): Promise<string | null> => {
  try {
    const response = await fetch(API_ENDPOINTS.fs.home, {
      method: "GET",
      headers: { Accept: "application/json" },
    })
    if (response.ok) {
      const data = (await response.json()) as { home?: unknown }
      if (typeof data.home === "string" && data.home.trim().length > 0) {
        return normalizeSeparators(data.home.trim())
      }
    }
  } catch {
    // Fall back to the client helper below.
  }

  return axCodeClient.getFilesystemHome().catch(() => null)
}

export const DirectoryExplorerDialog: React.FC<DirectoryExplorerDialogProps> = ({
  open,
  onOpenChange,
  initialMode = "browse",
}) => {
  const { t } = useI18n()
  const homeDirectory = useDirectoryStore((s) => s.homeDirectory)
  const projects = useProjectsStore((s) => s.projects)
  const addProject = useProjectsStore((s) => s.addProject)
  const gitIdentityProfiles = useGitIdentitiesStore((s) => s.profiles)
  const globalGitIdentity = useGitIdentitiesStore((s) => s.globalIdentity)
  const defaultGitIdentityId = useGitIdentitiesStore((s) => s.defaultGitIdentityId)
  const loadGitIdentityProfiles = useGitIdentitiesStore((s) => s.loadProfiles)
  const loadGlobalGitIdentity = useGitIdentitiesStore((s) => s.loadGlobalIdentity)
  const loadDefaultGitIdentityId = useGitIdentitiesStore((s) => s.loadDefaultGitIdentityId)
  const showHidden = useDirectoryShowHidden()
  const { isDesktop, requestAccess, startAccessing } = useFileSystemAccess()
  const { isMobile } = useDeviceInfo()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const addButtonRef = React.useRef<HTMLButtonElement>(null)
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>())
  const [dialogHomeDirectory, setDialogHomeDirectory] = React.useState("")
  const [query, setQuery] = React.useState("~/")
  const [entries, setEntries] = React.useState<BrowseEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [isBrowseDirectoryMissing, setIsBrowseDirectoryMissing] = React.useState(false)
  const [highlightedIndex, setHighlightedIndex] = React.useState(0)
  const [isConfirming, setIsConfirming] = React.useState(false)
  const [isOpeningFinder, setIsOpeningFinder] = React.useState(false)
  const [addButtonWidth, setAddButtonWidth] = React.useState(0)
  const [isCloneMode, setIsCloneMode] = React.useState(false)
  const [cloneRemoteUrl, setCloneRemoteUrl] = React.useState("")
  const [selectedGitIdentityId, setSelectedGitIdentityId] = React.useState<string | null>(null)

  const explorerRootDirectory = dialogHomeDirectory || homeDirectory

  const addedProjectPaths = React.useMemo(
    () =>
      new Set(
        projects.map((project) => normalizeDirectoryPath(project.path)).filter((path): path is string => Boolean(path)),
      ),
    [projects],
  )

  React.useEffect(() => {
    if (!open) return
    setQuery("~/")
    setEntries([])
    setHighlightedIndex(0)
    setIsConfirming(false)
    setIsOpeningFinder(false)
    setIsCloneMode(initialMode === "clone")
    setCloneRemoteUrl("")
    setSelectedGitIdentityId(null)
    requestAnimationFrame(() => focusPathInput(inputRef.current))

    let cancelled = false
    const resolveHome = async () => {
      const resolved = await resolveFreshFilesystemHome()
      if (cancelled) return
      setDialogHomeDirectory(resolved || homeDirectory || "")
      requestAnimationFrame(() => focusPathInput(inputRef.current))
    }
    void resolveHome()
    return () => {
      cancelled = true
    }
  }, [homeDirectory, initialMode, open])

  React.useEffect(() => {
    if (!open) return
    void loadGitIdentityProfiles()
    void loadGlobalGitIdentity()
    void loadDefaultGitIdentityId()
  }, [loadDefaultGitIdentityId, loadGitIdentityProfiles, loadGlobalGitIdentity, open])

  const availableGitIdentities = React.useMemo(() => {
    const unique = new Map<string, NonNullable<typeof globalGitIdentity>>()
    if (globalGitIdentity) {
      unique.set(globalGitIdentity.id, globalGitIdentity)
    }
    for (const profile of gitIdentityProfiles) {
      unique.set(profile.id, profile)
    }
    return Array.from(unique.values())
  }, [gitIdentityProfiles, globalGitIdentity])

  React.useEffect(() => {
    if (!open || !isCloneMode || selectedGitIdentityId !== null) return
    const defaultId = typeof defaultGitIdentityId === "string" ? defaultGitIdentityId.trim() : ""
    if (defaultId && availableGitIdentities.some((identity) => identity.id === defaultId)) {
      setSelectedGitIdentityId(defaultId)
      return
    }
    const firstSshIdentity = availableGitIdentities.find((identity) => identity.authType === "ssh" || identity.sshKey)
    if (firstSshIdentity) {
      setSelectedGitIdentityId(firstSshIdentity.id)
    }
  }, [availableGitIdentities, defaultGitIdentityId, isCloneMode, open, selectedGitIdentityId])

  const selectedGitIdentity = React.useMemo(
    () => availableGitIdentities.find((identity) => identity.id === selectedGitIdentityId) ?? null,
    [availableGitIdentities, selectedGitIdentityId],
  )

  const browseDirectoryDisplayPath = React.useMemo(() => getBrowseDirectoryPath(query), [query])
  const browseFilterQuery = React.useMemo(
    () => (hasTrailingPathSeparator(query) ? "" : getBrowseLeafPathSegment(query)),
    [query],
  )
  const browseDirectoryAbsolutePath = React.useMemo(
    () => (explorerRootDirectory ? displayPathToAbsolutePath(browseDirectoryDisplayPath, explorerRootDirectory) : ""),
    [browseDirectoryDisplayPath, explorerRootDirectory],
  )

  React.useEffect(() => {
    if (!open || !browseDirectoryAbsolutePath) {
      setEntries([])
      return
    }

    let cancelled = false
    setIsLoading(true)
    setIsBrowseDirectoryMissing(false)
    axCodeClient
      .listLocalDirectory(browseDirectoryAbsolutePath)
      .then((result) => {
        if (cancelled) return
        setIsBrowseDirectoryMissing(false)
        const nextEntries = result
          .filter((entry) => entry.isDirectory)
          .map((entry) => ({
            name: entry.name,
            path: normalizeSeparators(entry.path),
          }))
          .sort((left, right) => left.name.localeCompare(right.name))
        setEntries(nextEntries)
      })
      .catch(() => {
        if (!cancelled) {
          setEntries([])
          setIsBrowseDirectoryMissing(true)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [browseDirectoryAbsolutePath, open])

  const filteredEntries = React.useMemo(() => {
    const lowerFilter = browseFilterQuery.toLowerCase()
    const includeHidden = showHidden || browseFilterQuery.startsWith(".")
    return entries.filter(
      (entry) => entry.name.toLowerCase().startsWith(lowerFilter) && (includeHidden || !entry.name.startsWith(".")),
    )
  }, [browseFilterQuery, entries, showHidden])

  // Repository hints for the folder being browsed: which subfolders are repositories, and which
  // repository this folder sits inside. Failures only hide the hints.
  const [repoHints, setRepoHints] = React.useState<GitRepositoryHints | null>(null)
  React.useEffect(() => {
    setRepoHints(null)
    if (!open || isCloneMode || !browseDirectoryAbsolutePath) return
    let cancelled = false
    inspectGitRepositories(browseDirectoryAbsolutePath)
      .then((hints) => {
        if (!cancelled) setRepoHints(hints)
      })
      .catch(() => {
        if (!cancelled) setRepoHints(null)
      })
    return () => {
      cancelled = true
    }
  }, [browseDirectoryAbsolutePath, isCloneMode, open])
  const repositoryNames = React.useMemo(
    () => new Set((repoHints?.childRepositories ?? []).map((repo) => repo.name)),
    [repoHints],
  )
  const dismissedChildren = useRepositoryHintStore((state) => state.dismissedChildren)
  const dismissedParent = useRepositoryHintStore((state) => state.dismissedParent)
  const dismissChildrenHint = useRepositoryHintStore((state) => state.dismissChildren)
  const dismissParentHint = useRepositoryHintStore((state) => state.dismissParent)
  const hintFolderKey = normalizeDirectoryPath(browseDirectoryAbsolutePath) ?? browseDirectoryAbsolutePath
  // Subfolder repositories by the browsed entry path, so "Add all" adds the same paths quick add would.
  const repositoriesToAdd = React.useMemo(() => {
    if (!repoHints) return []
    return entries
      .filter((entry) => repositoryNames.has(entry.name))
      .map((entry) => entry.path)
      .filter((entryPath) => {
        const normalized = normalizeDirectoryPath(entryPath)
        return !(normalized && addedProjectPaths.has(normalized))
      })
  }, [addedProjectPaths, entries, repoHints, repositoryNames])
  const browsedFolderIsRepository = Boolean(
    repoHints?.gitRoot && normalizeDirectoryPath(repoHints.gitRoot) === normalizeDirectoryPath(repoHints.directory),
  )
  const showChildrenHint =
    Boolean(repoHints) &&
    !browsedFolderIsRepository &&
    repositoryNames.size >= 2 &&
    repositoriesToAdd.length > 0 &&
    !isChildHintDismissed(dismissedChildren, hintFolderKey, Array.from(repositoryNames))
  const parentRepository = repoHints?.gitRoot && !browsedFolderIsRepository ? repoHints.gitRoot : null
  const parentRepositoryKey = parentRepository ? normalizeDirectoryPath(parentRepository) : null
  const showParentHint = Boolean(
    parentRepository &&
      parentRepositoryKey &&
      !addedProjectPaths.has(parentRepositoryKey) &&
      dismissedParent[hintFolderKey] !== parentRepository,
  )

  const rows = React.useMemo<BrowseRow[]>(() => {
    const nextRows: BrowseRow[] = []
    if (canNavigateUp(query)) {
      nextRows.push({ type: "up", value: "browse:up", name: "..", path: getBrowseParentPath(query) })
    }
    for (const entry of filteredEntries) {
      const normalized = normalizeDirectoryPath(entry.path)
      nextRows.push({
        type: "directory",
        value: `browse:${entry.path}`,
        name: entry.name,
        path: entry.path,
        added: Boolean(normalized && addedProjectPaths.has(normalized)),
      })
    }
    return nextRows
  }, [addedProjectPaths, filteredEntries, query])

  React.useEffect(() => {
    setHighlightedIndex(0)
  }, [query, rows.length])

  const targetPath = React.useMemo(() => {
    if (!explorerRootDirectory) return ""
    return trimTrailingSeparators(displayPathToAbsolutePath(query, explorerRootDirectory))
  }, [explorerRootDirectory, query])
  const normalizedTargetPath = normalizeDirectoryPath(targetPath)
  const isAlreadyAdded = Boolean(normalizedTargetPath && addedProjectPaths.has(normalizedTargetPath))
  const exactEntry = React.useMemo(() => {
    if (!browseFilterQuery) return null
    return filteredEntries.find((entry) => entry.name === browseFilterQuery) ?? null
  }, [browseFilterQuery, filteredEntries])
  const shouldCreateTarget = Boolean(
    targetPath &&
      !isAlreadyAdded &&
      ((hasTrailingPathSeparator(query) && isBrowseDirectoryMissing) ||
        (!hasTrailingPathSeparator(query) && browseFilterQuery.trim().length > 0 && exactEntry === null)),
  )
  const canAddProject = !isConfirming && !isOpeningFinder && !isAlreadyAdded && Boolean(targetPath)
  const canSubmitClone = canAddProject && cloneRemoteUrl.trim().length > 0
  const highlightedRow = rows[highlightedIndex] ?? null
  const hasHighlightedBrowseItem = Boolean(highlightedRow)
  const submitModifierLabel =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"
  const submitActionLabel = isAlreadyAdded
    ? t("directoryExplorerDialog.actions.alreadyAdded")
    : isCloneMode
      ? isConfirming
        ? t("directoryExplorerDialog.actions.cloning")
        : t("directoryExplorerDialog.actions.cloneAndAdd")
      : isConfirming
        ? t("directoryExplorerDialog.actions.adding")
        : shouldCreateTarget
          ? t("directoryExplorerDialog.actions.createAndAdd")
          : t("directoryExplorerDialog.actions.addProject")

  React.useLayoutEffect(() => {
    const button = addButtonRef.current
    if (!button) return

    const updateWidth = () => setAddButtonWidth(Math.ceil(button.getBoundingClientRect().width))
    updateWidth()

    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(updateWidth)
    observer.observe(button)
    return () => observer.disconnect()
  }, [submitActionLabel])

  React.useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.scrollLeft = input.scrollWidth
  }, [addButtonWidth, query])

  React.useLayoutEffect(() => {
    if (!open) return
    focusPathInput(inputRef.current)
  }, [open])

  React.useLayoutEffect(() => {
    const row = rows[highlightedIndex]
    if (!row) return
    rowRefs.current.get(row.value)?.scrollIntoView({ block: "nearest" })
  }, [highlightedIndex, rows])

  const handleClose = React.useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const handleQuickAdd = React.useCallback(
    (event: React.MouseEvent, path: string) => {
      event.stopPropagation()
      const normalized = normalizeDirectoryPath(path)
      if (normalized && addedProjectPaths.has(normalized)) return
      const added = addProject(path)
      if (!added) {
        toast.error(t("directoryExplorerDialog.toast.failedToAddProject"), {
          description: t("directoryExplorerDialog.toast.selectValidDirectoryPath"),
        })
      }
    },
    [addProject, addedProjectPaths, t],
  )

  const handleAddRepositories = React.useCallback(() => {
    let added = 0
    for (const repositoryPath of repositoriesToAdd) {
      if (addProject(repositoryPath)) added += 1
    }
    if (added > 0) {
      toast.success(t("directoryExplorerDialog.repoHint.addedChildren", { count: String(added) }))
    }
  }, [addProject, repositoriesToAdd, t])

  const handleAddParentRepository = React.useCallback(() => {
    if (!parentRepository) return
    if (!addProject(parentRepository)) {
      toast.error(t("directoryExplorerDialog.toast.failedToAddProject"))
    }
  }, [addProject, parentRepository, t])

  const finalizeSelection = React.useCallback(
    async (target: string) => {
      if (!target || isConfirming) return
      const normalized = normalizeDirectoryPath(target)
      if (normalized && addedProjectPaths.has(normalized)) return
      let selectedTarget = target

      setIsConfirming(true)
      try {
        const shouldCreateSelection =
          !isCloneMode && shouldCreateTarget && normalizeDirectoryPath(target) === normalizeDirectoryPath(targetPath)
        if (isCloneMode) {
          const remoteUrl = cloneRemoteUrl.trim()
          if (!remoteUrl) {
            toast.error(t("directoryExplorerDialog.toast.cloneUrlRequired"))
            return
          }
          const result = await axCodeClient.cloneRepository({
            remoteUrl,
            destinationPath: target,
            gitIdentityId: selectedGitIdentity?.id ?? null,
          })
          selectedTarget = result.path
        } else if (shouldCreateSelection) {
          await axCodeClient.createDirectory(target, { allowOutsideWorkspace: true })
        }
        const added = addProject(selectedTarget)
        if (!added) {
          toast.error(t("directoryExplorerDialog.toast.failedToAddProject"), {
            description: t("directoryExplorerDialog.toast.selectValidDirectoryPath"),
          })
          return
        }
        handleClose()
      } catch (error) {
        toast.error(t("directoryExplorerDialog.toast.failedToSelectDirectory"), {
          description: error instanceof Error ? error.message : t("directoryExplorerDialog.toast.unknownError"),
        })
      } finally {
        setIsConfirming(false)
      }
    },
    [
      addProject,
      addedProjectPaths,
      cloneRemoteUrl,
      handleClose,
      isCloneMode,
      isConfirming,
      selectedGitIdentity?.id,
      shouldCreateTarget,
      targetPath,
      t,
    ],
  )

  const browseToDisplayPath = React.useCallback((displayPath: string) => {
    setQuery(ensureBrowseDirectoryPath(displayPath))
  }, [])

  const browseToEntry = React.useCallback(
    (entry: BrowseEntry) => {
      setQuery(appendBrowsePathSegment(query, entry.name))
    },
    [query],
  )

  const executeRow = React.useCallback(
    (row: BrowseRow | null) => {
      if (!row) return
      if (row.type === "up") {
        if (row.path) browseToDisplayPath(row.path)
        return
      }
      browseToEntry(row)
    },
    [browseToDisplayPath, browseToEntry],
  )

  const handleOpenInFinder = React.useCallback(async () => {
    if (!isDesktop || isOpeningFinder) return
    setIsOpeningFinder(true)
    try {
      const result = await requestAccess(targetPath, { title: t("directoryExplorerDialog.title") })
      if (!result.success || !result.path) {
        if (result.error && result.error !== DIRECTORY_SELECTION_CANCELLED) {
          toast.error(t("directoryExplorerDialog.toast.failedToSelectDirectory"), {
            description: result.error,
          })
        }
        return
      }

      const accessResult = await startAccessing(result.path)
      if (!accessResult.success) {
        toast.error(t("directoryExplorerDialog.toast.failedToOpenDirectory"), {
          description: accessResult.error || t("directoryExplorerDialog.toast.desktopCouldNotGrantAccess"),
        })
        return
      }

      await finalizeSelection(result.path)
    } catch (error) {
      toast.error(t("directoryExplorerDialog.toast.failedToSelectDirectory"), {
        description: error instanceof Error ? error.message : t("directoryExplorerDialog.toast.unknownError"),
      })
    } finally {
      setIsOpeningFinder(false)
    }
  }, [finalizeSelection, isDesktop, isOpeningFinder, requestAccess, startAccessing, t, targetPath])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setHighlightedIndex((index) => Math.min(rows.length - 1, index + 1))
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setHighlightedIndex((index) => Math.max(0, index - 1))
        return
      }
      if (event.key === "Enter") {
        event.preventDefault()
        if (isPrimaryModifierPressed(event)) {
          void finalizeSelection(targetPath)
          return
        }
        if (hasHighlightedBrowseItem) {
          executeRow(highlightedRow)
        }
        return
      }
      if (event.key === "Backspace" && query === "") {
        event.preventDefault()
        handleClose()
      }
    },
    [
      executeRow,
      finalizeSelection,
      handleClose,
      hasHighlightedBrowseItem,
      highlightedRow,
      query,
      rows.length,
      targetPath,
    ],
  )

  const showHiddenToggle = (
    <button
      type="button"
      onClick={() => setDirectoryShowHidden(!showHidden)}
      className="flex flex-shrink-0 items-center gap-2 rounded-lg px-2 py-1 typography-meta text-muted-foreground transition-colors hover:bg-interactive-hover/40"
    >
      {showHidden ? (
        <Icon name="checkbox" className="h-4 w-4 text-primary" />
      ) : (
        <Icon name="checkbox-blank" className="h-4 w-4" />
      )}
      {t("directoryExplorerDialog.toggle.showHidden")}
    </button>
  )

  const inputSection = (
    <div className="px-2.5 py-1.5">
      {isCloneMode ? (
        <div className="mb-1.5 flex items-center gap-1.5">
          <Input
            value={cloneRemoteUrl}
            onChange={(event) => setCloneRemoteUrl(event.target.value)}
            placeholder={t("directoryExplorerDialog.clone.remoteUrlPlaceholder")}
            className="min-w-0 flex-1 border-border/60 bg-[var(--surface-elevated)] font-mono typography-ui-label shadow-none"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
          <IdentityDropdown
            activeProfile={selectedGitIdentity}
            identities={availableGitIdentities}
            onSelect={(profile) => setSelectedGitIdentityId(profile.id)}
            isApplying={isConfirming}
            iconOnly
          />
        </div>
      ) : null}
      <div className="relative">
        <Icon
          name="folder-add"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(normalizeSeparators(event.target.value))}
          onKeyDown={handleKeyDown}
          placeholder={t("directoryExplorerDialog.pathInput.placeholder")}
          className="border-transparent bg-transparent pl-9 font-mono typography-ui-label shadow-none focus-visible:ring-0"
          style={!isMobile && addButtonWidth > 0 ? { paddingRight: `${addButtonWidth + 24}px` } : undefined}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
        {!isMobile ? (
          <Button
            ref={addButtonRef}
            variant="outline"
            size="xs"
            tabIndex={-1}
            className="absolute right-1.5 top-1/2 h-7 -translate-y-1/2 gap-1 px-2 typography-meta"
            disabled={isCloneMode ? !canSubmitClone : !canAddProject}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void finalizeSelection(targetPath)}
            title={submitActionLabel}
          >
            {submitActionLabel}
          </Button>
        ) : null}
      </div>
    </div>
  )

  const repoHintSection =
    showChildrenHint || showParentHint ? (
      <div data-repository-hints className="mx-2.5 mb-1.5 flex flex-col gap-1">
        {showChildrenHint ? (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] px-2.5 py-1.5">
            <Icon name="git-repository" className="h-4 w-4 flex-shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate typography-meta text-foreground">
              {t("directoryExplorerDialog.repoHint.children", { count: String(repositoryNames.size) })}
            </span>
            <Button type="button" size="xs" onClick={handleAddRepositories} className="flex-shrink-0">
              {t("directoryExplorerDialog.repoHint.addChildren", { count: String(repositoriesToAdd.length) })}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="flex-shrink-0 text-muted-foreground"
              onClick={() => dismissChildrenHint(hintFolderKey, Array.from(repositoryNames))}
            >
              {t("directoryExplorerDialog.repoHint.dismiss")}
            </Button>
          </div>
        ) : null}
        {showParentHint && parentRepository ? (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] px-2.5 py-1.5">
            <Icon name="git-repository" className="h-4 w-4 flex-shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate typography-meta text-foreground">
              {t("directoryExplorerDialog.repoHint.parent", {
                name: parentRepository.split(/[\\/]/).filter(Boolean).pop() ?? parentRepository,
              })}
            </span>
            <Button type="button" size="xs" onClick={handleAddParentRepository} className="flex-shrink-0">
              {t("directoryExplorerDialog.repoHint.addParent")}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="flex-shrink-0 text-muted-foreground"
              onClick={() => dismissParentHint(hintFolderKey, parentRepository)}
            >
              {t("directoryExplorerDialog.repoHint.dismiss")}
            </Button>
          </div>
        ) : null}
      </div>
    ) : null

  const resultsSection = (
    <div className="surface-inset relative min-h-0 flex-1 overflow-hidden">
      <div className="max-h-[min(28rem,58vh)] overflow-y-auto p-2">
        <div className="px-2 pb-1 pt-0.5 typography-meta font-medium uppercase tracking-wide text-muted-foreground">
          {t("directoryExplorerDialog.browse.directories")}
        </div>
        {isLoading ? (
          <div className="py-10 text-center typography-ui-label text-muted-foreground">
            {t("directoryExplorerDialog.browse.loading")}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center typography-ui-label text-muted-foreground">
            {t("directoryExplorerDialog.browse.empty")}
          </div>
        ) : (
          <div className="space-y-0.5">
            {rows.map((row, index) => {
              const isActive = index === highlightedIndex
              // The quick-add is a sibling of the row, not a descendant: a button inside a button is invalid, and
              // screen readers flatten the inner one into the outer — so it was announced as the row and could not
              // be reached on its own.
              return (
                <div key={row.value} className="relative">
                <button
                  ref={(node) => {
                    if (node) {
                      rowRefs.current.set(row.value, node)
                    } else {
                      rowRefs.current.delete(row.value)
                    }
                  }}
                  type="button"
                  data-added={row.type === "directory" && row.added ? "true" : undefined}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => executeRow(row)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 pl-2 pr-8 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    isActive && "bg-interactive-selection text-interactive-selection-foreground",
                    !isActive && "hover:bg-interactive-hover/50",
                  )}
                >
                  {row.type === "up" ? (
                    <Icon name="arrow-left-s" className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <Icon
                      name={repositoryNames.has(row.name) ? "git-repository" : "folder-6"}
                      aria-label={
                        repositoryNames.has(row.name) ? t("directoryExplorerDialog.browse.repository") : undefined
                      }
                      className={cn(
                        "h-4 w-4 flex-shrink-0",
                        repositoryNames.has(row.name) ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                  )}
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span
                      className={cn(
                        "truncate typography-ui-label",
                        row.type === "directory" && row.added ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {row.name}
                    </span>
                  </span>
                  {row.type === "directory" && row.added ? (
                    <span className="rounded-full border border-border/60 px-2 py-0.5 typography-meta text-muted-foreground">
                      {t("directoryExplorerDialog.browse.addedBadge")}
                    </span>
                  ) : null}
                </button>
                {row.type === "directory" && !row.added ? (
                  <button
                    type="button"
                    onClick={(event) => handleQuickAdd(event, row.path)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-interactive-hover/60 hover:text-foreground"
                    title={t("directoryExplorerDialog.browse.quickAdd")}
                  >
                    <Icon name="add" className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  const content = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {inputSection}
      {repoHintSection}
      {resultsSection}
    </div>
  )

  const footerHints = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 typography-micro text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Icon name="arrow-up-s" className="h-3.5 w-3.5" />
        <Icon name="arrow-down-s" className="-ml-1 h-3.5 w-3.5" />
        {t("directoryExplorerDialog.footer.navigate")}
      </span>
      <span className="inline-flex items-center gap-1">
        <Icon name="corner-down-left" className="h-3.5 w-3.5" />
        {t("directoryExplorerDialog.footer.select")}
      </span>
      <span className="inline-flex items-center gap-1">
        <span>{submitModifierLabel}</span>
        <Icon name="corner-down-left" className="h-3.5 w-3.5" />
        {t("directoryExplorerDialog.footer.add")}
      </span>
    </div>
  )

  const renderFooter = () => (
    <>
      {!isMobile ? footerHints : null}
      <div className={cn("flex w-full flex-row justify-end gap-2 sm:w-auto", isMobile && "justify-stretch")}>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setIsCloneMode((value) => !value)}
          disabled={isConfirming || isOpeningFinder}
          className={cn(isMobile && "flex-1")}
        >
          {isCloneMode
            ? t("directoryExplorerDialog.actions.addLocalProject")
            : t("directoryExplorerDialog.actions.cloneRepository")}
        </Button>
        {isDesktop && !isCloneMode ? (
          <Button size="xs" className="gap-1" onClick={handleOpenInFinder} disabled={isConfirming || isOpeningFinder}>
            <Icon name="folder-add" className="h-3.5 w-3.5" />
            {isOpeningFinder
              ? t("directoryExplorerDialog.actions.openingFinder")
              : t("directoryExplorerDialog.actions.openInFinder")}
          </Button>
        ) : null}
        {isMobile ? (
          <Button
            size="xs"
            onClick={() => void finalizeSelection(targetPath)}
            disabled={isCloneMode ? !canSubmitClone : !canAddProject}
            className="flex-1"
          >
            {submitActionLabel}
          </Button>
        ) : null}
      </div>
    </>
  )

  if (isMobile) {
    return (
      <MobileOverlayPanel
        open={open}
        onClose={handleClose}
        title={t("directoryExplorerDialog.title")}
        className="h-[88dvh] max-h-[720px] max-w-full"
        contentMaxHeightClassName="flex-1"
        footer={<div className="flex flex-col gap-2">{renderFooter()}</div>}
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="flex justify-end">{showHiddenToggle}</div>
          {content}
        </div>
      </MobileOverlayPanel>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex w-full max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[80vh]"
        initialFocus={false}
      >
        <DialogHeader className="px-5 pb-2 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>{t("directoryExplorerDialog.title")}</DialogTitle>
              <DialogDescription className="mt-2">{t("directoryExplorerDialog.description")}</DialogDescription>
            </div>
            {showHiddenToggle}
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 px-2 pb-0">{content}</div>
        <DialogFooter className="flex w-full flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          {renderFooter()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
