import React from "react"

import { Button } from "@/components/ui/button"
import { ViewLoadingSkeleton } from "@/components/ui/ViewLoadingSkeleton"
import { useRuntimeAPIs } from "@/hooks/useRuntimeAPIs"
import type { GitBranch, GitBranchFileDiff } from "@/lib/api/types"
import { useI18n } from "@/lib/i18n"
import type { I18nKey } from "@/lib/i18n/store"
import { getLanguageFromExtension } from "@/lib/toolHelpers"
import { diffLayoutKey, useUIStore } from "@/stores/useUIStore"
import { reviewBranchFileSignature, useReviewPaneFileKeys } from "@/stores/useReviewProgressStore"
import { PierreDiffViewer } from "./PierreDiffViewer"
import { ReviewFileRail, type ReviewRailFile, type ReviewRailStatus } from "./ReviewFileRail"

/** Matches the review pane's side-by-side minimum. A branch diff also needs both sides. */
const BRANCH_SIDE_BY_SIDE_MIN_WIDTH = 1100
const BRANCH_RAIL_MIN_WIDTH = 640

const branchDiffBaseMemory = new Map<string, string>()

/** Drops remembered compare bases. Review choices live only in this process. */
// eslint-disable-next-line react-refresh/only-export-components -- Test reset for the in-memory compare base, which has to live with this view.
export function clearBranchDiffBaseMemory(): void {
  branchDiffBaseMemory.clear()
}

export interface BranchChangesModel {
  phase: "loading" | "ready" | "error"
  progressScope: string
  files: ReviewRailFile[]
  /** Null hides the layout toggle: no file is selected, or one side is empty. */
  selectedLayout: "inline" | "side-by-side" | null
  selectedDiff: { path: string; before: string; after: string } | null
  base: string
  branches: string[]
  truncated: boolean
}

interface BranchChangesViewProps {
  directory: string
  paneRef: React.RefObject<HTMLElement | null>
  paneWidth: number
  allowRail: boolean
  selectedFile: string | null
  onSelectFile: (path: string) => void
  wrapLines: boolean
  onOpenFile?: (file: { path: string; before: string; after: string }) => void
  onModelChange: (model: BranchChangesModel) => void
}

type BranchFileDiff = GitBranchFileDiff

type Snapshot = {
  displayKey: string
  phase: "ready" | "error"
  base: string
  mergeBase: string
  truncated: boolean
  files: BranchFileDiff[]
  error: string | null
}

const EMPTY_FILES: BranchFileDiff[] = []

const STATUS_PRESENTATION: Record<BranchFileDiff["status"], ReviewRailStatus> = {
  added: { code: "A", color: "var(--status-success)", descriptionKey: "diffView.change.new" },
  deleted: { code: "D", color: "var(--status-error)", descriptionKey: "diffView.change.deleted" },
  modified: { code: "M", color: "var(--status-warning)", descriptionKey: "diffView.change.modified" },
  renamed: { code: "R", color: "var(--status-info)", descriptionKey: "diffView.change.renamed" },
  copied: { code: "C", color: "var(--status-info)", descriptionKey: "diffView.change.copied" },
  untracked: { code: "?", color: "var(--status-info)", descriptionKey: "diffView.change.untracked" },
}

const BRANCH_STATUSES = new Set<BranchFileDiff["status"]>([
  "added",
  "deleted",
  "modified",
  "renamed",
  "copied",
  "untracked",
])

function localBranchNames(result: GitBranch | null): string[] {
  if (!result || !Array.isArray(result.all)) return []
  return result.all
    .filter((name) => typeof name === "string" && name.length > 0 && !name.startsWith("remotes/"))
    .sort((left, right) => left.localeCompare(right))
}

