import React from "react"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { isIMECompositionEvent } from "@/lib/ime"
import { Icon } from "@/components/icon/Icon"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { useEffectiveDirectory } from "@/hooks/useEffectiveDirectory"
import { axCodeClient } from "@/lib/ax-code/client"
import { useI18n } from "@/lib/i18n"
import { getProjectPathIdentityKey } from "@/lib/projectResolution"
import {
  CROSS_SESSION_SEARCH_MAX_SESSIONS,
  CROSS_SESSION_SEARCH_MESSAGES_LIMIT,
  createCrossSessionSearchCache,
  normalizeSearchQuery,
  scanSessionsForQuery,
  selectSessionsToScan,
  type CrossSessionSearchHit,
  type CrossSessionSearchProgress,
} from "@/lib/search/crossSessionSearch"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { cn } from "@/lib/utils"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { useUIStore } from "@/stores/useUIStore"

/** Shorter queries match almost everything; do not scan for them. */
const MIN_QUERY_LENGTH = 2
const SEARCH_DEBOUNCE_MS = 250

// One cache for the app lifetime: reopening the dialog or refining a query
// reuses the text already extracted for unchanged sessions.
const searchCache = createCrossSessionSearchCache()

type SessionListState =
  | { status: "loading"; sessions: Session[] }
  | { status: "ready"; sessions: Session[] }
  | { status: "error"; sessions: Session[] }

const EMPTY_PROGRESS: CrossSessionSearchProgress = { hits: [], scanned: 0, total: 0, failed: 0, truncated: false }

const sdkErrorMessage = (error: unknown): string =>
  error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message)
    : String(error)

/**
 * Sessions of the current project to scan: the directory-scoped
 * `session.list` page (the same query the sync bootstrap uses), merged with
 * same-project sessions the global index already knows so worktree sessions
 * are covered too. The global index is also the fallback when the list call
 * fails, so a transient runtime restart does not blank the dialog.
 */
const loadSessionsToScan = async (directory: string | null, signal: AbortSignal): Promise<Session[]> => {
  let listed: Session[] = []
  let listError: unknown = null

  if (directory) {
    try {
      const result = await axCodeClient
        .getSdkClient()
        .session.list({ directory, roots: true, limit: CROSS_SESSION_SEARCH_MAX_SESSIONS }, { signal })
      if (result.error) {
        throw new Error(sdkErrorMessage(result.error))
      }
      listed = Array.isArray(result.data) ? result.data : []
    } catch (error) {
      if (signal.aborted) throw error
      listError = error
    }
  }

  const directoryKey = getProjectPathIdentityKey(directory)
  const projectIds = new Set(listed.map((item) => item.projectID).filter(Boolean))
  const globalSessions = useGlobalSessionsStore.getState().activeSessions.filter((item) => {
    if (directoryKey && getProjectPathIdentityKey(item.directory) === directoryKey) return true
    return Boolean(item.projectID && projectIds.has(item.projectID))
  })

  const merged = selectSessionsToScan([...listed, ...globalSessions])
  if (merged.length === 0 && listError) {
    throw listError instanceof Error ? listError : new Error(sdkErrorMessage(listError))
  }
  return merged
}

const fetchSessionMessages = async (session: Session, signal: AbortSignal) => {
  const result = await axCodeClient.getSdkClient().session.messages(
    {
      sessionID: session.id,
      ...(session.directory ? { directory: session.directory } : {}),
      limit: CROSS_SESSION_SEARCH_MESSAGES_LIMIT,
    },
    { signal },
  )
  if (result.error) {
    throw new Error(sdkErrorMessage(result.error))
  }
  return result.data ?? []
}

