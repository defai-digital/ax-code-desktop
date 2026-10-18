import React from "react"
import { cn, truncatePathMiddle } from "@/lib/utils"
import { useFileSearchStore } from "@/stores/useFileSearchStore"
import { useAgentsStore, filterVisibleAgents } from "@/stores/useAgentsStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useFilesViewTabsStore } from "@/stores/useFilesViewTabsStore"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { useChatSearchDirectory } from "@/hooks/useChatSearchDirectory"
import { useRuntimeAPIs } from "@/hooks/useRuntimeAPIs"
import type { ProjectFileSearchHit } from "@/lib/ax-code/client"
import { ScrollableOverlay } from "@/components/ui/ScrollableOverlay"
import { Icon } from "@/components/icon/Icon"
import { useDirectoryShowHidden } from "@/lib/directoryShowHidden"
import { useFilesViewShowGitignored } from "@/lib/filesViewShowGitignored"
import { useI18n } from "@/lib/i18n"
import {
  filesViewPathsEqual,
  getFilesViewDisplayPath,
  normalizeFilesViewPath,
} from "@/components/views/filesViewPathUtils"
import { toast } from "@/components/ui"
import { useTerminalStore } from "@/stores/useTerminalStore"
import { useInputStore } from "@/sync/input-store"
import { getTerminalSessionOutput } from "@/lib/terminalApi"
import { getCommitPatch } from "@/lib/gitApi"
import { collectUnverifiedPaths, filterStaleRecentPaths, findStaleRecentPaths } from "./mentionRecentFiles"
import {
  buildContextAttachmentFile,
  clipCommitSubject,
  commitEntriesFromLog,
  composeContextBody,
  contextMentionKindsForQuery,
  filterCommitEntries,
  resolveCommitContext,
  resolveTerminalContext,
  resolveUncommittedContext,
  shortCommitHash,
  terminalMentionTargets,
  type CommitMentionEntry,
  type ContextMentionGitClient,
  type TerminalMentionTarget,
} from "./contextMention"

type FileInfo = ProjectFileSearchHit
type AgentInfo = {
  name: string
  description?: string
  mode?: string | null
}

export interface FileMentionHandle {
  handleKeyDown: (key: string) => boolean
}

interface FileMentionAutocompleteProps {
  searchQuery: string
  /**
   * The directory to search, when the caller is not the open chat: the multi-run launcher works on the project it
   * has selected, and without this the mention list came from whatever session the chat happened to be showing.
   */
  directoryOverride?: string
  onFileSelect: (file: FileInfo) => void
  onAgentSelect?: (agentName: string) => void
  /** Attach terminal output, a git diff, or a commit as a text file chip. */
  onContextAttachment?: (file: File) => void
  onClose: () => void
  style?: React.CSSProperties
}

type ContextMenuEntry =
  | { type: "terminal"; target: TerminalMentionTarget | null }
  | { type: "diff" }
  | { type: "commit" }

