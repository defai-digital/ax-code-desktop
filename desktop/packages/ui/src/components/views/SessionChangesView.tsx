import React from "react"

import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui"
import { useRuntimeAPIs } from "@/hooks/useRuntimeAPIs"
import { getContextFileOpenFailureMessage, validateContextFileOpen } from "@/lib/contextFileOpenGuard"
import { toViewAbsolutePath } from "./viewPathUtils"
import { ViewLoadingSkeleton } from "@/components/ui/ViewLoadingSkeleton"
import { axCodeClient } from "@/lib/ax-code/client"
import { useI18n } from "@/lib/i18n"
import { getLanguageFromExtension } from "@/lib/toolHelpers"
import { diffLayoutKey, useUIStore } from "@/stores/useUIStore"
import { reviewContentSignature, useReviewPaneFileKeys } from "@/stores/useReviewProgressStore"
import { useDirectorySync, useSessionMessages, useSessionMessagesResolved, useSessionStatus } from "@/sync/sync-context"
import { PierreDiffViewer } from "./PierreDiffViewer"
import { ReviewFileRail, type ReviewRailFile, type ReviewRailStatus } from "./ReviewFileRail"

/** Matches the review pane's side-by-side minimum. A session diff also needs both sides. */
const SESSION_SIDE_BY_SIDE_MIN_WIDTH = 1100
const SESSION_RAIL_MIN_WIDTH = 640

export type SessionChangesScope = "session" | "turn"

export interface SessionChangesModel {
  phase: "loading" | "ready" | "error"
  progressScope: string
  files: ReviewRailFile[]
  /** Null hides the layout toggle: no file is selected, or one side is empty. */
  selectedLayout: "inline" | "side-by-side" | null
}

interface SessionChangesViewProps {
  directory: string
  sessionID: string
  scope: SessionChangesScope
  paneRef: React.RefObject<HTMLElement | null>
  paneWidth: number
  allowRail: boolean
  selectedFile: string | null
  onSelectFile: (path: string) => void
  wrapLines: boolean
  onModelChange: (model: SessionChangesModel) => void
}

type SessionFileDiff = {
  file: string
  before: string
  after: string
  additions: number
  deletions: number
  status?: "added" | "deleted" | "modified"
}

type Snapshot = {
  displayKey: string
  phase: "ready" | "error"
  files: SessionFileDiff[]
  error: string | null
}

const EMPTY_SESSION_FILES: SessionFileDiff[] = []

/** First line of `after` that differs from `before` (1-based), so the editor opens at the change. */
function firstChangedLine(before: string, after: string): number {
  const left = before.split("\n")
  const right = after.split("\n")
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return Math.min(index + 1, Math.max(1, right.length))
  }
  return 1
}

const STATUS_PRESENTATION: Record<"added" | "deleted" | "modified", ReviewRailStatus> = {
  added: { code: "A", color: "var(--status-success)", descriptionKey: "diffView.change.new" },
  deleted: { code: "D", color: "var(--status-error)", descriptionKey: "diffView.change.deleted" },
  modified: { code: "M", color: "var(--status-warning)", descriptionKey: "diffView.change.modified" },
}

type MessageLike = {
  id?: unknown
  role?: unknown
  info?: { id?: unknown; role?: unknown }
}

/**
 * The last user turn. Sync stores SDK messages (`role` and `id` on the message).
 * Wrapped `{ info, parts }` records use `info.role` and `info.id` instead.
 */
function lastTurnUserMessage(messages: readonly unknown[]): { id: string; diffs: unknown } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as (MessageLike & { summary?: { diffs?: unknown } }) | null
    if (!message || typeof message !== "object") continue
    const info = message.info as (MessageLike["info"] & { summary?: { diffs?: unknown } }) | undefined
    const role = info && typeof info === "object" && "role" in info ? info.role : message.role
    const id = info && typeof info === "object" && "id" in info ? info.id : message.id
    if (role === "user" && typeof id === "string" && id.length > 0) {
      return { id, diffs: (info && typeof info === "object" ? info.summary?.diffs : undefined) ?? message.summary?.diffs }
    }
  }
  return null
}

function sessionReviewScopeKey(scope: SessionChangesScope, messageID: string | null): string {
  return scope === "turn" ? `turn:${messageID ?? ""}` : "session"
}

function readSessionDiffs(result: unknown): SessionFileDiff[] {
  if (!result || typeof result !== "object" || !Array.isArray((result as { data?: unknown }).data)) {
    throw new Error("Failed to load diff")
  }
  return normalizeFileDiffs((result as { data: unknown[] }).data)
}