function normalizeBranchFiles(entries: readonly unknown[]): BranchFileDiff[] {
  const files: BranchFileDiff[] = []
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue
    const row = entry as Partial<BranchFileDiff>
    if (typeof row.file !== "string" || row.file.length === 0) continue
    const status = BRANCH_STATUSES.has(row.status as BranchFileDiff["status"])
      ? (row.status as BranchFileDiff["status"])
      : "modified"
    files.push({
      file: row.file,
      before: typeof row.before === "string" ? row.before : "",
      after: typeof row.after === "string" ? row.after : "",
      additions: typeof row.additions === "number" && Number.isFinite(row.additions) ? row.additions : 0,
      deletions: typeof row.deletions === "number" && Number.isFinite(row.deletions) ? row.deletions : 0,
      status,
      binary: row.binary === true,
      tooLarge: row.tooLarge === true,
      previousFile: typeof row.previousFile === "string" ? row.previousFile : null,
      beforeBlobId: typeof row.beforeBlobId === "string" ? row.beforeBlobId : row.beforeBlobId === null ? null : undefined,
    })
  }
  files.sort((left, right) => left.file.localeCompare(right.file))
  return files
}

function contentSignature(file: BranchFileDiff, mergeBase: string): { signature: string; fallback: boolean } {
  return reviewBranchFileSignature(
    {
      path: file.file,
      status: file.status,
      after: file.after,
      additions: file.additions,
      deletions: file.deletions,
      binary: file.binary,
      tooLarge: file.tooLarge,
      beforeBlobId: file.beforeBlobId,
    },
    mergeBase,
  )
}

function branchDiffLayout(
  file: BranchFileDiff | null,
  paneWidth: number,
  preference: "dynamic" | "inline" | "side-by-side",
  fileOverride: "inline" | "side-by-side" | undefined,
): "inline" | "side-by-side" | null {
  if (!file || file.binary || file.tooLarge || file.before.length === 0 || file.after.length === 0) return null
  if (fileOverride) return fileOverride
  if (preference === "inline") return "inline"
  if (preference === "side-by-side") return "side-by-side"
  return paneWidth >= BRANCH_SIDE_BY_SIDE_MIN_WIDTH ? "side-by-side" : "inline"
}