export const CrossSessionSearchDialog: React.FC = () => {
  const { t } = useI18n()
  const open = useUIStore((s) => s.isCrossSessionSearchOpen)
  const setOpen = useUIStore((s) => s.setCrossSessionSearchOpen)
  const setPendingMessageNavigation = useUIStore((s) => s.setPendingMessageNavigation)
  const effectiveDirectory = useEffectiveDirectory()
  const currentDirectory = useDirectoryStore((s) => s.currentDirectory)
  const directory = effectiveDirectory ?? currentDirectory ?? axCodeClient.getDirectory() ?? null

  const [query, setQuery] = React.useState("")
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const normalizedQuery = normalizeSearchQuery(debouncedQuery)
  const queryReady = normalizedQuery.length >= MIN_QUERY_LENGTH

  const [sessionList, setSessionList] = React.useState<SessionListState>({ status: "loading", sessions: [] })
  const [progress, setProgress] = React.useState<CrossSessionSearchProgress>(EMPTY_PROGRESS)
  const [scanning, setScanning] = React.useState(false)
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [reloadToken, setReloadToken] = React.useState(0)
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([])

  // Load the session list once per open (and per directory); query changes
  // only re-run the local scan against it.
  React.useEffect(() => {
    if (!open) return
    setQuery("")
    setProgress(EMPTY_PROGRESS)
    setSelectedIndex(0)
    setSessionList({ status: "loading", sessions: [] })

    const controller = new AbortController()
    loadSessionsToScan(directory, controller.signal)
      .then((sessions) => {
        if (!controller.signal.aborted) setSessionList({ status: "ready", sessions })
      })
      .catch(() => {
        if (!controller.signal.aborted) setSessionList({ status: "error", sessions: [] })
      })
    return () => controller.abort()
  }, [open, directory, reloadToken])

  React.useEffect(() => {
    if (!open || sessionList.status !== "ready" || !queryReady) {
      setScanning(false)
      if (!queryReady) setProgress(EMPTY_PROGRESS)
      return
    }

    const controller = new AbortController()
    setScanning(true)
    setProgress({ ...EMPTY_PROGRESS, total: sessionList.sessions.length })
    void scanSessionsForQuery({
      sessions: sessionList.sessions,
      query: debouncedQuery,
      fetchMessages: fetchSessionMessages,
      cache: searchCache,
      signal: controller.signal,
      onProgress: (snapshot) => {
        if (!controller.signal.aborted) setProgress(snapshot)
      },
    }).finally(() => {
      if (!controller.signal.aborted) setScanning(false)
    })
    return () => controller.abort()
  }, [open, sessionList, debouncedQuery, queryReady])

  const hits = progress.hits

  React.useEffect(() => {
    setSelectedIndex(0)
  }, [normalizedQuery])

  React.useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, hits.length)
  }, [hits.length])

  React.useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  const formatRelativeTime = React.useCallback(
    (timestamp: number): string => {
      if (!timestamp) return ""
      const diffMs = Date.now() - timestamp
      const diffMins = Math.floor(diffMs / 60_000)
      const diffHours = Math.floor(diffMins / 60)
      const diffDays = Math.floor(diffHours / 24)

      if (diffMins < 1) return t("chat.timeline.relative.justNow")
      if (diffMins < 60) return t("chat.timeline.relative.minutesAgo", { count: diffMins })
      if (diffHours < 24) return t("chat.timeline.relative.hoursAgo", { count: diffHours })
      if (diffDays < 7) return t("chat.timeline.relative.daysAgo", { count: diffDays })
      return new Date(timestamp).toLocaleDateString()
    },
    [t],
  )

  const openHit = React.useCallback(
    (hit: CrossSessionSearchHit) => {
      setPendingMessageNavigation({ sessionId: hit.sessionId, messageId: hit.messageId })
      openSupervisedSession({ sessionId: hit.sessionId, directory: hit.sessionDirectory || directory })
      setOpen(false)
    },
    [directory, setOpen, setPendingMessageNavigation],
  )

  const handleSearchKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // A composition consumes the arrow keys (to move through its candidates) and Enter (to commit them), and the
      // branches below would move the highlighted hit or open it. The model picker and the inline comment field
      // gate the same way, through `lib/ime`.
      if (isIMECompositionEvent(event)) return
      const total = hits.length
      if (total === 0) return

      if (event.key === "ArrowDown") {
        event.preventDefault()
        setSelectedIndex((current) => (current + 1) % total)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setSelectedIndex((current) => (current - 1 + total) % total)
        return
      }
      if (event.key === "Enter") {
        event.preventDefault()
        const selected = hits[((selectedIndex % total) + total) % total]
        if (selected) openHit(selected)
      }
    },
    [hits, openHit, selectedIndex],
  )

  const showResults = queryReady && sessionList.status === "ready"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="search" className="h-5 w-5" />
            {t("crossSessionSearch.title")}
          </DialogTitle>
          <DialogDescription>
            {t("crossSessionSearch.description", { count: CROSS_SESSION_SEARCH_MAX_SESSIONS })}
          </DialogDescription>
        </DialogHeader>

        <div className="relative mt-2">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder={t("crossSessionSearch.placeholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="pl-9 w-full"
            aria-label={t("crossSessionSearch.placeholder")}
          />
        </div>

        <div className="mt-2 flex min-h-5 items-center gap-2 typography-meta text-muted-foreground" aria-live="polite">
          {sessionList.status === "loading" ? (
            <>
              <Icon name="loader-4" className="h-3.5 w-3.5 animate-spin" />
              <span>{t("crossSessionSearch.loadingSessions")}</span>
            </>
          ) : sessionList.status === "error" ? (
            <>
              <Icon name="error-warning" className="h-3.5 w-3.5 text-status-error" />
              <span className="text-status-error">{t("crossSessionSearch.loadFailed")}</span>
              <button
                type="button"
                className="font-medium text-foreground hover:underline"
                onClick={() => setReloadToken((value) => value + 1)}
              >
                {t("crossSessionSearch.retry")}
              </button>
            </>
          ) : queryReady ? (
            <>
              {scanning ? <Icon name="loader-4" className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>{t("crossSessionSearch.scanned", { scanned: progress.scanned, total: progress.total })}</span>
              {progress.failed > 0 ? (
                <span>{t("crossSessionSearch.failedSessions", { count: progress.failed })}</span>
              ) : null}
              {progress.truncated ? <span>{t("crossSessionSearch.truncated")}</span> : null}
            </>
          ) : (
            <span>{t("crossSessionSearch.hint", { count: MIN_QUERY_LENGTH })}</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {!showResults ? (
            sessionList.status === "ready" && sessionList.sessions.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">{t("crossSessionSearch.noSessions")}</div>
            ) : null
          ) : hits.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {scanning ? t("crossSessionSearch.searching") : t("crossSessionSearch.noResults")}
            </div>
          ) : (
            hits.map((hit, index) => {
              const isSelected = index === selectedIndex
              const roleLabel = hit.role === "user" ? t("chat.timeline.role.user") : t("chat.timeline.role.assistant")
              return (
                <div
                  key={`${hit.sessionId}:${hit.messageId}`}
                  ref={(element) => {
                    itemRefs.current[index] = element
                  }}
                  className={cn(
                    "group flex cursor-pointer flex-col gap-0.5 rounded px-2 py-1.5 transition-colors hover:bg-interactive-hover/30",
                    isSelected && "bg-interactive-selection text-interactive-selection-foreground",
                  )}
                  onClick={() => openHit(hit)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate typography-meta font-medium",
                        isSelected ? "text-interactive-selection-foreground" : "text-foreground",
                      )}
                    >
                      {hit.sessionTitle.trim() || t("commandPalette.session.untitled")}
                    </span>
                    <span
                      className={cn(
                        "typography-micro shrink-0 rounded px-1 py-0.5",
                        isSelected
                          ? "bg-interactive-selection-foreground/10 text-interactive-selection-foreground/80"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {roleLabel}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 typography-meta whitespace-nowrap",
                        isSelected ? "text-interactive-selection-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {formatRelativeTime(hit.created)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "min-w-0 truncate typography-meta",
                      isSelected ? "text-interactive-selection-foreground" : "text-foreground",
                    )}
                  >
                    {hit.snippet.leadingEllipsis ? "…" : null}
                    {hit.snippet.before}
                    <mark className="bg-primary text-primary-foreground ring-1 ring-primary/90">
                      {hit.snippet.match}
                    </mark>
                    {hit.snippet.after}
                    {hit.snippet.trailingEllipsis ? "…" : null}
                  </p>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