/** A turn's diffs from the runtime's full user message (`{ info, parts }`), whose summary keeps the content. */
function readTurnDiffs(result: unknown): SessionFileDiff[] {
  const data = result && typeof result === "object" ? (result as { data?: unknown }).data : undefined
  if (!data || typeof data !== "object") throw new Error("Failed to load diff")
  const info = (data as { info?: { summary?: { diffs?: unknown } } }).info
  const diffs = info?.summary?.diffs
  return Array.isArray(diffs) ? normalizeFileDiffs(diffs) : []
}

function normalizeFileDiffs(entries: readonly unknown[]): SessionFileDiff[] {
  const files: SessionFileDiff[] = []
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue
    const row = entry as Partial<SessionFileDiff>
    if (typeof row.file !== "string" || row.file.length === 0) continue
    const status = row.status === "added" || row.status === "deleted" || row.status === "modified" ? row.status : undefined
    files.push({
      file: row.file,
      before: typeof row.before === "string" ? row.before : "",
      after: typeof row.after === "string" ? row.after : "",
      additions: typeof row.additions === "number" && Number.isFinite(row.additions) ? row.additions : 0,
      deletions: typeof row.deletions === "number" && Number.isFinite(row.deletions) ? row.deletions : 0,
      status,
    })
  }
  files.sort((left, right) => left.file.localeCompare(right.file))
  return files
}

function sessionDiffLayout(
  file: SessionFileDiff | null,
  paneWidth: number,
  preference: "dynamic" | "inline" | "side-by-side",
  fileOverride: "inline" | "side-by-side" | undefined,
): "inline" | "side-by-side" | null {
  if (!file || file.before.length === 0 || file.after.length === 0) return null
  if (fileOverride) return fileOverride
  if (preference === "inline") return "inline"
  if (preference === "side-by-side") return "side-by-side"
  return paneWidth >= SESSION_SIDE_BY_SIDE_MIN_WIDTH ? "side-by-side" : "inline"
}