export const BranchChangesView: React.FC<BranchChangesViewProps> = ({
  directory,
  paneRef,
  paneWidth,
  allowRail,
  selectedFile,
  onSelectFile,
  wrapLines,
  onOpenFile,
  onModelChange,
}) => {
  const { t } = useI18n()
  const { git } = useRuntimeAPIs()
  const [directoryKey, setDirectoryKey] = React.useState(directory)
  const [baseChoice, setBaseChoice] = React.useState(() => branchDiffBaseMemory.get(directory) ?? "")
  if (directoryKey !== directory) {
    setDirectoryKey(directory)
    setBaseChoice(branchDiffBaseMemory.get(directory) ?? "")
  }
  const displayKey = `${directory}\0${baseChoice}`
  const [retryNonce, setRetryNonce] = React.useState(0)
  const [branchNames, setBranchNames] = React.useState<string[]>([])
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null)
  const requestSerial = React.useRef(0)

  React.useEffect(() => {
    const request = ++requestSerial.current
    let cancelled = false
    const choice = baseChoice
    void (async () => {
      const branchPromise = git.getGitBranches(directory).catch(() => null)
      try {
        const diff = await git.getGitBranchDiff(directory, { base: choice || undefined })
        const branchList = await branchPromise
        if (cancelled || request !== requestSerial.current) return
        setBranchNames(localBranchNames(branchList))
        setSnapshot({
          displayKey,
          phase: "ready",
          base: typeof diff.base === "string" ? diff.base : choice,
          mergeBase: typeof diff.mergeBase === "string" ? diff.mergeBase : "",
          truncated: diff.truncated === true,
          files: normalizeBranchFiles(Array.isArray(diff.files) ? diff.files : []),
          error: null,
        })
      } catch (error) {
        const branchList = await branchPromise.catch(() => null)
        if (cancelled || request !== requestSerial.current) return
        setBranchNames(localBranchNames(branchList))
        const message = error instanceof Error && error.message ? error.message : "Failed to load diff"
        setSnapshot({
          displayKey,
          phase: "error",
          base: choice,
          mergeBase: "",
          truncated: false,
          files: [],
          error: message,
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [baseChoice, directory, displayKey, git, retryNonce])

  const visible = snapshot?.displayKey === displayKey ? snapshot : null
  const phase = visible?.phase ?? "loading"
  const loadedFiles = visible?.phase === "ready" ? visible.files : EMPTY_FILES
  const resolvedBase = visible?.base || baseChoice
  const mergeBase = visible?.mergeBase ?? ""
  const selected = loadedFiles.find((file) => file.file === selectedFile) ?? null
  const layoutPreference = useUIStore((state) => state.diffLayoutPreference)
  const layoutOverride = useUIStore((state) =>
    selectedFile ? state.diffFileLayout[diffLayoutKey(directory, selectedFile)] : undefined,
  )
  const selectedLayout = branchDiffLayout(selected, paneWidth, layoutPreference, layoutOverride)
  const progressScope = `branch:${resolvedBase || "default"}`

  const railFiles = React.useMemo<ReviewRailFile[]>(
    () =>
      loadedFiles.map((file) => {
        const signed = contentSignature(file, mergeBase)
        return {
          path: file.file,
          insertions: file.additions,
          deletions: file.deletions,
          signature: signed.signature,
          signatureFallback: signed.fallback,
          status: STATUS_PRESENTATION[file.status],
        }
      }),
    [loadedFiles, mergeBase],
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

  const optionNames = React.useMemo(() => {
    const names = new Set(branchNames)
    if (resolvedBase) names.add(resolvedBase)
    return [...names].sort((left, right) => left.localeCompare(right))
  }, [branchNames, resolvedBase])

  const model = React.useMemo<BranchChangesModel>(
    () => ({
      phase,
      progressScope,
      files: railFiles,
      selectedLayout,
      selectedDiff: selected ? { path: selected.file, before: selected.before, after: selected.after } : null,
      base: resolvedBase,
      branches: optionNames,
      truncated: visible?.truncated === true,
    }),
    [optionNames, phase, progressScope, railFiles, resolvedBase, selected, selectedLayout, visible?.truncated],
  )
  const onModelChangeRef = React.useRef(onModelChange)
  onModelChangeRef.current = onModelChange
  React.useEffect(() => {
    onModelChangeRef.current(model)
  }, [model])

  const chooseBase = (next: string) => {
    if (!next || next === baseChoice) return
    branchDiffBaseMemory.set(directory, next)
    setBaseChoice(next)
  }

  const showRail = allowRail && paneWidth >= BRANCH_RAIL_MIN_WIDTH && railFiles.length > 0
  const openSelected = onOpenFile
    ? (path: string) => {
        const file = loadedFiles.find((entry) => entry.file === path)
        if (!file) return
        onOpenFile({ path: file.file, before: file.before, after: file.after })
      }
    : undefined

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
        <p className="session-changes__title">{t("diffView.branch.empty", { base: resolvedBase })}</p>
      </div>
    )
  } else if (selected?.binary) {
    body = (
      <div className="session-changes__status" role="status">
        <p className="session-changes__title">{t("diffView.binary.unavailable")}</p>
      </div>
    )
  } else if (selected?.tooLarge) {
    body = (
      <div className="session-changes__status" role="status">
        <p className="session-changes__title">{t("diffView.branch.tooLarge")}</p>
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

  const baseLabel: I18nKey = "diffView.branch.base"

  return (
    <div className="session-changes" data-branch-changes data-branch-scope={progressScope} data-branch-base={resolvedBase}>
      {showRail ? (
        <ReviewFileRail
          directory={directory}
          scope={progressScope}
          files={railFiles}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          onOpenFile={openSelected}
        />
      ) : null}
      <div className="session-changes__body">
        {optionNames.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-1.5">
            <span className="typography-micro text-muted-foreground">{t(baseLabel)}</span>
            <select
              aria-label={t(baseLabel)}
              className="h-6 max-w-48 rounded border border-border bg-background px-1.5 typography-micro text-foreground normal-case"
              value={optionNames.includes(resolvedBase) ? resolvedBase : ""}
              onChange={(event) => chooseBase(event.target.value)}
            >
              {resolvedBase && !optionNames.includes(resolvedBase) ? <option value="">{resolvedBase}</option> : null}
              {optionNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {visible?.truncated ? (
          <p className="shrink-0 px-3 py-1 typography-micro text-muted-foreground" role="status">
            {t("diffView.branch.truncated", { count: loadedFiles.length })}
          </p>
        ) : null}
        {body}
      </div>
    </div>
  )
}