export const FileMentionAutocomplete = React.forwardRef<FileMentionHandle, FileMentionAutocompleteProps>(
  ({ searchQuery, directoryOverride, onFileSelect, onAgentSelect, onContextAttachment, onClose, style }, ref) => {
    const { t } = useI18n()
    const chatDirectory = useChatSearchDirectory() ?? ""
    const currentDirectory = directoryOverride ?? chatDirectory
    const activeProjectId = useProjectsStore((state) => state.activeProjectId)
    const activeProjectPath = useProjectsStore(
      React.useCallback(
        (state) => state.projects.find((project) => project.id === activeProjectId)?.path ?? null,
        [activeProjectId],
      ),
    )
    const projectRoot = React.useMemo(() => {
      const candidate = currentDirectory || activeProjectPath
      const normalized = candidate ? normalizeFilesViewPath(candidate) : ""
      return normalized || null
    }, [activeProjectPath, currentDirectory])
    const projectTabs = useFilesViewTabsStore(
      React.useCallback(
        (state) => {
          if (!projectRoot) return undefined
          return (
            state.byRoot[projectRoot] ??
            Object.entries(state.byRoot).find(([root]) => filesViewPathsEqual(root, projectRoot))?.[1]
          )
        },
        [projectRoot],
      ),
    )
    // Subscribe to the list itself, not the getter: a getter's identity never changes, so the
    // effect below never re-ran and the mention list kept the agents of the directory that was
    // loaded when the popup opened - offering an agent that does not belong to this project.
    const configAgents = useAgentsStore((state) => state.agents)
    const removeUnselectedOpenPath = useFilesViewTabsStore((state) => state.removeUnselectedOpenPath)
    const { files: filesApi, git } = useRuntimeAPIs()
    const terminalDirectory = useTerminalStore((state) =>
      projectRoot ? state.getDirectoryState(projectRoot) : undefined,
    )
    const searchFiles = useFileSearchStore((state) => state.searchFiles)
    const debouncedQuery = useDebouncedValue(searchQuery, 180)
    const showHidden = useDirectoryShowHidden()
    const showGitignored = useFilesViewShowGitignored()
    const [files, setFiles] = React.useState<FileInfo[]>([])
    const [directories, setDirectories] = React.useState<FileInfo[]>([])
    const [agents, setAgents] = React.useState<AgentInfo[]>([])
    const [loading, setLoading] = React.useState(false)
    const pendingSearchRef = React.useRef(0)
    const [selectedIndex, setSelectedIndex] = React.useState(0)
    const selectedIndexRef = React.useRef(0)
    const [marqueeWidth, setMarqueeWidth] = React.useState(360)
    const [overflowMap, setOverflowMap] = React.useState<Record<number, boolean>>({})
    const [marqueeDurations, setMarqueeDurations] = React.useState<Record<number, number>>({})
    const [staleRecentPaths, setStaleRecentPaths] = React.useState<ReadonlySet<string>>(() => new Set())
    const [commitPickerOpen, setCommitPickerOpen] = React.useState(false)
    const [commitEntries, setCommitEntries] = React.useState<CommitMentionEntry[]>([])
    const [commitLoading, setCommitLoading] = React.useState(false)
    const attachingRef = React.useRef(false)
    const commitRequestRef = React.useRef(0)
    const verifiedPathsRef = React.useRef<Set<string>>(new Set())
    const itemRefs = React.useRef<(HTMLDivElement | null)[]>([])
    const labelRefs = React.useRef<(HTMLSpanElement | null)[]>([])
    const measureRefs = React.useRef<(HTMLSpanElement | null)[]>([])
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    const normalizedSearchQuery = (searchQuery ?? "").trim()
    const recentFiles = React.useMemo(() => {
      if (!projectRoot || !projectTabs) {
        return [] as FileInfo[]
      }

      const ordered = [projectTabs.selectedPath, ...projectTabs.openPaths.slice().reverse()].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )

      const seen = new Set<string>()
      const queryLower = normalizedSearchQuery.toLowerCase()
      const mapped = ordered
        .filter((filePath) => {
          if (seen.has(filePath)) return false
          seen.add(filePath)
          const relative = getFilesViewDisplayPath(projectRoot, filePath)
          if (!queryLower) return true
          return relative.toLowerCase().includes(queryLower)
        })
        .slice(0, 6)
        .map((filePath) => {
          const normalizedPath = normalizeFilesViewPath(filePath)
          const name = normalizedPath.split("/").filter(Boolean).pop() || normalizedPath
          const relativePath = getFilesViewDisplayPath(projectRoot, normalizedPath)
          return {
            name,
            path: normalizedPath,
            relativePath,
            extension: name.includes(".") ? name.split(".").pop()?.toLowerCase() : undefined,
          } satisfies FileInfo
        })

      return mapped
    }, [normalizedSearchQuery, projectRoot, projectTabs])

    const recentCandidatePathsKey = React.useMemo(
      () => recentFiles.map((file) => file.path).join("\n"),
      [recentFiles],
    )

    // Drop what went away since the tabs were opened. A rename is a deletion of the old path,
    // so it lands here too.
    React.useEffect(() => {
      setStaleRecentPaths(new Set())
      verifiedPathsRef.current.clear()
    }, [projectRoot])

    React.useEffect(() => {
      if (!projectRoot || !filesApi?.statFile || recentCandidatePathsKey.length === 0) {
        return
      }

      const candidatePaths = recentCandidatePathsKey.split("\n")
      const unverified = collectUnverifiedPaths(candidatePaths, verifiedPathsRef.current)
      if (unverified.length === 0) {
        return
      }

      let cancelled = false
      const statFile = filesApi.statFile

      void findStaleRecentPaths(unverified, (path) => statFile(path)).then((stale) => {
        if (cancelled) {
          return
        }
        for (const path of unverified) {
          verifiedPathsRef.current.add(path)
        }
        if (stale.size === 0) {
          return
        }

        setStaleRecentPaths((prev) => new Set([...prev, ...stale]))
        for (const path of stale) {
          removeUnselectedOpenPath(projectRoot, path)
        }
      })

      return () => {
        cancelled = true
      }
    }, [filesApi, projectRoot, recentCandidatePathsKey, removeUnselectedOpenPath])

    const visibleAgents = React.useMemo(
      () => (normalizedSearchQuery.length > 0 ? agents : agents.slice(0, 2)),
      [agents, normalizedSearchQuery.length],
    )
    const visibleDirectories = directories
    const visibleRecentFiles = React.useMemo(
      () => filterStaleRecentPaths(recentFiles, staleRecentPaths),
      [recentFiles, staleRecentPaths],
    )
    const visibleFiles = files
    const directory = currentDirectory || projectRoot || ""
    const contextGit = React.useMemo((): ContextMentionGitClient | null => {
      if (!git) return null
      return {
        getGitStatus: (repo, options) => git.getGitStatus(repo, options),
        getGitDiff: (repo, options) => git.getGitDiff(repo, options),
        getGitLog: (repo, options) => git.getGitLog(repo, options),
        getCommitPatch,
      }
    }, [git])
    const contextKinds = React.useMemo(
      () => (onContextAttachment ? contextMentionKindsForQuery(normalizedSearchQuery) : []),
      [normalizedSearchQuery, onContextAttachment],
    )
    const contextKindsKey = contextKinds.join(",")
    const terminalTargets = React.useMemo(() => terminalMentionTargets(terminalDirectory), [terminalDirectory])
    const terminalRowKey = terminalTargets.map((target) => target.tabId).join(",")
    const contextEntries = React.useMemo((): ContextMenuEntry[] => {
      if (!onContextAttachment || commitPickerOpen) return []
      const entries: ContextMenuEntry[] = []
      if (contextKinds.includes("terminal")) {
        if (terminalTargets.length === 0) {
          entries.push({ type: "terminal", target: null })
        } else {
          for (const target of terminalTargets) entries.push({ type: "terminal", target })
        }
      }
      if (contextKinds.includes("diff")) entries.push({ type: "diff" })
      if (contextKinds.includes("commit")) entries.push({ type: "commit" })
      return entries
    }, [commitPickerOpen, contextKinds, onContextAttachment, terminalTargets])
    const visibleCommits = filterCommitEntries(commitEntries, normalizedSearchQuery)
    const visibleCommitKey = visibleCommits.map((entry) => entry.hash).join(",")
    const contextOffset = contextEntries.length

    React.useEffect(() => {
      if (!contextKindsKey.split(",").filter(Boolean).includes("commit")) {
        setCommitPickerOpen(false)
      }
    }, [contextKindsKey])

    React.useEffect(() => {
      const handlePointerDown = (event: MouseEvent | TouchEvent) => {
        const target = event.target as Node | null
        if (!target || !containerRef.current) {
          return
        }
        if (containerRef.current.contains(target)) {
          return
        }
        onClose()
      }

      document.addEventListener("pointerdown", handlePointerDown, true)
      return () => {
        document.removeEventListener("pointerdown", handlePointerDown, true)
      }
    }, [onClose])

    React.useEffect(() => {
      if (!currentDirectory) {
        setFiles([])
        return
      }

      const normalizedQuery = (debouncedQuery ?? "").trim()
      const normalizedQueryLower = normalizedQuery.replace(/^\.\//, "").replace(/^\/+/, "").toLowerCase()

      if (!normalizedQueryLower) {
        setFiles([])
        return
      }

      let cancelled = false
      let settled = false
      pendingSearchRef.current++
      setLoading(true)

      searchFiles(currentDirectory, normalizedQueryLower, 80, {
        includeHidden: showHidden,
        respectGitignore: !showGitignored,
        type: "file",
      })
        .then((hits) => {
          if (cancelled) {
            return
          }

          const recentSet = new Set(visibleRecentFiles.map((file) => file.path))
          setFiles(hits.filter((hit) => !recentSet.has(hit.path)).slice(0, 15))
        })
        .catch(() => {
          if (!cancelled) {
            setFiles([])
          }
        })
        .finally(() => {
          settled = true
          if (!cancelled) {
            pendingSearchRef.current--
            if (pendingSearchRef.current <= 0) {
              pendingSearchRef.current = 0
              setLoading(false)
            }
          }
        })

      return () => {
        cancelled = true
        if (!settled) {
          pendingSearchRef.current = Math.max(0, pendingSearchRef.current - 1)
          if (pendingSearchRef.current <= 0) {
            setLoading(false)
          }
        }
      }
    }, [currentDirectory, debouncedQuery, visibleRecentFiles, searchFiles, showHidden, showGitignored])

    React.useEffect(() => {
      if (!currentDirectory) {
        setDirectories([])
        return
      }

      const normalizedQuery = (debouncedQuery ?? "").trim()
      const normalizedQueryLower = normalizedQuery.replace(/^\.\//, "").replace(/^\/+/, "").toLowerCase()

      if (!normalizedQueryLower) {
        setDirectories([])
        return
      }

      let cancelled = false
      let settled = false
      pendingSearchRef.current++
      setLoading(true)

      searchFiles(currentDirectory, normalizedQueryLower, 20, {
        includeHidden: showHidden,
        respectGitignore: !showGitignored,
        type: "directory",
      })
        .then((hits) => {
          if (!cancelled) {
            setDirectories(hits.slice(0, 10))
          }
        })
        .catch(() => {
          if (!cancelled) {
            setDirectories([])
          }
        })
        .finally(() => {
          settled = true
          if (!cancelled) {
            pendingSearchRef.current--
            if (pendingSearchRef.current <= 0) {
              pendingSearchRef.current = 0
              setLoading(false)
            }
          }
        })

      return () => {
        cancelled = true
        if (!settled) {
          pendingSearchRef.current = Math.max(0, pendingSearchRef.current - 1)
          if (pendingSearchRef.current <= 0) {
            setLoading(false)
          }
        }
      }
    }, [currentDirectory, debouncedQuery, searchFiles, showHidden, showGitignored])

    React.useEffect(() => {
      const visibleAgents = filterVisibleAgents(configAgents)
      const normalizedQuery = (searchQuery ?? "").trim().toLowerCase()
      const filtered = visibleAgents
        .filter((agent) => agent.mode && agent.mode !== "primary")
        .filter((agent) => {
          if (!normalizedQuery) return true
          const haystack = `${agent.name} ${agent.description ?? ""}`.toLowerCase()
          return haystack.includes(normalizedQuery)
        })
        .map((agent) => ({
          name: agent.name,
          description: agent.description,
          mode: agent.mode,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
      setAgents(filtered)
    }, [configAgents, searchQuery])

    React.useEffect(() => {
      setSelectedIndex(0)
      setOverflowMap({})
      setMarqueeDurations({})
    }, [
      visibleFiles,
      visibleDirectories,
      visibleRecentFiles.length,
      visibleAgents.length,
      contextKindsKey,
      contextOffset,
      commitPickerOpen,
      terminalRowKey,
      visibleCommitKey,
      // A search hides the file rows behind a spinner and drops them from the key sequence, so the selection has
      // to move onto the context rows that stay on screen: left on a hidden row, Enter wrapped modulo the shorter
      // list and attached a row that carried no selection.
      loading,
    ])

    React.useEffect(() => {
      selectedIndexRef.current = selectedIndex
    }, [selectedIndex])

    React.useEffect(() => {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: "nearest",
      })
    }, [selectedIndex])

    React.useEffect(() => {
      let frameId: number | null = null

      const updateOverflow = () => {
        if (frameId !== null) {
          cancelAnimationFrame(frameId)
        }
        frameId = requestAnimationFrame(() => {
          const next: Record<number, boolean> = {}
          const durations: Record<number, number> = {}
          labelRefs.current.forEach((node, index) => {
            if (!node) {
              return
            }
            const measureNode = measureRefs.current[index]
            const fullWidth = measureNode?.offsetWidth ?? node.scrollWidth
            const overflowPx = Math.max(0, fullWidth - node.clientWidth)
            const isOverflowing = overflowPx > 8
            next[index] = isOverflowing
            if (isOverflowing) {
              const duration = Math.max(0.6, overflowPx / 110)
              durations[index] = duration
            }
          })
          setOverflowMap(next)
          setMarqueeDurations(durations)
        })
      }

      updateOverflow()
      window.addEventListener("resize", updateOverflow)

      return () => {
        if (frameId !== null) {
          cancelAnimationFrame(frameId)
        }
        window.removeEventListener("resize", updateOverflow)
      }
    }, [visibleFiles, visibleDirectories])

    React.useEffect(() => {
      const labelNode = labelRefs.current[selectedIndex]
      if (!labelNode) {
        return
      }

      const updateWidth = () => {
        const width = labelNode.clientWidth
        if (width > 0) {
          setMarqueeWidth(width)
        }
      }

      updateWidth()

      if (typeof ResizeObserver === "undefined") {
        return
      }

      const observer = new ResizeObserver(updateWidth)
      observer.observe(labelNode)

      return () => {
        observer.disconnect()
      }
    }, [selectedIndex])

    const handleFileSelect = React.useCallback(
      (file: FileInfo) => {
        onFileSelect(file)
      },
      [onFileSelect],
    )

    const handleAgentPick = React.useCallback(
      (agentName: string) => {
        onAgentSelect?.(agentName)
      },
      [onAgentSelect],
    )

    const deliverContext = React.useCallback(
      (label: string, content: string, truncated: boolean, placement: "before" | "after") => {
        if (!onContextAttachment) return
        const note = truncated
          ? t(
              placement === "before"
                ? "chat.fileMentionAutocomplete.context.truncatedTail"
                : "chat.fileMentionAutocomplete.context.truncatedHead",
            )
          : null
        const body = composeContextBody(label, content, note, placement)
        if (!body) {
          toast.error(t("chat.fileMentionAutocomplete.context.attachFailed"))
          return
        }
        onContextAttachment(buildContextAttachmentFile(label, body))
      },
      [onContextAttachment, t],
    )

    const attachTerminal = React.useCallback(
      async (target: TerminalMentionTarget | null) => {
        if (attachingRef.current) return
        if (!target) {
          toast.error(t("chat.fileMentionAutocomplete.context.terminalEmpty"))
          return
        }
        attachingRef.current = true
        // The context is built asynchronously; if the composer moved to another draft
        // meanwhile, delivering it here would attach this project's output to the other
        // session's draft.
        const draftKey = useInputStore.getState().activeAttachmentDraftKey
        try {
          const resolved = await resolveTerminalContext({
            sessionId: target.sessionId,
            fallbackShell: target.label,
            localOutput: target.output,
            readServer: getTerminalSessionOutput,
          })
          if (!resolved) {
            toast.error(t("chat.fileMentionAutocomplete.context.terminalEmpty"))
            return
          }
          if (useInputStore.getState().activeAttachmentDraftKey !== draftKey) {
            toast.error(t("chat.fileMentionAutocomplete.context.attachFailed"))
            return
          }
          const label = t("chat.fileMentionAutocomplete.context.terminal", { shell: resolved.shell })
          deliverContext(label, resolved.text, resolved.truncated, "before")
        } catch {
          toast.error(t("chat.fileMentionAutocomplete.context.attachFailed"))
        } finally {
          attachingRef.current = false
        }
      },
      [deliverContext, t],
    )

    const attachDiff = React.useCallback(async () => {
      if (attachingRef.current) return
      if (!directory) {
        toast.error(t("chat.fileMentionAutocomplete.context.noDirectory"))
        return
      }
      if (!contextGit) {
        toast.error(t("chat.fileMentionAutocomplete.context.attachFailed"))
        return
      }
      attachingRef.current = true
      const draftKey = useInputStore.getState().activeAttachmentDraftKey
      try {
        const resolved = await resolveUncommittedContext(contextGit, directory)
        if (!resolved) {
          toast.error(t("chat.fileMentionAutocomplete.context.diffEmpty"))
          return
        }
        if (useInputStore.getState().activeAttachmentDraftKey !== draftKey) {
          toast.error(t("chat.fileMentionAutocomplete.context.attachFailed"))
          return
        }
        deliverContext(t("chat.fileMentionAutocomplete.context.diff"), resolved.text, resolved.truncated, "after")
      } catch {
        toast.error(t("chat.fileMentionAutocomplete.context.attachFailed"))
      } finally {
        attachingRef.current = false
      }
    }, [contextGit, deliverContext, directory, t])

    const closeCommitPicker = React.useCallback(() => {
      commitRequestRef.current += 1
      setCommitPickerOpen(false)
      setCommitLoading(false)
    }, [])

    const openCommitPicker = React.useCallback(async () => {
      if (!directory) {
        toast.error(t("chat.fileMentionAutocomplete.context.noDirectory"))
        return
      }
      if (!contextGit) {
        toast.error(t("chat.fileMentionAutocomplete.context.attachFailed"))
        return
      }
      const requestId = commitRequestRef.current + 1
      commitRequestRef.current = requestId
      setCommitPickerOpen(true)
      setCommitLoading(true)
      setCommitEntries([])
      try {
        const log = await contextGit.getGitLog(directory, { maxCount: 20 })
        if (commitRequestRef.current !== requestId) return
        setCommitEntries(commitEntriesFromLog(log.all))
      } catch {
        if (commitRequestRef.current !== requestId) return
        setCommitEntries([])
        toast.error(t("chat.fileMentionAutocomplete.context.attachFailed"))
      } finally {
        if (commitRequestRef.current === requestId) setCommitLoading(false)
      }
    }, [contextGit, directory, t])

    const attachCommit = React.useCallback(
      async (entry: CommitMentionEntry) => {
        if (attachingRef.current) return
        if (!directory || !contextGit) {
          toast.error(
            t(
              directory
                ? "chat.fileMentionAutocomplete.context.attachFailed"
                : "chat.fileMentionAutocomplete.context.noDirectory",
            ),
          )
          return
        }
        attachingRef.current = true
        const draftKey = useInputStore.getState().activeAttachmentDraftKey
        try {
          const resolved = await resolveCommitContext(contextGit, directory, entry)
          if (!resolved) {
            toast.error(t("chat.fileMentionAutocomplete.context.attachFailed"))
            return
          }
          if (useInputStore.getState().activeAttachmentDraftKey !== draftKey) {
            toast.error(t("chat.fileMentionAutocomplete.context.attachFailed"))
            return
          }
          const subject = clipCommitSubject(entry.subject) || t("chat.fileMentionAutocomplete.context.noSubject")
          const label = t("chat.fileMentionAutocomplete.context.commitLabel", {
            hash: shortCommitHash(entry.hash),
            subject,
          })
          deliverContext(label, resolved.text, resolved.truncated, "after")
        } catch {
          toast.error(t("chat.fileMentionAutocomplete.context.attachFailed"))
        } finally {
          attachingRef.current = false
        }
      },
      [contextGit, deliverContext, directory, t],
    )

    const activateContextEntry = React.useCallback(
      (entry: ContextMenuEntry) => {
        if (entry.type === "terminal") {
          void attachTerminal(entry.target)
          return
        }
        if (entry.type === "diff") {
          void attachDiff()
          return
        }
        void openCommitPicker()
      },
      [attachDiff, attachTerminal, openCommitPicker],
    )

    React.useImperativeHandle(
      ref,
      () => ({
        handleKeyDown: (key: string) => {
          if (key === "Escape") {
            if (commitPickerOpen) {
              closeCommitPicker()
              return true
            }
            onClose()
            return true
          }

          if (commitPickerOpen) {
            const total = 1 + visibleCommits.length
            if (key === "ArrowDown") {
              setSelectedIndex((prev) => (prev + 1) % total)
              return true
            }
            if (key === "ArrowUp") {
              setSelectedIndex((prev) => (prev - 1 + total) % total)
              return true
            }
            if (key === "Enter" || key === "Tab") {
              const safeIndex = ((selectedIndexRef.current % total) + total) % total
              if (safeIndex === 0) {
                closeCommitPicker()
                return true
              }
              const entry = visibleCommits[safeIndex - 1]
              if (entry) void attachCommit(entry)
              return true
            }
            return true
          }

          // The rows behind the spinner are not on screen while a search runs, and those arrays still hold the
          // previous query's hits — but the context rows (terminal, diff, commit picker) stay visible, so the
          // keys have to keep working for them instead of being refused outright.
          const keyedAgents = loading ? [] : visibleAgents
          const keyedDirectories = loading ? [] : visibleDirectories
          const keyedRecentFiles = loading ? [] : visibleRecentFiles
          const keyedFiles = loading ? [] : visibleFiles

          const total =
            contextEntries.length +
            keyedAgents.length +
            keyedDirectories.length +
            keyedRecentFiles.length +
            keyedFiles.length
          if (total === 0) {
            // Unconsumed: Enter must still send the message when nothing matches the
            // mention query (`@word` with no hits looked unsendable).
            return false
          }

          if (key === "ArrowDown") {
            setSelectedIndex((prev) => (prev + 1) % total)
            return true
          }

          if (key === "ArrowUp") {
            setSelectedIndex((prev) => (prev - 1 + total) % total)
            return true
          }

          if (key === "Enter" || key === "Tab") {
            const safeIndex = ((selectedIndexRef.current % total) + total) % total
            if (safeIndex < contextEntries.length) {
              const entry = contextEntries[safeIndex]
              if (entry) activateContextEntry(entry)
              return true
            }
            const rest = safeIndex - contextEntries.length
            if (rest < keyedAgents.length) {
              const agent = keyedAgents[rest]
              if (agent) handleAgentPick(agent.name)
              return true
            }
            const dirIndex = rest - keyedAgents.length
            if (dirIndex < keyedDirectories.length) {
              const dir = keyedDirectories[dirIndex]
              if (dir) handleFileSelect(dir)
              return true
            }
            const fileIndex = dirIndex - keyedDirectories.length
            const selectedFile =
              fileIndex < keyedRecentFiles.length
                ? keyedRecentFiles[fileIndex]
                : keyedFiles[fileIndex - keyedRecentFiles.length]
            if (selectedFile) handleFileSelect(selectedFile)
            return true
          }
          return false
        },
      }),
      [
        activateContextEntry,
        attachCommit,
        closeCommitPicker,
        commitPickerOpen,
        contextEntries,
        onClose,
        visibleAgents,
        visibleCommits,
        visibleDirectories,
        visibleFiles,
        visibleRecentFiles,
        handleFileSelect,
        handleAgentPick,
        // The handler refuses input while a search runs, so it must be re-created when that changes: a stale
        // closure would read the previous value and commit the row the spinner is hiding.
        loading,
      ],
    )

    const getFileIcon = (file: FileInfo) => {
      const ext = file.extension?.toLowerCase()
      switch (ext) {
        case "ts":
        case "tsx":
        case "js":
        case "jsx":
          return <Icon name="code" className="h-3.5 w-3.5 text-[var(--status-info)]" />
        case "json":
          return <Icon name="code" className="h-3.5 w-3.5 text-[var(--status-warning)]" />
        case "md":
        case "mdx":
          return <Icon name="file" className="h-3.5 w-3.5 text-muted-foreground" />
        case "png":
        case "jpg":
        case "jpeg":
        case "gif":
        case "svg":
          return <Icon name="file-image" className="h-3.5 w-3.5 text-[var(--status-success)]" />
        default:
          return <Icon name="file-pdf" className="h-3.5 w-3.5 text-muted-foreground" />
      }
    }

    return (
      <div
        ref={containerRef}
        className="absolute z-[100] min-w-0 w-full max-w-[640px] max-h-64 bg-background border-2 border-border/60 rounded-xl shadow-none bottom-full mb-2 left-0 flex flex-col"
        style={style}
      >
        <ScrollableOverlay outerClassName="flex-1 min-h-0" className="px-0">
          {loading && contextEntries.length === 0 && !commitPickerOpen ? (
            <div className="flex items-center justify-center py-4">
              <Icon name="refresh" className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="pb-2">
              {commitPickerOpen ? (
                <>
                  <div className="px-3 py-1 typography-meta text-muted-foreground">
                    {t("chat.fileMentionAutocomplete.context.commits")}
                  </div>
                  <div
                    ref={(el) => {
                      itemRefs.current[0] = el
                    }}
                    aria-label={t("chat.fileMentionAutocomplete.context.back")}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 cursor-pointer typography-ui-label rounded-lg",
                      selectedIndex === 0 && "bg-interactive-selection",
                    )}
                    onClick={closeCommitPicker}
                    onMouseMove={() => setSelectedIndex(0)}
                  >
                    <Icon name="arrow-left" className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{t("chat.fileMentionAutocomplete.context.back")}</span>
                  </div>
                  {commitLoading ? (
                    <div className="flex items-center justify-center gap-2 py-3 typography-meta text-muted-foreground">
                      <Icon name="refresh" className="h-3.5 w-3.5 animate-spin" />
                      {t("chat.fileMentionAutocomplete.context.loading")}
                    </div>
                  ) : null}
                  {visibleCommits.map((entry, index) => {
                    const rowIndex = index + 1
                    const subject = entry.subject || t("chat.fileMentionAutocomplete.context.noSubject")
                    const hash = shortCommitHash(entry.hash)
                    return (
                      <div
                        key={entry.hash}
                        ref={(el) => {
                          itemRefs.current[rowIndex] = el
                        }}
                        aria-label={`${hash} ${subject}`}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 cursor-pointer typography-ui-label rounded-lg",
                          selectedIndex === rowIndex && "bg-interactive-selection",
                        )}
                        onClick={() => void attachCommit(entry)}
                        onMouseMove={() => setSelectedIndex(rowIndex)}
                      >
                        <Icon name="git-commit" className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono text-muted-foreground">{hash}</span>
                        <span className="flex-1 min-w-0 truncate">{subject}</span>
                      </div>
                    )
                  })}
                  {!commitLoading && visibleCommits.length === 0 ? (
                    <div className="px-3 py-2 typography-ui-label text-muted-foreground">
                      {t("chat.fileMentionAutocomplete.context.emptyCommits")}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  {contextEntries.length > 0 ? (
                    <>
                      <div className="px-3 py-1 typography-meta text-muted-foreground">
                        {t("chat.fileMentionAutocomplete.context.section")}
                      </div>
                      {contextEntries.map((entry, index) => {
                        const title =
                          entry.type === "terminal"
                            ? entry.target?.label || t("chat.fileMentionAutocomplete.context.terminalDescription")
                            : entry.type === "diff"
                              ? t("chat.fileMentionAutocomplete.context.diff")
                              : t("chat.fileMentionAutocomplete.context.commit")
                        const description =
                          entry.type === "terminal"
                            ? t("chat.fileMentionAutocomplete.context.terminalDescription")
                            : entry.type === "diff"
                              ? t("chat.fileMentionAutocomplete.context.diffDescription")
                              : t("chat.fileMentionAutocomplete.context.commitDescription")
                        const badge =
                          entry.type === "terminal" && entry.target?.active
                            ? t("chat.fileMentionAutocomplete.context.terminalActive")
                            : null
                        const icon =
                          entry.type === "terminal"
                            ? "terminal-box"
                            : entry.type === "diff"
                              ? "git-branch"
                              : "git-commit"
                        return (
                          <div
                            key={entry.type === "terminal" ? `terminal-${entry.target?.tabId ?? "empty"}` : entry.type}
                            ref={(el) => {
                              itemRefs.current[index] = el
                            }}
                            aria-label={title}
                            className={cn(
                              "flex items-start gap-2 px-3 py-1.5 cursor-pointer typography-ui-label rounded-lg",
                              selectedIndex === index && "bg-interactive-selection",
                            )}
                            onClick={() => activateContextEntry(entry)}
                            onMouseMove={() => setSelectedIndex(index)}
                          >
                            <Icon name={icon} className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-semibold">{title}</span>
                                {badge ? <span className="typography-meta text-muted-foreground">{badge}</span> : null}
                              </div>
                              {description !== title ? (
                                <div className="typography-meta text-muted-foreground truncate">{description}</div>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                      {(loading ||
                        visibleAgents.length > 0 ||
                        visibleDirectories.length > 0 ||
                        visibleRecentFiles.length > 0 ||
                        visibleFiles.length > 0) && <div className="my-1 border-t border-border/60" />}
                    </>
                  ) : null}
                  {loading ? (
                    <div className="flex items-center justify-center py-4">
                      <Icon name="refresh" className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      {visibleAgents.map((agent, index) => {
                        const rowIndex = contextOffset + index
                        const isSelected = selectedIndex === rowIndex
                        return (
                          <div
                            key={`agent-${agent.name}`}
                            ref={(el) => {
                              itemRefs.current[rowIndex] = el
                            }}
                            className={cn(
                              "flex items-start gap-2 px-3 py-1.5 cursor-pointer typography-ui-label rounded-lg",
                              isSelected && "bg-interactive-selection",
                            )}
                            onClick={() => handleAgentPick(agent.name)}
                            onMouseMove={() => setSelectedIndex(rowIndex)}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold truncate">@{agent.name}</div>
                              {agent.description ? (
                                <div className="typography-meta text-muted-foreground truncate">
                                  {agent.description}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                      {visibleAgents.length === 2 && normalizedSearchQuery.length === 0 && agents.length > 2 && (
                        <div className="px-3 py-1 typography-meta text-muted-foreground">
                          {t("chat.fileMentionAutocomplete.searchMoreAgents")}
                        </div>
                      )}
                      {visibleAgents.length > 0 &&
                        (visibleDirectories.length > 0 || visibleRecentFiles.length > 0 || visibleFiles.length > 0) && (
                          <div className="my-1 border-t border-border/60" />
                        )}
                      {visibleDirectories.map((dir, index) => {
                        const rowIndex = contextOffset + visibleAgents.length + index
                        const relativePath = dir.relativePath || dir.name
                        const displayPath = truncatePathMiddle(relativePath, { maxLength: 60 })
                        const isSelected = selectedIndex === rowIndex

                        return (
                          <div
                            key={`dir-${dir.path}`}
                            ref={(el) => {
                              itemRefs.current[rowIndex] = el
                            }}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 cursor-pointer typography-ui-label rounded-lg",
                              isSelected && "bg-interactive-selection",
                            )}
                            onClick={() => handleFileSelect(dir)}
                            onMouseMove={() => setSelectedIndex(rowIndex)}
                          >
                            <Icon name="folder-3-fill" className="h-3.5 w-3.5 text-primary/60" />
                            <span className="flex-1 min-w-0 truncate" aria-label={relativePath}>
                              {displayPath}
                            </span>
                          </div>
                        )
                      })}
                      {visibleDirectories.length > 0 && (visibleRecentFiles.length > 0 || visibleFiles.length > 0) && (
                        <div className="my-1 border-t border-border/60" />
                      )}
                      {visibleRecentFiles.map((file, index) => {
                        const rowIndex = contextOffset + visibleAgents.length + visibleDirectories.length + index
                        const relativePath = file.relativePath || file.name
                        const displayPath = truncatePathMiddle(relativePath, { maxLength: 60 })
                        const isSelected = selectedIndex === rowIndex
                        const isOverflowing = overflowMap[rowIndex] ?? false
                        const marqueeDuration = marqueeDurations[rowIndex] ?? 2.6

                        return (
                          <div
                            key={`recent-${file.path}`}
                            ref={(el) => {
                              itemRefs.current[rowIndex] = el
                            }}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 cursor-pointer typography-ui-label rounded-lg",
                              isSelected && "bg-interactive-selection",
                            )}
                            onClick={() => handleFileSelect(file)}
                            onMouseMove={() => setSelectedIndex(rowIndex)}
                          >
                            {getFileIcon(file)}
                            <span
                              ref={(el) => {
                                labelRefs.current[rowIndex] = el
                              }}
                              className="relative flex-1 min-w-0 overflow-hidden file-mention-marquee-container"
                              style={
                                isSelected
                                  ? {
                                      ["--file-mention-marquee-width" as string]: `${marqueeWidth}px`,
                                      ["--file-mention-marquee-duration" as string]: `${marqueeDuration}s`,
                                      ["--file-mention-marquee-fade-bg" as string]: "var(--interactive-selection)",
                                    }
                                  : undefined
                              }
                              aria-label={relativePath}
                            >
                              <span
                                ref={(el) => {
                                  measureRefs.current[rowIndex] = el
                                }}
                                className="absolute invisible whitespace-nowrap pointer-events-none"
                                aria-hidden
                              >
                                {relativePath}
                              </span>
                              {isOverflowing && isSelected ? (
                                <span className="inline-block whitespace-nowrap file-mention-marquee">
                                  {relativePath}
                                </span>
                              ) : (
                                <span className="block truncate">{displayPath}</span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                      {visibleRecentFiles.length > 0 && visibleFiles.length > 0 && (
                        <div className="my-1 border-t border-border/60" />
                      )}
                      {visibleFiles.map((file, index) => {
                        const rowIndex =
                          contextOffset +
                          visibleAgents.length +
                          visibleDirectories.length +
                          visibleRecentFiles.length +
                          index
                        const relativePath = file.relativePath || file.name
                        const displayPath = truncatePathMiddle(relativePath, { maxLength: 60 })
                        const isSelected = selectedIndex === rowIndex
                        const isOverflowing = overflowMap[rowIndex] ?? false
                        const marqueeDuration = marqueeDurations[rowIndex] ?? 2.6

                        const item = (
                          <div
                            ref={(el) => {
                              itemRefs.current[rowIndex] = el
                            }}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 cursor-pointer typography-ui-label rounded-lg",
                              isSelected && "bg-interactive-selection",
                            )}
                            onClick={() => handleFileSelect(file)}
                            onMouseMove={() => setSelectedIndex(rowIndex)}
                          >
                            {getFileIcon(file)}
                            <span
                              ref={(el) => {
                                labelRefs.current[rowIndex] = el
                              }}
                              className="relative flex-1 min-w-0 overflow-hidden file-mention-marquee-container"
                              style={
                                isSelected
                                  ? {
                                      ["--file-mention-marquee-width" as string]: `${marqueeWidth}px`,
                                      ["--file-mention-marquee-duration" as string]: `${marqueeDuration}s`,
                                      ["--file-mention-marquee-fade-bg" as string]: "var(--interactive-selection)",
                                    }
                                  : undefined
                              }
                              aria-label={relativePath}
                            >
                              <span
                                ref={(el) => {
                                  measureRefs.current[rowIndex] = el
                                }}
                                className="absolute invisible whitespace-nowrap pointer-events-none"
                                aria-hidden
                              >
                                {relativePath}
                              </span>
                              {isOverflowing && isSelected ? (
                                <span className="inline-block whitespace-nowrap file-mention-marquee">
                                  {relativePath}
                                </span>
                              ) : (
                                <span className="block truncate">{displayPath}</span>
                              )}
                            </span>
                          </div>
                        )

                        return <React.Fragment key={file.path}>{item}</React.Fragment>
                      })}
                      {visibleFiles.length === 0 &&
                        visibleDirectories.length === 0 &&
                        visibleRecentFiles.length === 0 &&
                        visibleAgents.length === 0 &&
                        contextEntries.length === 0 && (
                          <div className="px-3 py-2 typography-ui-label text-muted-foreground">
                            {t("chat.fileMentionAutocomplete.empty")}
                          </div>
                        )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </ScrollableOverlay>
        <div className="px-3 pt-1 pb-1.5 border-t typography-meta text-muted-foreground">
          {t("chat.autocomplete.keyboardHint")}
        </div>
      </div>
    )
  },
)