export const SessionChangesView: React.FC<SessionChangesViewProps> = ({
  directory,
  sessionID,
  scope,
  paneRef,
  paneWidth,
  allowRail,
  selectedFile,
  onSelectFile,
  wrapLines,
  onModelChange,
}) => {
  const { t } = useI18n()
  const messages = useSessionMessages(sessionID, directory)
  const messagesResolved = useSessionMessagesResolved(sessionID, directory)
  // Synced summaries carry file names and counts only (sanitize strips before/after), so content always comes
  // from the runtime: the whole session from session.diff, and a turn from its user message, whose stored
  // summary keeps the content. The session.diff route ignores a message id, so it cannot serve a turn.
  const lastTurn = scope === "turn" ? lastTurnUserMessage(messages) : null
  const messageID = lastTurn?.id ?? null
  const turnSummary = lastTurn?.diffs
  const progressScope = sessionReviewScopeKey(scope, messageID)
  const displayKey = `${directory}\0${sessionID}\0${scope}\0${messageID ?? ""}`
  const sessionDiffEntry = useDirectorySync((state) => {
    if (!sessionID || !Object.prototype.hasOwnProperty.call(state.session_diff, sessionID)) return undefined
    return state.session_diff[sessionID]
  }, directory)
  const sessionStatus = useSessionStatus(sessionID, directory)
  const statusType = sessionStatus?.type
  const busy = statusType === "busy" || statusType === "retry"
  const [retryNonce, setRetryNonce] = React.useState(0)
  const [refresh, setRefresh] = React.useState(0)
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null)
  const requestSerial = React.useRef(0)

  // Re-read when the synced summary for this scope changes, but not while the agent is still working: a busy
  // turn publishes many updates, and the idle transition below reads the final state once.
  const summarySignal = scope === "turn" ? turnSummary : sessionDiffEntry
  // Keyed by display: a scope, session or turn switch already loads through displayKey and must not count as a change.
  const lastSignal = React.useRef({ displayKey, signal: summarySignal })
  const lastBusy = React.useRef(busy)
  React.useEffect(() => {
    const previous = lastSignal.current
    const signalChanged = previous.displayKey === displayKey && previous.signal !== summarySignal
    const finished = lastBusy.current && !busy
    lastSignal.current = { displayKey, signal: summarySignal }
    lastBusy.current = busy
    if (finished || (signalChanged && !busy)) setRefresh((value) => value + 1)
  }, [busy, displayKey, summarySignal])

  React.useEffect(() => {
    if (scope === "turn") {
      // Messages still loading: stay in the loading state instead of claiming the turn changed nothing.
      if (!messagesResolved) return
      if (!messageID) {
        setSnapshot({ displayKey, phase: "ready", files: [], error: null })
        return
      }
    }

    const request = ++requestSerial.current
    let cancelled = false
    void (async () => {
      try {
        const client = axCodeClient.getScopedSdkClient(directory)
        const files =
          scope === "turn" && messageID
            ? readTurnDiffs(await client.session.message({ sessionID, messageID, directory }))
            : readSessionDiffs(await client.session.diff({ sessionID, directory }))
        if (cancelled || request !== requestSerial.current) return
        setSnapshot({ displayKey, phase: "ready", files, error: null })
      } catch (error) {
        if (cancelled || request !== requestSerial.current) return
        const message = error instanceof Error && error.message ? error.message : "Failed to load diff"
        setSnapshot({ displayKey, phase: "error", files: [], error: message })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [directory, displayKey, messageID, messagesResolved, refresh, retryNonce, scope, sessionID])

  const visible = snapshot?.displayKey === displayKey ? snapshot : null
  const phase = visible?.phase ?? "loading"
  const loadedFiles = visible?.phase === "ready" ? visible.files : EMPTY_SESSION_FILES
  const selected = loadedFiles.find((file) => file.file === selectedFile) ?? null
  const { files: filesApi } = useRuntimeAPIs()
  const openContextFileAtLine = useUIStore((state) => state.openContextFileAtLine)
  // Same guard as the git rail: files the agent deleted or that left the project are refused with a message.
  const openInEditor = async (path: string) => {
    const file = loadedFiles.find((entry) => entry.file === path)
    const absolutePath = toViewAbsolutePath(directory, path)
    const validation = await validateContextFileOpen(filesApi, absolutePath)
    if (!validation.ok) {
      toast.error(getContextFileOpenFailureMessage(validation.reason))
      return
    }
    const line = file ? firstChangedLine(file.before, file.after) : 1
    openContextFileAtLine(directory, absolutePath, line, 1)
  }
  const layoutPreference = useUIStore((state) => state.diffLayoutPreference)
  const layoutOverride = useUIStore((state) =>
    selectedFile ? state.diffFileLayout[diffLayoutKey(directory, selectedFile)] : undefined,
  )
  const selectedLayout = sessionDiffLayout(selected, paneWidth, layoutPreference, layoutOverride)

  const railFiles = React.useMemo<ReviewRailFile[]>(
    () =>
      loadedFiles.map((file) => ({
        path: file.file,
        insertions: file.additions,
        deletions: file.deletions,
        signature: reviewContentSignature(file.after, file.status ?? ""),
        status: STATUS_PRESENTATION[file.status ?? "modified"],
      })),
    [loadedFiles],
  )

  const reviewKeyFiles = React.useMemo(
    () => railFiles.map((file) => ({ path: file.path, signature: file.signature ?? "" })),
    [railFiles],
  )

  useReviewPaneFileKeys({
    paneRef,
    directory,
    scope: progressScope,
    files: reviewKeyFiles,
    selectedFile,
    onSelectFile,
  })

  const model = React.useMemo<SessionChangesModel>(
    () => ({
      phase,
      progressScope,
      files: railFiles,
      selectedLayout,
    }),
    [phase, progressScope, railFiles, selectedLayout],
  )
  const onModelChangeRef = React.useRef(onModelChange)
  onModelChangeRef.current = onModelChange
  React.useEffect(() => {
    onModelChangeRef.current(model)
  }, [model])

  const showRail = allowRail && paneWidth >= SESSION_RAIL_MIN_WIDTH && railFiles.length > 0
  const emptyMessage =
    scope === "turn" ? t("diffView.sessionChanges.emptyTurn") : t("diffView.sessionChanges.emptySession")

  let body: React.ReactNode
  if (!visible || phase === "loading") {
    body = <ViewLoadingSkeleton label={t("diffView.state.loadingChanges")} />
  } else if (visible.phase === "error") {
    body = (
      <div className="session-changes__status" role="alert">
        <p className="session-changes__title">{t("diffView.state.failedToLoadDiff")}</p>
        {visible.error ? <p className="session-changes__detail">{visible.error}</p> : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="normal-case"
          onClick={() => setRetryNonce((nonce) => nonce + 1)}
        >
          {t("diffView.actions.retry")}
        </Button>
      </div>
    )
  } else if (loadedFiles.length === 0) {
    body = (
      <div className="session-changes__status" role="status">
        <p className="session-changes__title">{emptyMessage}</p>
      </div>
    )
  } else if (selected) {
    body = (
      <div className="session-changes__diff">
        <PierreDiffViewer
          original={selected.before}
          modified={selected.after}
          language={getLanguageFromExtension(selected.file) || "text"}
          fileName={selected.file}
          renderSideBySide={selectedLayout === "side-by-side"}
          wrapLines={wrapLines}
          layout="inline"
        />
      </div>
    )
  } else {
    body = null
  }

  return (
    <div className="session-changes" data-session-changes data-session-scope={progressScope}>
      {showRail ? (
        <ReviewFileRail
          directory={directory}
          scope={progressScope}
          files={railFiles}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          onOpenFile={(path) => void openInEditor(path)}
        />
      ) : null}
      <div className="session-changes__body">{body}</div>
    </div>
  )
}
