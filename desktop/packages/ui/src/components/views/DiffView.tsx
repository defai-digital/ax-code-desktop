import React from "react"

import { diffLayoutKey, useUIStore } from "@/stores/useUIStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useEffectiveDirectory } from "@/hooks/useEffectiveDirectory"
import { useGitStore, useGitStatus, useIsGitRepo, useGitLoadingStatus } from "@/stores/useGitStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { adjacentReviewFile, reviewFileSignature, useReviewPaneFileKeys } from "@/stores/useReviewProgressStore"
import { useReviewHunkKeys } from "@/hooks/useReviewHunkKeys"
import { disposeReviewHunkScope, reviewPaneScopeKey, useReviewHunkFocus } from "@/lib/reviewHunkRegistry"
import { ReviewHunkScopeProvider } from "@/lib/reviewHunkScope"
import { cn, formatPathForDisplay } from "@/lib/utils"
import type { GitStatus } from "@/lib/api/types"
import { combinedDiffStatsForPath, diffStatsForPath } from "@/lib/git/diffStats"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui"
import { ViewLoadingSkeleton } from "@/components/ui/ViewLoadingSkeleton"

import { ScrollableOverlay } from "@/components/ui/ScrollableOverlay"
import { getLanguageFromExtension, isImageFile } from "@/lib/toolHelpers"
import { useRuntimeAPIs } from "@/hooks/useRuntimeAPIs"
import { DiffViewToggle } from "@/components/chat/message/DiffViewToggle"
import type { DiffViewMode } from "@/components/chat/message/types"
import { PierreDiffViewer } from "./PierreDiffViewer"
import { ReviewHunkAnnouncer } from "./ReviewHunkAnnouncer"
import { ReviewHunkMeasure } from "./usePublishReviewHunks"
import { DiffCommentSummaryBar } from "./DiffCommentSummaryBar"
import { ReviewThreadAnchorProvider } from "@/components/comments/ReviewThreadAnchorProvider"
import { ReviewFileRail, ReviewProgressCompact } from "./ReviewFileRail"
import { ReviewLanding } from "./git/ReviewLanding"
import { SessionChangesView, type SessionChangesModel } from "./SessionChangesView"
import { BranchChangesView, type BranchChangesModel } from "./BranchChangesView"
import { DiffHunkReviewList } from "./DiffHunkReviewList"
import { useDiffHunkRevert } from "./useDiffHunkRevert"
import { useDiffHunkStage } from "./useDiffHunkStage"
import { buildInlineCommentSessionKey } from "@/stores/useInlineCommentDraftStore"
import { useDeviceInfo } from "@/lib/device"
import { useElementWidth } from "@/hooks/useElementWidth"
import { FileTypeIcon } from "@/components/icons/FileTypeIcon"
import { Icon } from "@/components/icon/Icon"
import { getContextFileOpenFailureMessage, validateContextFileOpen } from "@/lib/contextFileOpenGuard"
import { sessionEvents } from "@/lib/sessionEvents"
import { useI18n } from "@/lib/i18n"
import type { I18nKey } from "@/lib/i18n/store"
import { describeGitChange } from "./git/changeDescriptors"
import { fetchGitFileDiffWithTimeout } from "./gitFileDiffLoader"
import { toViewAbsolutePath, viewPathsEqual } from "./viewPathUtils"

// Minimum width for side-by-side diff view (px)
const SIDE_BY_SIDE_MIN_WIDTH = 1100
const REVIEW_FILE_RAIL_MIN_WIDTH = 640
const LARGE_DIFF_CHANGED_LINES = 500

// Perf: limit concurrent expanded diffs in stacked view.
// Expanding many diffs mounts many Pierre instances + lots of DOM.
const getStackedViewDefaultExpandedCount = (fileCount: number): number => {
  if (fileCount <= 6) return fileCount
  if (fileCount <= 12) return 6
  if (fileCount <= 25) return 4
  return 2
}

type FileEntry = GitStatus["files"][number] & {
  insertions: number
  deletions: number
  isNew: boolean
}

type DiffData = { original: string; modified: string; isBinary?: boolean }
type DiffScope = "all" | "staged" | "working" | "session" | "turn" | "branch"

const REVIEW_SCOPE_OPTIONS: Array<{ scope: DiffScope; labelKey: I18nKey }> = [
  { scope: "all", labelKey: "diffView.scope.all" },
  { scope: "working", labelKey: "diffView.scope.working" },
  { scope: "staged", labelKey: "diffView.scope.staged" },
  { scope: "branch", labelKey: "diffView.scope.branch" },
]

const SESSION_SCOPE_OPTIONS: Array<{ scope: DiffScope; labelKey: I18nKey }> = [
  { scope: "session", labelKey: "diffView.scope.session" },
  { scope: "turn", labelKey: "diffView.scope.lastTurn" },
]

const EMPTY_SESSION_MODEL: SessionChangesModel = {
  phase: "loading",
  progressScope: "session",
  files: [],
  selectedLayout: null,
}

const isSessionReviewScope = (scope: DiffScope): scope is "session" | "turn" => scope === "session" || scope === "turn"

const EMPTY_BRANCH_MODEL: BranchChangesModel = {
  phase: "loading",
  progressScope: "branch",
  files: [],
  selectedLayout: null,
  selectedDiff: null,
  base: "",
  branches: [],
  truncated: false,
}

function sessionModelsEqual(left: SessionChangesModel, right: SessionChangesModel): boolean {
  if (
    left.phase !== right.phase ||
    left.progressScope !== right.progressScope ||
    left.selectedLayout !== right.selectedLayout ||
    left.files.length !== right.files.length
  ) {
    return false
  }
  return left.files.every((file, index) => {
    const other = right.files[index]
    return (
      file.path === other.path &&
      file.signature === other.signature &&
      file.insertions === other.insertions &&
      file.deletions === other.deletions &&
      file.status?.code === other.status?.code
    )
  })
}

function branchModelsEqual(left: BranchChangesModel, right: BranchChangesModel): boolean {
  const leftDiff = left.selectedDiff
  const rightDiff = right.selectedDiff
  if (
    left.phase !== right.phase ||
    left.progressScope !== right.progressScope ||
    left.selectedLayout !== right.selectedLayout ||
    left.base !== right.base ||
    left.truncated !== right.truncated ||
    left.files.length !== right.files.length ||
    left.branches.length !== right.branches.length ||
    leftDiff?.path !== rightDiff?.path ||
    leftDiff?.before !== rightDiff?.before ||
    leftDiff?.after !== rightDiff?.after
  ) {
    return false
  }
  return (
    left.branches.every((name, index) => name === right.branches[index]) &&
    left.files.every((file, index) => {
      const other = right.files[index]
      return (
        file.path === other.path &&
        file.signature === other.signature &&
        file.insertions === other.insertions &&
        file.deletions === other.deletions &&
        file.status?.code === other.status?.code
      )
    })
  )
}

const BinaryDiffPlaceholder = React.memo(() => {
  const { t } = useI18n()
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
      <div className="typography-meta text-muted-foreground">{t("diffView.binary.unavailable")}</div>
    </div>
  )
})

type DiffTabViewMode = "single" | "stacked"

const DIFF_VIEW_MODE_OPTIONS: Array<{
  value: DiffTabViewMode
  labelKey: I18nKey
  descriptionKey: I18nKey
}> = [
  {
    value: "single",
    labelKey: "diffView.mode.single.label",
    descriptionKey: "diffView.mode.single.description",
  },
  {
    value: "stacked",
    labelKey: "diffView.mode.stacked.label",
    descriptionKey: "diffView.mode.stacked.description",
  },
]

const isNewStatusFile = (file: GitStatus["files"][number]): boolean => {
  const { index, working_dir: workingDir } = file
  return index === "A" || workingDir === "A" || index === "?" || workingDir === "?"
}

const isStagedStatusFile = (file: GitStatus["files"][number]): boolean => {
  const indexCode = file.index?.trim()
  return Boolean(indexCode && indexCode !== "?")
}

const isWorkingStatusFile = (file: GitStatus["files"][number]): boolean => {
  const workingCode = file.working_dir?.trim()
  return Boolean(workingCode) || file.index === "?"
}

const getFirstChangedModifiedLine = (original: string, modified: string): number => {
  const originalLines = original.split("\n")
  const modifiedLines = modified.split("\n")
  const sharedLength = Math.min(originalLines.length, modifiedLines.length)

  for (let index = 0; index < sharedLength; index += 1) {
    if (originalLines[index] !== modifiedLines[index]) {
      return index + 1
    }
  }

  if (modifiedLines.length > originalLines.length) {
    return originalLines.length + 1
  }

  if (originalLines.length > modifiedLines.length) {
    return Math.max(1, modifiedLines.length)
  }

  return 1
}

const getFirstVisibleModifiedLineFromPatch = (patch: string): number | null => {
  if (!patch) {
    return null
  }

  const match = patch.match(/@@\s*-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/m)
  if (!match) {
    return null
  }

  const parsed = Number.parseInt(match[1], 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null
  }

  return parsed
}

const formatDiffTotals = (insertions?: number, deletions?: number) => {
  const added = insertions ?? 0
  const removed = deletions ?? 0
  if (!added && !removed) return null
  return (
    <span className="flex flex-shrink-0 items-center gap-1 typography-micro whitespace-nowrap">
      {added ? <span style={{ color: "var(--status-success)" }}>+{added}</span> : null}
      {removed ? <span style={{ color: "var(--status-error)" }}>-{removed}</span> : null}
    </span>
  )
}

interface FileSelectorProps {
  changedFiles: FileEntry[]
  selectedFile: string | null
  selectedFileEntry: FileEntry | null
  onSelectFile: (path: string) => void
  isMobile: boolean
  showModeSelector?: boolean
  mode?: DiffTabViewMode
  onModeChange?: (mode: DiffTabViewMode) => void
}

const FileSelector = React.memo<FileSelectorProps>(
  ({
    changedFiles,
    selectedFile,
    selectedFileEntry,
    onSelectFile,
    isMobile,
    showModeSelector = false,
    mode,
    onModeChange,
  }) => {
    const { t } = useI18n()
    const getLabel = React.useCallback(
      (path: string) => {
        if (!isMobile) return path
        const lastSlash = path.lastIndexOf("/")
        return lastSlash >= 0 ? path.slice(lastSlash + 1) : path
      },
      [isMobile],
    )

    if (changedFiles.length === 0) return null

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-7 min-w-0 max-w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2 typography-ui-label text-foreground outline-none hover:bg-interactive-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            {selectedFileEntry ? (
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <FileTypeIcon filePath={selectedFileEntry.path} className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="min-w-0 flex-1 truncate typography-meta">{getLabel(selectedFileEntry.path)}</span>
                {formatDiffTotals(selectedFileEntry.insertions, selectedFileEntry.deletions)}
              </div>
            ) : (
              <span className="text-muted-foreground">{t("diffView.selector.selectFile")}</span>
            )}
            <Icon name="arrow-down-s" className="size-4 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-[70vh] min-w-[320px] overflow-y-auto">
          {showModeSelector && mode && onModeChange ? (
            <>
              <DropdownMenuLabel className="typography-meta text-muted-foreground">
                {t("diffView.selector.viewMode")}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={mode} onValueChange={(value) => onModeChange(value as DiffTabViewMode)}>
                {DIFF_VIEW_MODE_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value} className="items-center">
                    <span className="typography-meta text-foreground">{t(option.labelKey)}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuRadioGroup value={selectedFile ?? ""} onValueChange={onSelectFile}>
            {changedFiles.map((file) => (
              <DropdownMenuRadioItem key={file.path} value={file.path}>
                <div className="flex w-full min-w-0 items-center gap-3">
                  <FileTypeIcon filePath={file.path} className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="min-w-0 flex-1 truncate typography-meta">{getLabel(file.path)}</span>
                  <span className="ml-auto">{formatDiffTotals(file.insertions, file.deletions)}</span>
                </div>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  },
)

interface DiffViewModeSelectorProps {
  mode: DiffTabViewMode
  onModeChange: (mode: DiffTabViewMode) => void
}

const DiffViewModeSelector = React.memo<DiffViewModeSelectorProps>(({ mode, onModeChange }) => {
  const { t } = useI18n()
  const currentOption = DIFF_VIEW_MODE_OPTIONS.find((option) => option.value === mode) ?? DIFF_VIEW_MODE_OPTIONS[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-7 min-w-0 max-w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2 typography-ui-label text-foreground outline-none hover:bg-interactive-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <span className="min-w-0 truncate typography-meta">{t(currentOption.labelKey)}</span>
          <Icon name="arrow-down-s" className="size-4 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[140px]">
        <DropdownMenuRadioGroup value={mode} onValueChange={(value) => onModeChange(value as DiffTabViewMode)}>
          {DIFF_VIEW_MODE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span className="typography-meta text-foreground">{t(option.labelKey)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

// Image diff viewer for binary image files
interface ImageDiffViewerProps {
  filePath: string
  diff: DiffData
  isVisible: boolean
  renderSideBySide: boolean
}

const ImageDiffViewer = React.memo<ImageDiffViewerProps>(({ filePath, diff, isVisible, renderSideBySide }) => {
  const { t } = useI18n()
  const hasOriginal = diff.original.length > 0
  const hasModified = diff.modified.length > 0

  if (!isVisible) {
    return <div className="absolute inset-0 hidden" />
  }

  // Render side-by-side or stacked based on preference
  const containerClass = renderSideBySide
    ? "flex flex-row gap-6 items-start justify-center h-full"
    : "flex flex-col gap-4 items-center"

  const imageContainerClass = renderSideBySide
    ? "flex flex-col items-center gap-2 flex-1 min-w-0 h-full"
    : "flex flex-col items-center gap-2"

  return (
    <div className="absolute inset-0 overflow-auto p-4" style={{ contain: "size layout" }}>
      <div className={containerClass}>
        {hasOriginal && (
          <div className={imageContainerClass}>
            <span className="typography-meta text-muted-foreground font-medium">{t("diffView.image.original")}</span>
            <img
              src={diff.original}
              alt={t("diffView.image.originalAlt", { path: filePath })}
              className={
                renderSideBySide ? "max-w-full max-h-[calc(100%-2rem)] object-contain" : "max-w-full object-contain"
              }
              style={{ imageRendering: "auto" }}
            />
          </div>
        )}
        {hasModified && (
          <div className={imageContainerClass}>
            <span className="typography-meta text-muted-foreground font-medium">
              {hasOriginal ? t("diffView.image.modified") : t("diffView.image.new")}
            </span>
            <img
              src={diff.modified}
              alt={t("diffView.image.modifiedAlt", { path: filePath })}
              className={
                renderSideBySide ? "max-w-full max-h-[calc(100%-2rem)] object-contain" : "max-w-full object-contain"
              }
              style={{ imageRendering: "auto" }}
            />
          </div>
        )}
      </div>
    </div>
  )
})

interface InlineImageDiffViewerProps {
  filePath: string
  diff: DiffData
  renderSideBySide: boolean
}

const InlineImageDiffViewer = React.memo<InlineImageDiffViewerProps>(({ filePath, diff, renderSideBySide }) => {
  const { t } = useI18n()
  const hasOriginal = diff.original.length > 0
  const hasModified = diff.modified.length > 0

  const containerClass = renderSideBySide
    ? "flex flex-row gap-6 items-start justify-center"
    : "flex flex-col gap-4 items-center"

  const imageContainerClass = renderSideBySide
    ? "flex flex-col items-center gap-2 flex-1 min-w-0"
    : "flex flex-col items-center gap-2"

  return (
    <div className="w-full overflow-auto p-4" style={{ contain: "layout" }}>
      <div className={containerClass}>
        {hasOriginal && (
          <div className={imageContainerClass}>
            <span className="typography-meta text-muted-foreground font-medium">{t("diffView.image.original")}</span>
            <img
              src={diff.original}
              alt={t("diffView.image.originalAlt", { path: filePath })}
              className={renderSideBySide ? "max-w-full max-h-[70vh] object-contain" : "max-w-full object-contain"}
              style={{ imageRendering: "auto" }}
            />
          </div>
        )}
        {hasModified && (
          <div className={imageContainerClass}>
            <span className="typography-meta text-muted-foreground font-medium">
              {hasOriginal ? t("diffView.image.modified") : t("diffView.image.new")}
            </span>
            <img
              src={diff.modified}
              alt={t("diffView.image.modifiedAlt", { path: filePath })}
              className={renderSideBySide ? "max-w-full max-h-[70vh] object-contain" : "max-w-full object-contain"}
              style={{ imageRendering: "auto" }}
            />
          </div>
        )}
      </div>
    </div>
  )
})

interface InlineDiffViewerProps {
  directory: string | null
  filePath: string
  diff: DiffData
  renderSideBySide: boolean
  wrapLines: boolean
  staged?: boolean
}

interface TextDiffViewerProps {
  directory: string | null
  filePath: string
  diff: DiffData
  renderSideBySide: boolean
  wrapLines: boolean
  /** Staged diffs come from the index; a working-tree hunk revert cannot touch them. */
  staged?: boolean
}

const TextDiffViewer = React.memo<TextDiffViewerProps>(
  ({ directory, filePath, diff, renderSideBySide, wrapLines, staged = false }) => {
    const language = React.useMemo(() => getLanguageFromExtension(filePath) || "text", [filePath])
    const { revertingHunkIndex, handleRevertHunk } = useDiffHunkRevert({ directory, filePath, diff })
    const { gitHunks, stagingHunkIndex, handleStageHunk } = useDiffHunkStage({ directory, filePath, diff, staged })

    return (
      <>
        <DiffHunkReviewList
          original={diff.original}
          modified={diff.modified}
          fileName={filePath}
          onRevertHunk={handleRevertHunk}
          revertingHunkIndex={revertingHunkIndex}
          gitHunks={gitHunks}
          onStageHunk={handleStageHunk}
          stagingHunkIndex={stagingHunkIndex}
          staged={staged}
        />
        <PierreDiffViewer
          original={diff.original}
          modified={diff.modified}
          language={language}
          fileName={filePath}
          renderSideBySide={renderSideBySide}
          wrapLines={wrapLines}
          layout="inline"
        />
      </>
    )
  },
)

TextDiffViewer.displayName = "TextDiffViewer"

const InlineDiffViewer = React.memo<InlineDiffViewerProps>(
  ({ directory, filePath, diff, renderSideBySide, wrapLines, staged = false }) => {
    if (diff.isBinary || isImageFile(filePath)) {
      return (
        <>
          <ReviewHunkMeasure path={filePath} original={null} modified={null} />
          {diff.isBinary ? (
            <BinaryDiffPlaceholder />
          ) : (
            <InlineImageDiffViewer filePath={filePath} diff={diff} renderSideBySide={renderSideBySide} />
          )}
        </>
      )
    }

    return (
      <div className="w-full" style={{ contain: "layout" }}>
        <TextDiffViewer
          directory={directory}
          filePath={filePath}
          diff={diff}
          renderSideBySide={renderSideBySide}
          wrapLines={wrapLines}
          staged={staged}
        />
      </div>
    )
  },
)

// Single diff viewer instance
interface SingleDiffViewerProps {
  directory: string | null
  filePath: string
  diff: DiffData
  isVisible: boolean
  renderSideBySide: boolean
  wrapLines: boolean
  staged?: boolean
}

const SingleDiffViewer = React.memo<SingleDiffViewerProps>(
  ({ directory, filePath, diff, isVisible, renderSideBySide, wrapLines, staged = false }) => {
    if (diff.isBinary || isImageFile(filePath)) {
      return (
        <>
          <ReviewHunkMeasure path={filePath} original={null} modified={null} />
          {diff.isBinary ? (
            <BinaryDiffPlaceholder />
          ) : (
            <ImageDiffViewer filePath={filePath} diff={diff} isVisible={isVisible} renderSideBySide={renderSideBySide} />
          )}
        </>
      )
    }

    // Don't render if not visible (memory optimization)
    if (!isVisible) {
      return null
    }

    return (
      <ScrollableOverlay
        outerClassName="absolute inset-0"
        disableHorizontal={false}
        observeMutations={false}
        preventOverscroll
        data-diff-virtual-root
        data-diff-virtual-content
      >
        <TextDiffViewer
          directory={directory}
          filePath={filePath}
          diff={diff}
          renderSideBySide={renderSideBySide}
          wrapLines={wrapLines}
          staged={staged}
        />
      </ScrollableOverlay>
    )
  },
)

interface MultiFileDiffEntryProps {
  directory: string
  file: FileEntry
  layout: "inline" | "side-by-side"
  wrapLines: boolean
  scrollRootRef: React.RefObject<HTMLElement | null>
  isSelected: boolean
  onSelect: (path: string) => void
  registerSectionRef: (path: string, node: HTMLDivElement | null) => void
  /** Start collapsed to reduce memory with many files */
  defaultCollapsed?: boolean
  expandRequestPath?: string | null
  expandRequestNonce?: number
  showOpenInEditorAction?: boolean
  isOpeningInEditor?: boolean
  onOpenInEditor?: (filePath: string, diffData: DiffData | null) => void
  staged?: boolean
  stagedRevision?: number
}

const MultiFileDiffEntry = React.memo<MultiFileDiffEntryProps>(
  ({
    directory,
    file,
    layout,
    wrapLines,
    scrollRootRef,
    isSelected,
    onSelect,
    registerSectionRef,
    defaultCollapsed = false,
    expandRequestPath = null,
    expandRequestNonce = 0,
    showOpenInEditorAction = false,
    isOpeningInEditor = false,
    onOpenInEditor,
    staged = false,
    stagedRevision = 0,
  }) => {
    const { t } = useI18n()
    const { git } = useRuntimeAPIs()
    const cachedDiff = useGitStore(
      React.useCallback(
        (state) => {
          return state.directories.get(directory)?.diffCache.get(file.path) ?? null
        },
        [directory, file.path],
      ),
    )
    const setDiff = useGitStore((state) => state.setDiff)
    const setDiffFileLayout = useUIStore((state) => state.setDiffFileLayout)

    const [isExpanded, setIsExpanded] = React.useState(!defaultCollapsed)
    const [hasBeenVisible, setHasBeenVisible] = React.useState(false)
    const [diffRetryNonce, setDiffRetryNonce] = React.useState(0)
    const [diffLoadError, setDiffLoadError] = React.useState<string | null>(null)
    const [isLoading, setIsLoading] = React.useState(false)
    const [forceRenderLarge, setForceRenderLarge] = React.useState(false)
    const hunkFocus = useReviewHunkFocus(file.path)
    React.useEffect(() => {
      if (hunkFocus) setForceRenderLarge(true)
    }, [hunkFocus])
    const [stagedDiffData, setStagedDiffData] = React.useState<DiffData | null>(null)
    const lastDiffRequestRef = React.useRef<string | null>(null)
    const sectionRef = React.useRef<HTMLDivElement | null>(null)

    const descriptor = React.useMemo(() => describeGitChange(file), [file])
    const renderSideBySide = layout === "side-by-side"

    const diffData = React.useMemo<DiffData | null>(() => {
      if (staged) return stagedDiffData
      if (!cachedDiff) return null
      return { original: cachedDiff.original, modified: cachedDiff.modified, isBinary: cachedDiff.isBinary }
    }, [cachedDiff, staged, stagedDiffData])

    const setSectionRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        sectionRef.current = node
        registerSectionRef(file.path, node)
      },
      [file.path, registerSectionRef],
    )

    const handleOpenChange = React.useCallback((open: boolean) => {
      setIsExpanded(open)
      if (open) {
        setHasBeenVisible(true)
      }
    }, [])

    const handleSelect = React.useCallback(() => {
      onSelect(file.path)
    }, [file.path, onSelect])

    React.useEffect(() => {
      if (!isExpanded || hasBeenVisible) return
      const target = sectionRef.current
      if (!target) return

      if (!scrollRootRef.current || typeof IntersectionObserver === "undefined") {
        setHasBeenVisible(true)
        return
      }

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setHasBeenVisible(true)
            observer.disconnect()
          }
        },
        { root: scrollRootRef.current, rootMargin: "200px 0px", threshold: 0.1 },
      )

      observer.observe(target)
      return () => observer.disconnect()
    }, [hasBeenVisible, isExpanded, scrollRootRef])

    React.useEffect(() => {
      if (expandRequestNonce <= 0 || expandRequestPath !== file.path) {
        return
      }

      setIsExpanded(true)
      setHasBeenVisible(true)
    }, [expandRequestNonce, expandRequestPath, file.path])

    React.useEffect(() => {
      if (!staged) {
        return
      }

      setStagedDiffData(null)
      setDiffLoadError(null)
      lastDiffRequestRef.current = null
      // `directory` must stay a dependency: this entry's React key doesn't include the
      // directory, and `stagedRevision` defaults to 0 for a directory with no recorded
      // index mutations yet, so switching directories can leave a previous directory's
      // staged diff cached here and shown/reverted against the newly active one.
    }, [directory, staged, stagedRevision])

    React.useEffect(() => {
      if (!isExpanded || !hasBeenVisible) return
      if (!directory || diffData) {
        lastDiffRequestRef.current = null
        setIsLoading(false)
        return
      }

      const requestKey = `${directory}::${file.path}::${staged ? `staged:${stagedRevision}` : "unstaged"}::${diffRetryNonce}`
      if (lastDiffRequestRef.current === requestKey) {
        return
      }
      lastDiffRequestRef.current = requestKey
      setDiffLoadError(null)
      setIsLoading(true)

      let cancelled = false
      void fetchGitFileDiffWithTimeout(git.getGitFileDiff, directory, { path: file.path, staged })
        .then((response) => {
          if (cancelled) return

          const nextDiff = {
            original: response.original ?? "",
            modified: response.modified ?? "",
            isBinary: response.isBinary,
          }
          if (staged) {
            setStagedDiffData(nextDiff)
          } else {
            setDiff(directory, file.path, nextDiff)
          }
          setIsLoading(false)
        })
        .catch((error) => {
          if (cancelled) return
          const message = error instanceof Error ? error.message : String(error)
          setDiffLoadError(message)
          setIsLoading(false)
        })

      return () => {
        cancelled = true
        if (lastDiffRequestRef.current === requestKey) {
          lastDiffRequestRef.current = null
        }
      }
    }, [
      directory,
      diffData,
      diffRetryNonce,
      file.path,
      git,
      hasBeenVisible,
      isExpanded,
      setDiff,
      staged,
      stagedRevision,
    ])

    const handleToggle = React.useCallback(() => {
      handleOpenChange(!isExpanded)
      handleSelect()
    }, [handleOpenChange, handleSelect, isExpanded])

    return (
      <div ref={setSectionRef} className="scroll-mt-4">
        <div className="sticky top-0 z-10 bg-background">
          <button
            type="button"
            onClick={handleToggle}
            className={cn(
              "group/header relative flex w-full items-center gap-2 px-3 py-1.5 rounded-t-xl border border-border/60 overflow-hidden",
              "bg-background",
              isExpanded ? "rounded-b-none" : "rounded-b-xl",
              "text-muted-foreground hover:text-foreground",
              isSelected ? "ring-1 ring-inset ring-[var(--interactive-selection)]" : null,
            )}
          >
            <div className="absolute inset-0 pointer-events-none group-hover/header:bg-interactive-hover" />
            <div className="relative flex min-w-0 flex-1 items-center gap-2">
              <span className="flex size-5 items-center justify-center opacity-70 group-hover/header:opacity-100">
                {isExpanded ? (
                  <Icon name="arrow-down-s" className="size-4" />
                ) : (
                  <Icon name="arrow-right-s" className="size-4" />
                )}
              </span>
              <span
                className="typography-micro font-semibold leading-none w-4 text-center uppercase"
                style={{ color: descriptor.color }}
                title={t(descriptor.descriptionKey)}
                aria-label={t(descriptor.descriptionKey)}
              >
                {descriptor.code}
              </span>
              <span className="min-w-0 flex-1 overflow-hidden typography-ui-label" title={file.path} dir="ltr">
                <span className="flex min-w-0 items-center gap-2">
                  <FileTypeIcon filePath={file.path} className="h-3.5 w-3.5 flex-shrink-0 align-middle" />
                  {(() => {
                    const lastSlash = file.path.lastIndexOf("/")
                    if (lastSlash === -1) {
                      return (
                        <span
                          className="block min-w-0 truncate typography-ui-label text-foreground"
                          style={{ direction: "rtl", textAlign: "left", unicodeBidi: "plaintext" }}
                        >
                          {file.path}
                        </span>
                      )
                    }

                    const dir = file.path.slice(0, lastSlash)
                    const name = file.path.slice(lastSlash + 1)

                    return (
                      <span className="flex min-w-0 items-baseline overflow-hidden">
                        <span
                          className="min-w-0 truncate typography-ui-label text-muted-foreground"
                          style={{ direction: "rtl", textAlign: "left", unicodeBidi: "plaintext" }}
                        >
                          {dir}
                        </span>
                        <span className="flex-shrink-0 typography-ui-label">
                          <span className="text-muted-foreground">/</span>
                          <span className="text-foreground">{name}</span>
                        </span>
                      </span>
                    )
                  })()}
                </span>
              </span>
            </div>
            <div className="relative flex items-center gap-2">
              {formatDiffTotals(file.insertions, file.deletions)}
              {showOpenInEditorAction && onOpenInEditor ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 opacity-70 hover:opacity-100"
                  title={t("diffView.actions.openFileInEditorAtChange")}
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenInEditor(file.path, diffData)
                  }}
                  disabled={isOpeningInEditor}
                >
                  {isOpeningInEditor ? (
                    <Icon name="loader-4" className="size-3.5 animate-spin" />
                  ) : (
                    <Icon name="edit" className="size-3.5" />
                  )}
                </Button>
              ) : null}
              <DiffViewToggle
                mode={renderSideBySide ? "side-by-side" : "unified"}
                onModeChange={(mode: DiffViewMode) => {
                  const nextLayout: "inline" | "side-by-side" = mode === "side-by-side" ? "side-by-side" : "inline"
                  setDiffFileLayout(directory, file.path, nextLayout)
                }}
                className="opacity-70"
              />
            </div>
          </button>
        </div>
        {isExpanded && (
          <div className="relative border border-t-0 border-border/60 bg-background rounded-b-xl overflow-hidden">
            {diffLoadError ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 typography-ui-label text-muted-foreground">
                <div className="typography-ui-label font-semibold text-foreground">Failed to load diff</div>
                <div className="typography-meta text-muted-foreground max-w-[32rem] text-center">{diffLoadError}</div>
                <button
                  type="button"
                  className="typography-ui-label text-primary hover:underline"
                  onClick={() => setDiffRetryNonce((nonce) => nonce + 1)}
                >
                  Retry
                </button>
              </div>
            ) : null}
            {isLoading && !diffData && !diffLoadError ? (
              <ViewLoadingSkeleton rows={3} label={t("diffView.state.loadingDiff")} />
            ) : null}
            {diffData && !forceRenderLarge && file.insertions + file.deletions > LARGE_DIFF_CHANGED_LINES ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 typography-ui-label text-muted-foreground">
                <ReviewHunkMeasure
                  path={file.path}
                  original={diffData.isBinary || isImageFile(file.path) ? null : diffData.original}
                  modified={diffData.isBinary || isImageFile(file.path) ? null : diffData.modified}
                />
                <div className="typography-ui-label font-semibold text-foreground">
                  Large diff ({file.insertions + file.deletions} changed lines)
                </div>
                <div className="typography-meta text-muted-foreground">
                  Rendering may be slow. You can still view the diff by clicking below.
                </div>
                <button
                  type="button"
                  className="typography-ui-label text-primary hover:underline"
                  onClick={() => setForceRenderLarge(true)}
                >
                  Render anyway
                </button>
              </div>
            ) : null}
            {diffData && (forceRenderLarge || file.insertions + file.deletions <= LARGE_DIFF_CHANGED_LINES) ? (
              <InlineDiffViewer
                directory={directory}
                filePath={file.path}
                diff={diffData}
                renderSideBySide={renderSideBySide}
                wrapLines={wrapLines}
                staged={staged}
              />
            ) : null}
          </div>
        )}
      </div>
    )
  },
)

interface DiffViewProps {
  hideStackedFileSidebar?: boolean
  stackedDefaultCollapsedAll?: boolean
  hideFileSelector?: boolean
  pinSelectedFileHeaderToTopOnNavigate?: boolean
  showOpenInEditorAction?: boolean
  diffScope?: DiffScope
  targetFilePath?: string | null
}

export const DiffView: React.FC<DiffViewProps> = ({
  hideStackedFileSidebar = false,
  stackedDefaultCollapsedAll = false,
  hideFileSelector = false,
  pinSelectedFileHeaderToTopOnNavigate = false,
  showOpenInEditorAction = false,
  diffScope: diffScopeProp,
  targetFilePath = null,
}) => {
  const { t } = useI18n()
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId)
  // A caller that pins a scope (the context panel) keeps it; the review pane lets the user choose,
  // like the Unstaged/Staged scopes of other review tools.
  const [chosenScope, setChosenScope] = React.useState<DiffScope>("all")
  // Session scopes describe one session; switching sessions returns to the git view instead of
  // silently carrying "This session" over to the next one.
  const [scopeSessionId, setScopeSessionId] = React.useState(currentSessionId)
  if (scopeSessionId !== currentSessionId) {
    setScopeSessionId(currentSessionId)
    if (isSessionReviewScope(chosenScope)) setChosenScope("all")
  }
  const scopeSelectable = diffScopeProp === undefined
  // Session scopes need a live session. A pinned caller (the context panel) keeps its git scope.
  const diffScope: DiffScope =
    diffScopeProp ??
    (currentSessionId || !isSessionReviewScope(chosenScope) ? chosenScope : "all")
  const sessionReview = isSessionReviewScope(diffScope) && Boolean(currentSessionId)
  const [sessionModel, setSessionModel] = React.useState<SessionChangesModel>(EMPTY_SESSION_MODEL)
  const [sessionSelected, setSessionSelected] = React.useState<string | null>(null)
  const sessionTrackKey = `${diffScope}:${currentSessionId ?? ""}`
  const [sessionTrack, setSessionTrack] = React.useState(sessionTrackKey)
  if (sessionTrack !== sessionTrackKey) {
    setSessionTrack(sessionTrackKey)
    setSessionModel(EMPTY_SESSION_MODEL)
    setSessionSelected(null)
  }
  const handleSessionModel = React.useCallback((model: SessionChangesModel) => {
    setSessionModel((current) => (sessionModelsEqual(current, model) ? current : model))
  }, [])
  React.useEffect(() => {
    if (!sessionReview) return
    setSessionSelected((current) => {
      if (current && sessionModel.files.some((file) => file.path === current)) return current
      return sessionModel.files[0]?.path ?? null
    })
  }, [sessionModel.files, sessionReview])
  const { git, files } = useRuntimeAPIs()
  const effectiveDirectory = useEffectiveDirectory()
  const reviewDirectory = effectiveDirectory ?? ""
  const reviewPaneId = React.useId()
  React.useEffect(() => () => disposeReviewHunkScope(reviewPaneId), [reviewPaneId])
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory)
  const { isMobile } = useDeviceInfo()
  const { ref: paneRef, width: paneWidth } = useElementWidth<HTMLDivElement>()
  const inlineCommentSessionKey = React.useMemo(
    () => buildInlineCommentSessionKey({ sessionId: currentSessionId, draftDirectory: effectiveDirectory ?? null }),
    [currentSessionId, effectiveDirectory],
  )

  const isGitRepo = useIsGitRepo(effectiveDirectory ?? null)
  const branchReview = diffScope === "branch" && isGitRepo !== false
  const embeddedReview = sessionReview || branchReview
  const [branchModel, setBranchModel] = React.useState<BranchChangesModel>(EMPTY_BRANCH_MODEL)
  const [branchSelected, setBranchSelected] = React.useState<string | null>(null)
  const branchTrackKey = `${diffScope}:${effectiveDirectory ?? ""}`
  const [branchTrack, setBranchTrack] = React.useState(branchTrackKey)
  if (branchTrack !== branchTrackKey) {
    setBranchTrack(branchTrackKey)
    setBranchModel(EMPTY_BRANCH_MODEL)
    setBranchSelected(null)
  }
  const handleBranchModel = React.useCallback((model: BranchChangesModel) => {
    setBranchModel((current) => (branchModelsEqual(current, model) ? current : model))
  }, [])
  React.useEffect(() => {
    if (!branchReview) return
    setBranchSelected((current) => {
      if (current && branchModel.files.some((file) => file.path === current)) return current
      return branchModel.files[0]?.path ?? null
    })
  }, [branchModel.files, branchReview])
  const status = useGitStatus(effectiveDirectory ?? null)
  const isLoadingStatus = useGitLoadingStatus(effectiveDirectory ?? null)
  const setActiveDirectory = useGitStore((state) => state.setActiveDirectory)
  const ensureStatus = useGitStore((state) => state.ensureStatus)
  const fetchStatus = useGitStore((state) => state.fetchStatus)
  const setDiff = useGitStore((state) => state.setDiff)
  const indexRevision = useGitStore(
    React.useCallback(
      (state) => {
        if (!effectiveDirectory) return 0
        return state.directories.get(effectiveDirectory)?.indexRevision ?? 0
      },
      [effectiveDirectory],
    ),
  )

  const [selectedFile, setSelectedFile] = React.useState<string | null>(null)
  const [selectedFileStaged, setSelectedFileStaged] = React.useState(false)
  const [selectedStagedDiffData, setSelectedStagedDiffData] = React.useState<DiffData | null>(null)
  const [stackedExpandTarget, setStackedExpandTarget] = React.useState<string | null>(null)
  const [stackedExpandRequestNonce, setStackedExpandRequestNonce] = React.useState(0)
  const [pinnedStackedTarget, setPinnedStackedTarget] = React.useState<string | null>(null)
  const [diffRetryNonce, setDiffRetryNonce] = React.useState(0)
  const [diffLoadError, setDiffLoadError] = React.useState<string | null>(null)
  const lastDiffRequestRef = React.useRef<string | null>(null)

  const pendingDiffFile = useUIStore((state) => state.pendingDiffFile)
  const pendingDiffStaged = useUIStore((state) => state.pendingDiffStaged)
  const setPendingDiffFile = useUIStore((state) => state.setPendingDiffFile)
  const diffLayoutPreference = useUIStore((state) => state.diffLayoutPreference)
  const diffFileLayout = useUIStore((state) => state.diffFileLayout)
  const setDiffLayoutForAllFiles = useUIStore((state) => state.setDiffLayoutForAllFiles)
  const diffWrapLinesStore = useUIStore((state) => state.diffWrapLines)
  const setDiffWrapLines = useUIStore((state) => state.setDiffWrapLines)
  const diffViewMode = useUIStore((state) => state.diffViewMode)
  const setDiffViewMode = useUIStore((state) => state.setDiffViewMode)
  const openContextFileAtLine = useUIStore((state) => state.openContextFileAtLine)
  const diffWrapLines = diffWrapLinesStore
  const forcedStaged = diffScope === "staged" ? true : diffScope === "working" ? false : null
  const activeDiffStaged = forcedStaged ?? selectedFileStaged

  const isStackedView = diffViewMode === "stacked"
  const isMobileLayout = isMobile || paneWidth <= 768
  const diffScrollRef = React.useRef<HTMLElement | null>(null)
  const fileSectionRefs = React.useRef(new Map<string, HTMLDivElement | null>())
  const pendingScrollTargetRef = React.useRef<string | null>(null)
  const pendingScrollFrameRef = React.useRef<number | null>(null)
  const shouldPinAfterAlignRef = React.useRef(false)

  React.useEffect(() => {
    if (!pinSelectedFileHeaderToTopOnNavigate || !isStackedView || !pinnedStackedTarget) {
      return
    }

    const scrollRoot = diffScrollRef.current
    if (!scrollRoot) {
      return
    }

    let rafId: number | null = null
    let cancelled = false
    let stableFrames = 0
    const stopAt = Date.now() + 1200
    let ignoreNextScrollEvents = 0

    const stop = () => {
      if (cancelled) {
        return
      }
      cancelled = true
      setPinnedStackedTarget(null)
    }

    const cancelOnUserInput = () => {
      stop()
    }

    const cancelOnScroll = () => {
      if (ignoreNextScrollEvents > 0) {
        ignoreNextScrollEvents -= 1
        return
      }
      stop()
    }

    window.addEventListener("wheel", cancelOnUserInput, { passive: true, capture: true })
    window.addEventListener("touchstart", cancelOnUserInput, { passive: true, capture: true })
    window.addEventListener("pointerdown", cancelOnUserInput, { capture: true })
    window.addEventListener("keydown", cancelOnUserInput, { capture: true })
    scrollRoot.addEventListener("scroll", cancelOnScroll, { passive: true })

    const tick = () => {
      if (cancelled || Date.now() > stopAt) {
        stop()
        return
      }

      const currentScrollRoot = diffScrollRef.current
      const node = fileSectionRefs.current.get(pinnedStackedTarget)
      if (!currentScrollRoot || !node) {
        stop()
        return
      }

      const rootRect = currentScrollRoot.getBoundingClientRect()
      const nodeRect = node.getBoundingClientRect()
      const delta = nodeRect.top - rootRect.top

      if (Math.abs(delta) <= 1) {
        stableFrames += 1
        if (stableFrames >= 2) {
          stop()
          return
        }
      } else {
        stableFrames = 0
        const maxTop = Math.max(0, currentScrollRoot.scrollHeight - currentScrollRoot.clientHeight)
        const nextTop = Math.min(maxTop, Math.max(0, currentScrollRoot.scrollTop + delta))
        if (Math.abs(nextTop - currentScrollRoot.scrollTop) <= 0.5) {
          stop()
          return
        }
        ignoreNextScrollEvents += 1
        currentScrollRoot.scrollTop = nextTop
      }

      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)

    return () => {
      cancelled = true
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      window.removeEventListener("wheel", cancelOnUserInput, true)
      window.removeEventListener("touchstart", cancelOnUserInput, true)
      window.removeEventListener("pointerdown", cancelOnUserInput, true)
      window.removeEventListener("keydown", cancelOnUserInput, true)
      scrollRoot.removeEventListener("scroll", cancelOnScroll)
    }
  }, [isStackedView, pinSelectedFileHeaderToTopOnNavigate, pinnedStackedTarget])

  const changedFiles: FileEntry[] = React.useMemo(() => {
    if (!status?.files) return []
    const diffStats = status.diffStats
    const includeFile =
      diffScope === "staged" ? isStagedStatusFile : diffScope === "working" ? isWorkingStatusFile : () => true

    // Each row reports its own scope; "all" adds the two up.
    const statsForFile = (filePath: string) => {
      if (diffScope === "staged") return diffStatsForPath(diffStats, filePath, "staged")
      if (diffScope === "working") return diffStatsForPath(diffStats, filePath, "working")
      return combinedDiffStatsForPath(diffStats, filePath)
    }

    return status.files
      .filter(includeFile)
      .map((file) => {
        const stats = statsForFile(file.path)
        return {
          ...file,
          insertions: stats.insertions,
          deletions: stats.deletions,
          isNew: isNewStatusFile(file),
        }
      })
      .sort((a, b) => a.path.localeCompare(b.path))
  }, [diffScope, status])

  const selectedFileEntry = React.useMemo(() => {
    if (!selectedFile) return null
    return changedFiles.find((file) => file.path === selectedFile) ?? null
  }, [changedFiles, selectedFile])

  const getLayoutForFile = React.useCallback(
    (file: FileEntry): "inline" | "side-by-side" => {
      const override = diffFileLayout[diffLayoutKey(effectiveDirectory, file.path)]
      if (override) return override

      if (diffLayoutPreference === "inline") {
        return "inline"
      }

      if (diffLayoutPreference === "side-by-side") {
        return "side-by-side"
      }

      const isNarrow = paneWidth < SIDE_BY_SIDE_MIN_WIDTH
      if (file.isNew || isNarrow) {
        return "inline"
      }

      return "side-by-side"
    },
    [diffFileLayout, diffLayoutPreference, effectiveDirectory, paneWidth],
  )

  const currentLayoutForSelectedFile = React.useMemo<"inline" | "side-by-side" | null>(() => {
    if (!selectedFileEntry) return null
    return getLayoutForFile(selectedFileEntry)
  }, [getLayoutForFile, selectedFileEntry])

  // Ensure git status on mount
  React.useEffect(() => {
    if (effectiveDirectory) {
      setActiveDirectory(effectiveDirectory)
      void ensureStatus(effectiveDirectory, git)
    }
  }, [effectiveDirectory, setActiveDirectory, ensureStatus, git])

  React.useEffect(() => {
    if (!effectiveDirectory) {
      return
    }

    return sessionEvents.onGitRefreshHint((hint) => {
      if (!viewPathsEqual(hint.directory, effectiveDirectory)) {
        return
      }
      void fetchStatus(effectiveDirectory, git)
    })
  }, [effectiveDirectory, fetchStatus, git])

  // Handle pending diff file from external navigation
  React.useEffect(() => {
    if (diffScope !== "all") {
      return
    }

    if (pendingDiffFile) {
      setSelectedFile(pendingDiffFile)
      setSelectedFileStaged(pendingDiffStaged)
      setSelectedStagedDiffData(null)
      setPendingDiffFile(null)
      if (isStackedView) {
        shouldPinAfterAlignRef.current = true
        pendingScrollTargetRef.current = pendingDiffFile
        setStackedExpandTarget(pendingDiffFile)
        setStackedExpandRequestNonce((nonce) => nonce + 1)
      }
    }
  }, [diffScope, isStackedView, pendingDiffFile, pendingDiffStaged, setPendingDiffFile])

  React.useEffect(() => {
    if (diffScope === "all") {
      return
    }

    const normalizedTarget = targetFilePath?.trim()
    if (!normalizedTarget) {
      return
    }

    setSelectedFile(normalizedTarget)
    setSelectedFileStaged(diffScope === "staged")
    setSelectedStagedDiffData(null)

    if (isStackedView) {
      shouldPinAfterAlignRef.current = true
      pendingScrollTargetRef.current = normalizedTarget
      setStackedExpandTarget(normalizedTarget)
      setStackedExpandRequestNonce((nonce) => nonce + 1)
    }
  }, [diffScope, isStackedView, targetFilePath])

  React.useEffect(() => {
    if (!activeDiffStaged) {
      return
    }

    setSelectedStagedDiffData(null)
    setDiffLoadError(null)
    lastDiffRequestRef.current = null
    // effectiveDirectory must stay a dependency: without it, switching directories while
    // viewing a staged diff (indexRevision defaults to 0 for a directory with no recorded
    // mutations yet, so it can be unchanged across the switch) leaves the previous
    // directory's staged diff cached in state and displayed/reverted against the new one.
  }, [activeDiffStaged, effectiveDirectory, indexRevision])

  // Auto-select first file (skip if we have a pending file to consume)
  React.useEffect(() => {
    if (!selectedFile && !pendingDiffFile && changedFiles.length > 0) {
      setSelectedFile(changedFiles[0].path)
    }
  }, [changedFiles, selectedFile, pendingDiffFile])

  // Clear selection if file no longer exists
  React.useEffect(() => {
    if (selectedFile && changedFiles.length > 0) {
      const stillExists = changedFiles.some((f) => f.path === selectedFile)
      if (!stillExists) {
        setSelectedFile(changedFiles[0]?.path ?? null)
      }
    }
  }, [changedFiles, selectedFile])

  const registerSectionRef = React.useCallback((path: string, node: HTMLDivElement | null) => {
    const map = fileSectionRefs.current
    if (node) {
      map.set(path, node)
    } else {
      map.delete(path)
    }
  }, [])

  type ScrollToFileResult = {
    ok: boolean
    aligned: boolean
    didMove: boolean
    atScrollLimit: boolean
    delta: number
  }

  const scrollToFile = React.useCallback((path: string): ScrollToFileResult => {
    const node = fileSectionRefs.current.get(path)
    const scrollRoot = diffScrollRef.current
    if (!node || !scrollRoot) {
      return { ok: false, aligned: false, didMove: false, atScrollLimit: false, delta: 0 }
    }

    const rootRect = scrollRoot.getBoundingClientRect()
    const nodeRect = node.getBoundingClientRect()
    const delta = nodeRect.top - rootRect.top

    const maxTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight)
    const desiredTop = scrollRoot.scrollTop + delta
    const nextTop = Math.min(maxTop, Math.max(0, desiredTop))
    const didMove = Math.abs(nextTop - scrollRoot.scrollTop) > 0.5
    scrollRoot.scrollTop = nextTop

    const aligned = Math.abs(delta) <= 1
    const atScrollLimit = nextTop <= 0.5 || nextTop >= maxTop - 0.5

    return { ok: true, aligned, didMove, atScrollLimit, delta }
  }, [])

  React.useEffect(() => {
    if (!isStackedView) {
      pendingScrollTargetRef.current = null
      shouldPinAfterAlignRef.current = false
      if (pendingScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current)
        pendingScrollFrameRef.current = null
      }
      return
    }

    const target = pendingScrollTargetRef.current
    if (!target) return

    let attempts = 0
    const maxAttempts = 120
    let cancelled = false
    let ignoreNextScrollEvents = 0
    let didRemoveListeners = false
    let stallFrames = 0
    const stopAt = Date.now() + 2000

    const removeListeners = () => {
      if (didRemoveListeners) {
        return
      }
      didRemoveListeners = true
      window.removeEventListener("wheel", cancelOnUserInput, true)
      window.removeEventListener("touchstart", cancelOnUserInput, true)
      window.removeEventListener("pointerdown", cancelOnUserInput, true)
      window.removeEventListener("keydown", cancelOnUserInput, true)
      scrollRoot?.removeEventListener("scroll", cancelOnScroll)
    }

    const cancelPending = () => {
      if (cancelled) {
        return
      }
      cancelled = true
      removeListeners()
      pendingScrollTargetRef.current = null
      shouldPinAfterAlignRef.current = false
      if (pendingScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current)
        pendingScrollFrameRef.current = null
      }
    }

    const cancelOnUserInput = () => {
      cancelPending()
    }

    const cancelOnScroll = () => {
      if (ignoreNextScrollEvents > 0) {
        ignoreNextScrollEvents -= 1
        return
      }
      cancelPending()
    }

    const scrollRoot = diffScrollRef.current
    window.addEventListener("wheel", cancelOnUserInput, { passive: true, capture: true })
    window.addEventListener("touchstart", cancelOnUserInput, { passive: true, capture: true })
    window.addEventListener("pointerdown", cancelOnUserInput, { capture: true })
    window.addEventListener("keydown", cancelOnUserInput, { capture: true })
    scrollRoot?.addEventListener("scroll", cancelOnScroll, { passive: true })

    const tryAlign = () => {
      if (Date.now() > stopAt) {
        cancelPending()
        pendingScrollFrameRef.current = null
        return
      }
      if (cancelled) {
        pendingScrollFrameRef.current = null
        return
      }
      const currentTarget = pendingScrollTargetRef.current
      if (!currentTarget) {
        cancelPending()
        pendingScrollFrameRef.current = null
        return
      }

      ignoreNextScrollEvents += 1
      const result = scrollToFile(currentTarget)
      if (!result.ok) {
        ignoreNextScrollEvents = Math.max(0, ignoreNextScrollEvents - 1)
        attempts += 1
        if (attempts < maxAttempts) {
          pendingScrollFrameRef.current = window.requestAnimationFrame(tryAlign)
        } else {
          cancelPending()
          pendingScrollFrameRef.current = null
        }
        return
      }

      if (!result.aligned) {
        attempts += 1
        if (!result.didMove) {
          stallFrames += 1
          // If we're clamped (e.g. target is near bottom) give layout a few frames to settle
          // (diff expansion / highlight can change scrollHeight), but don't fight user input.
          if (stallFrames < 6 && (result.atScrollLimit || Math.abs(result.delta) > 1)) {
            pendingScrollFrameRef.current = window.requestAnimationFrame(tryAlign)
            return
          }
        } else {
          stallFrames = 0
          if (attempts < maxAttempts) {
            pendingScrollFrameRef.current = window.requestAnimationFrame(tryAlign)
            return
          }
        }
      }

      if (pinSelectedFileHeaderToTopOnNavigate && shouldPinAfterAlignRef.current) {
        setPinnedStackedTarget(currentTarget)
      }
      cancelPending()
    }

    pendingScrollFrameRef.current = window.requestAnimationFrame(tryAlign)

    return () => {
      cancelled = true
      removeListeners()
      if (pendingScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current)
        pendingScrollFrameRef.current = null
      }
    }
  }, [isStackedView, pinSelectedFileHeaderToTopOnNavigate, scrollToFile, selectedFile, stackedExpandRequestNonce])

  const handleSelectFile = React.useCallback((value: string) => {
    setSelectedFile(value)
    setSelectedFileStaged(false)
    setSelectedStagedDiffData(null)
  }, [])

  const handleSelectFileAndScroll = React.useCallback(
    (value: string) => {
      if (pendingScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current)
        pendingScrollFrameRef.current = null
      }
      pendingScrollTargetRef.current = null

      setSelectedFile(value)
      setSelectedFileStaged(false)
      setSelectedStagedDiffData(null)

      if (!isStackedView) {
        shouldPinAfterAlignRef.current = false
        return
      }

      shouldPinAfterAlignRef.current = true
      pendingScrollTargetRef.current = value
      scrollToFile(value)
    },
    [isStackedView, scrollToFile],
  )

  const reviewKeyFiles = React.useMemo(
    () => changedFiles.map((file) => ({ path: file.path, signature: reviewFileSignature(file, diffScope) })),
    [changedFiles, diffScope],
  )

  useReviewPaneFileKeys({
    paneRef,
    directory: effectiveDirectory,
    scope: diffScope,
    // SessionChangesView and BranchChangesView listen on the same pane. An empty list lets that
    // handler own [, ], and v.
    files: embeddedReview ? [] : reviewKeyFiles,
    selectedFile: embeddedReview ? null : selectedFile,
    onSelectFile: handleSelectFileAndScroll,
  })

  const handleDiffViewModeChange = React.useCallback(
    (mode: DiffTabViewMode) => {
      setDiffViewMode(mode)
      if (mode === "stacked" && selectedFile) {
        const result = scrollToFile(selectedFile)
        if (!result.aligned) {
          pendingScrollTargetRef.current = selectedFile
        }
      }
    },
    [scrollToFile, selectedFile, setDiffViewMode],
  )

  const handleHeaderLayoutChange = React.useCallback(
    (mode: DiffViewMode) => {
      // The header picks the layout for every diff from now on — it writes the setting
      // that a file opened later, another worktree or the next launch reads. Writing a
      // per-file override for the files on screen left the setting at its old value, so
      // the pick was forgotten the moment a new file appeared while Appearance still
      // showed the old choice. The row toggle below stays per-file.
      setDiffLayoutForAllFiles(mode === "side-by-side" ? "side-by-side" : "inline")
    },
    [setDiffLayoutForAllFiles],
  )

  const renderSideBySide = (currentLayoutForSelectedFile ?? "side-by-side") === "side-by-side"
  const showFileRail =
    !embeddedReview &&
    !hideStackedFileSidebar &&
    !isMobile &&
    paneWidth >= REVIEW_FILE_RAIL_MIN_WIDTH &&
    isGitRepo !== false &&
    changedFiles.length > 0
  const showSessionRail =
    sessionReview && !isMobile && paneWidth >= REVIEW_FILE_RAIL_MIN_WIDTH && sessionModel.files.length > 0
  const showBranchRail =
    branchReview && !isMobile && paneWidth >= REVIEW_FILE_RAIL_MIN_WIDTH && branchModel.files.length > 0
  const showFileSelector = !embeddedReview && !hideFileSelector && !showFileRail
  const navFiles = sessionReview ? sessionModel.files : branchReview ? branchModel.files : changedFiles
  const navSelected = sessionReview ? sessionSelected : branchReview ? branchSelected : selectedFile
  const previousFilePath = adjacentReviewFile(navFiles, navSelected, -1)
  const nextFilePath = adjacentReviewFile(navFiles, navSelected, 1)
  const selectNavFile = sessionReview
    ? setSessionSelected
    : branchReview
      ? setBranchSelected
      : handleSelectFileAndScroll
  const hunkScopeKey = reviewPaneScopeKey(
    reviewDirectory,
    sessionReview
      ? `session:${sessionModel.progressScope}`
      : branchReview
        ? `branch:${branchModel.progressScope}`
        : `git:${diffScope}`,
  )
  const hunkKeyFiles = React.useMemo(
    () =>
      navFiles.map((file) =>
        isImageFile(file.path) ? { path: file.path, hunkCount: 0 as const } : { path: file.path },
      ),
    [navFiles],
  )
  const selectHunkFile = React.useCallback(
    (path: string) => {
      if (sessionReview) {
        setSessionSelected(path)
        return
      }
      if (branchReview) {
        setBranchSelected(path)
        return
      }
      handleSelectFileAndScroll(path)
      if (isStackedView) {
        setStackedExpandTarget(path)
        setStackedExpandRequestNonce((nonce) => nonce + 1)
      }
    },
    [branchReview, handleSelectFileAndScroll, isStackedView, sessionReview],
  )
  useReviewHunkKeys({
    paneRef,
    files: hunkKeyFiles,
    selectedFile: navSelected,
    onSelectFile: selectHunkFile,
    scopeKey: hunkScopeKey,
    scopeId: reviewPaneId,
    directory: reviewDirectory,
  })
  const summaryLoading = sessionReview
    ? sessionModel.phase === "loading" && sessionModel.files.length === 0
    : branchReview
      ? branchModel.phase === "loading" && branchModel.files.length === 0
      : isLoadingStatus && !status
  const summaryCount = sessionReview
    ? sessionModel.files.length
    : branchReview
      ? branchModel.files.length
      : changedFiles.length
  const showWrapControl = sessionReview
    ? Boolean(sessionSelected) && sessionModel.phase === "ready"
    : branchReview
      ? Boolean(branchSelected) && branchModel.phase === "ready"
      : Boolean(selectedFileEntry)

  const selectedCachedDiff = useGitStore(
    React.useCallback(
      (state) => {
        if (!effectiveDirectory || !selectedFile || activeDiffStaged) return null
        return state.directories.get(effectiveDirectory)?.diffCache.get(selectedFile) ?? null
      },
      [activeDiffStaged, effectiveDirectory, selectedFile],
    ),
  )

  const selectedDiffData = React.useMemo<DiffData | null>(() => {
    if (activeDiffStaged) return selectedStagedDiffData
    if (!selectedCachedDiff) return null
    return {
      original: selectedCachedDiff.original,
      modified: selectedCachedDiff.modified,
      isBinary: selectedCachedDiff.isBinary,
    }
  }, [activeDiffStaged, selectedCachedDiff, selectedStagedDiffData])

  const [openingEditorFilePath, setOpeningEditorFilePath] = React.useState<string | null>(null)

  const openFileInEditorAtChange = React.useCallback(
    async (filePath: string, cachedDiffData: DiffData | null) => {
      if (!effectiveDirectory || !filePath) {
        return
      }

      setOpeningEditorFilePath(filePath)
      try {
        let targetLine: number | null = null

        if (cachedDiffData && !cachedDiffData.isBinary && !isImageFile(filePath)) {
          targetLine = getFirstChangedModifiedLine(cachedDiffData.original, cachedDiffData.modified)
        }

        if (targetLine === null) {
          try {
            const patchResponse = await git.getGitDiff(effectiveDirectory, {
              path: filePath,
              staged: activeDiffStaged,
              contextLines: 3,
            })
            targetLine = getFirstVisibleModifiedLineFromPatch(patchResponse.diff)
          } catch {
            targetLine = null
          }
        }

        try {
          let diffForNavigation = cachedDiffData
          if (targetLine === null || !diffForNavigation) {
            const response = await git.getGitFileDiff(effectiveDirectory, { path: filePath, staged: activeDiffStaged })
            diffForNavigation = {
              original: response.original ?? "",
              modified: response.modified ?? "",
              isBinary: response.isBinary,
            }
            if (!activeDiffStaged) {
              setDiff(effectiveDirectory, filePath, diffForNavigation)
            }
          }

          const resolvedTargetLine =
            targetLine ??
            (diffForNavigation.isBinary || isImageFile(filePath)
              ? 1
              : getFirstChangedModifiedLine(diffForNavigation.original, diffForNavigation.modified))

          const absolutePath = toViewAbsolutePath(effectiveDirectory, filePath)
          const openValidation = await validateContextFileOpen(files, absolutePath)
          if (!openValidation.ok) {
            toast.error(getContextFileOpenFailureMessage(openValidation.reason))
            return
          }

          openContextFileAtLine(effectiveDirectory, absolutePath, resolvedTargetLine, 1)
        } catch (error) {
          // Both call sites fire this with `void`, so a rejected fetch (file deleted, renamed, or
          // refused by the server) used to become an unhandled rejection with no user-visible
          // result. Surface it like the file-open failure above instead.
          const message = error instanceof Error ? error.message : String(error)
          toast.error(getContextFileOpenFailureMessage("unreadable"), { description: message })
        }
      } finally {
        setOpeningEditorFilePath((current) => (current === filePath ? null : current))
      }
    },
    [activeDiffStaged, effectiveDirectory, files, git, openContextFileAtLine, setDiff],
  )

  const openSelectedFileInEditorAtChange = React.useCallback(async () => {
    if (!selectedFile) {
      return
    }

    await openFileInEditorAtChange(selectedFile, selectedDiffData)
  }, [openFileInEditorAtChange, selectedDiffData, selectedFile])

  // Branch review already has both sides from the merge-base diff. Asking git for the index
  // diff would navigate a deleted or renamed worktree file against the wrong baseline.
  const openBranchFileInEditor = React.useCallback(
    async (file: { path: string; before: string; after: string }) => {
      if (!effectiveDirectory || !file.path) {
        return
      }

      setOpeningEditorFilePath(file.path)
      try {
        const targetLine = isImageFile(file.path) ? 1 : getFirstChangedModifiedLine(file.before, file.after)
        const absolutePath = toViewAbsolutePath(effectiveDirectory, file.path)
        const openValidation = await validateContextFileOpen(files, absolutePath)
        if (!openValidation.ok) {
          toast.error(getContextFileOpenFailureMessage(openValidation.reason))
          return
        }

        openContextFileAtLine(effectiveDirectory, absolutePath, targetLine, 1)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        toast.error(getContextFileOpenFailureMessage("unreadable"), { description: message })
      } finally {
        setOpeningEditorFilePath((current) => (current === file.path ? null : current))
      }
    },
    [effectiveDirectory, files, openContextFileAtLine],
  )

  const isOpeningSelectedInEditor = Boolean(selectedFile && openingEditorFilePath === selectedFile)
  const isOpeningBranchInEditor = Boolean(
    branchModel.selectedDiff && openingEditorFilePath === branchModel.selectedDiff.path,
  )

  const hasCurrentDiff = activeDiffStaged ? !!selectedStagedDiffData : !!selectedCachedDiff
  const isCurrentFileLoading = !isStackedView && !!selectedFile && !hasCurrentDiff

  React.useEffect(() => {
    if (embeddedReview || isStackedView) {
      return
    }

    setDiffLoadError(null)

    if (!effectiveDirectory || !selectedFile) {
      lastDiffRequestRef.current = null
      return
    }

    if (activeDiffStaged ? selectedStagedDiffData : selectedCachedDiff) {
      lastDiffRequestRef.current = null
      return
    }

    const requestKey = `${effectiveDirectory}::${selectedFile}::${activeDiffStaged ? `staged:${indexRevision}` : "unstaged"}::${diffRetryNonce}`
    if (lastDiffRequestRef.current === requestKey) {
      return
    }
    lastDiffRequestRef.current = requestKey

    let cancelled = false
    void fetchGitFileDiffWithTimeout(git.getGitFileDiff, effectiveDirectory, {
      path: selectedFile,
      staged: activeDiffStaged,
    })
      .then((response) => {
        if (cancelled) return

        const nextDiff = {
          original: response.original ?? "",
          modified: response.modified ?? "",
          isBinary: response.isBinary,
        }
        if (activeDiffStaged) {
          setSelectedStagedDiffData(nextDiff)
        } else {
          setDiff(effectiveDirectory, selectedFile, nextDiff)
        }
      })
      .catch((error) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        setDiffLoadError(message)
      })

    return () => {
      cancelled = true
      if (lastDiffRequestRef.current === requestKey) {
        // Allow a retry if this request was cancelled due to directory/path churn.
        lastDiffRequestRef.current = null
      }
    }
  }, [
    activeDiffStaged,
    effectiveDirectory,
    indexRevision,
    embeddedReview,
    isStackedView,
    selectedFile,
    selectedCachedDiff,
    selectedStagedDiffData,
    git,
    setDiff,
    diffRetryNonce,
  ])

  // Render only the selected diff viewer to prevent memory bloat with many files
  const renderSelectedDiffViewer = () => {
    if (!effectiveDirectory || !selectedFile || !selectedDiffData) return null

    return (
      <SingleDiffViewer
        key={selectedFile}
        directory={effectiveDirectory}
        filePath={selectedFile}
        diff={selectedDiffData}
        isVisible={true}
        renderSideBySide={renderSideBySide}
        wrapLines={diffWrapLines}
        staged={activeDiffStaged}
      />
    )
  }

  const renderStackedDiffView = () => {
    if (!effectiveDirectory) return null

    const defaultExpandedCount = getStackedViewDefaultExpandedCount(changedFiles.length)
    const getFileStaged = (path: string) => {
      if (forcedStaged !== null) {
        return forcedStaged
      }
      return selectedFileStaged && path === selectedFile
    }

    return (
      <div className="flex flex-1 min-h-0 h-full gap-3 px-3 pb-3 pt-2">
        <ScrollableOverlay
          ref={diffScrollRef}
          outerClassName="flex-1 min-h-0 h-full"
          className="pr-2"
          disableHorizontal
          observeMutations={false}
          preventOverscroll
          data-diff-virtual-root
          data-diff-virtual-content
        >
          <div className="flex flex-col gap-3">
            {changedFiles.map((file, index) => (
              <MultiFileDiffEntry
                key={`${getFileStaged(file.path) ? "staged" : "unstaged"}:${file.path}`}
                directory={effectiveDirectory}
                file={file}
                layout={getLayoutForFile(file)}
                wrapLines={diffWrapLines}
                scrollRootRef={diffScrollRef}
                isSelected={file.path === selectedFile}
                onSelect={handleSelectFile}
                registerSectionRef={registerSectionRef}
                defaultCollapsed={stackedDefaultCollapsedAll ? true : index >= defaultExpandedCount}
                expandRequestPath={stackedExpandTarget}
                expandRequestNonce={stackedExpandRequestNonce}
                showOpenInEditorAction={showOpenInEditorAction}
                isOpeningInEditor={openingEditorFilePath === file.path}
                onOpenInEditor={(filePath, diffData) => {
                  void openFileInEditorAtChange(filePath, diffData)
                }}
                staged={getFileStaged(file.path)}
                stagedRevision={indexRevision}
              />
            ))}
          </div>
        </ScrollableOverlay>
      </div>
    )
  }

  const renderContent = () => {
    if (!effectiveDirectory) {
      return (
        <div className="flex flex-1 items-center justify-center typography-ui-label text-muted-foreground">
          {t("diffView.state.selectSessionDirectory")}
        </div>
      )
    }

    if (isLoadingStatus && !status) {
      return <ViewLoadingSkeleton label={t("diffView.state.loadingRepositoryStatus")} />
    }

    if (isGitRepo === false) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <Icon name="git-branch" className="size-8 text-muted-foreground" />
          <p className="typography-ui-label font-semibold text-foreground">{t("diffView.state.notGitRepository")}</p>
          <p className="typography-meta text-muted-foreground">{t("emptyState.git.description")}</p>
        </div>
      )
    }

    if (changedFiles.length === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <Icon name="check" className="size-8 text-status-success/50" />
          <p className="typography-ui-label font-semibold text-foreground">{t("emptyState.diff.title")}</p>
          <p className="typography-meta text-muted-foreground">{t("emptyState.diff.description")}</p>
        </div>
      )
    }

    if (isStackedView) {
      return renderStackedDiffView()
    }

    return (
      <div
        className="flex flex-1 min-h-0 overflow-hidden px-3 py-3 relative"
        data-diff-virtual-root
        data-diff-virtual-content
      >
        {renderSelectedDiffViewer()}
        {isCurrentFileLoading && !hasCurrentDiff && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 typography-ui-label text-muted-foreground">
            {diffLoadError ? (
              <div className="flex flex-col items-center gap-2">
                <div className="typography-ui-label font-semibold text-foreground">
                  {t("diffView.state.failedToLoadDiff")}
                </div>
                <div className="typography-meta text-muted-foreground max-w-[32rem] text-center">{diffLoadError}</div>
                <button
                  type="button"
                  className="typography-ui-label text-primary hover:underline"
                  onClick={() => {
                    setDiffLoadError(null)
                    setDiffRetryNonce((n) => n + 1)
                  }}
                >
                  {t("diffView.actions.retry")}
                </button>
              </div>
            ) : (
              <ViewLoadingSkeleton label={t("diffView.state.loadingDiff")} />
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <ReviewHunkScopeProvider id={reviewPaneId} directory={reviewDirectory}>
    <div
      ref={paneRef}
      tabIndex={-1}
      onPointerDown={(event) => {
        // Clicking diff text leaves focus on the body, where the review shortcuts cannot hear keys.
        const target = event.target as HTMLElement
        if (!target.closest("button, a[href], input, textarea, select, [contenteditable='true'], [tabindex]")) {
          paneRef.current?.focus({ preventScroll: true })
        }
      }}
      className="flex h-full flex-col overflow-hidden bg-background outline-none"
      data-review-changes
      data-review-width={Math.round(paneWidth)}
    >
      <ReviewHunkAnnouncer />
      <ReviewThreadAnchorProvider scope={JSON.stringify([effectiveDirectory, diffScope, currentSessionId])}>
      {effectiveDirectory ? (
        <div
          data-review-directory={effectiveDirectory}
          title={effectiveDirectory}
          className="min-w-0 shrink-0 truncate border-b border-border/50 px-3 py-2 typography-meta text-muted-foreground"
          style={{ direction: "rtl", textAlign: "left", unicodeBidi: "plaintext" }}
        >
          {formatPathForDisplay(effectiveDirectory, homeDirectory)}
        </div>
      ) : null}
      {effectiveDirectory && isGitRepo && (diffScope === "all" || diffScope === "working" || diffScope === "staged") ? (
        <ReviewLanding
          key={effectiveDirectory}
          directory={effectiveDirectory}
          scope={diffScope}
          sessionId={currentSessionId}
          files={changedFiles}
          onStaged={scopeSelectable ? () => setChosenScope("staged") : undefined}
        />
      ) : null}
      <div className="flex shrink-0 flex-wrap items-center gap-3 px-3 py-2 bg-background">
        {!isMobile && (
          <div className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground shrink-0">
            <Icon name="git-commit" className="h-4 w-4" />
            <span className="typography-ui-label font-semibold text-foreground">
              {summaryLoading
                ? t("diffView.state.loadingChanges")
                : summaryCount === 1
                  ? t("diffView.summary.changedFilesSingle", { count: summaryCount })
                  : t("diffView.summary.changedFilesPlural", { count: summaryCount })}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 normal-case"
            aria-label={t("diffView.nav.previousFile")}
            title={t("diffView.nav.previousFileTitle")}
            disabled={previousFilePath === null}
            onClick={() => {
              if (previousFilePath) selectNavFile(previousFilePath)
            }}
          >
            <Icon name="arrow-left-s" className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 normal-case"
            aria-label={t("diffView.nav.nextFile")}
            title={t("diffView.nav.nextFileTitle")}
            disabled={nextFilePath === null}
            onClick={() => {
              if (nextFilePath) selectNavFile(nextFilePath)
            }}
          >
            <Icon name="arrow-right-s" className="size-4" aria-hidden="true" />
          </Button>
        </div>
        {sessionReview && !showSessionRail && effectiveDirectory ? (
          <ReviewProgressCompact
            directory={effectiveDirectory}
            scope={sessionModel.progressScope}
            files={sessionModel.files}
            selectedFile={sessionSelected}
          />
        ) : branchReview && !showBranchRail && effectiveDirectory ? (
          <ReviewProgressCompact
            directory={effectiveDirectory}
            scope={branchModel.progressScope}
            files={branchModel.files}
            selectedFile={branchSelected}
          />
        ) : !embeddedReview && !showFileRail && effectiveDirectory ? (
          <ReviewProgressCompact
            directory={effectiveDirectory}
            scope={diffScope}
            files={changedFiles}
            selectedFile={selectedFile}
          />
        ) : null}
        {scopeSelectable && effectiveDirectory && isGitRepo !== false ? (
          <div
            role="radiogroup"
            aria-label={t("diffView.scope.label")}
            className="flex shrink-0 items-center rounded-md border border-border p-0.5"
            data-review-scope
          >
            {(currentSessionId ? [...REVIEW_SCOPE_OPTIONS, ...SESSION_SCOPE_OPTIONS] : REVIEW_SCOPE_OPTIONS).map(
              (option, index, options) => (
                <button
                  key={option.scope}
                  type="button"
                  role="radio"
                  aria-checked={diffScope === option.scope}
                  // One tab stop for the group; arrow keys move and select, as radio groups do.
                  tabIndex={diffScope === option.scope ? 0 : -1}
                  onClick={() => setChosenScope(option.scope)}
                  onKeyDown={(event) => {
                    const step =
                      event.key === "ArrowRight" || event.key === "ArrowDown"
                        ? 1
                        : event.key === "ArrowLeft" || event.key === "ArrowUp"
                          ? -1
                          : 0
                    if (!step) return
                    event.preventDefault()
                    const next = options[(index + step + options.length) % options.length]
                    setChosenScope(next.scope)
                    const group = event.currentTarget.parentElement
                    requestAnimationFrame(() =>
                      group?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus(),
                    )
                  }}
                  className={cn(
                    "rounded px-2 py-0.5 typography-micro normal-case",
                    diffScope === option.scope
                      ? "bg-interactive-hover text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(option.labelKey)}
                </button>
              ),
            )}
          </div>
        ) : null}
        {/* The rail replaces the file selector that carries the mode picker in narrow panes. */}
        {!embeddedReview && (!isMobileLayout || showFileRail) && (
          <DiffViewModeSelector mode={diffViewMode} onModeChange={handleDiffViewModeChange} />
        )}
        {showFileSelector && (
          <FileSelector
            changedFiles={changedFiles}
            selectedFile={selectedFile}
            selectedFileEntry={selectedFileEntry}
            onSelectFile={handleSelectFileAndScroll}
            isMobile={isMobileLayout}
            showModeSelector={isMobileLayout}
            mode={diffViewMode}
            onModeChange={handleDiffViewModeChange}
          />
        )}
        <div className="flex-1" />
        {showWrapControl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDiffWrapLines(!diffWrapLinesStore)}
            className={cn(
              "h-5 w-5 p-0 transition-opacity",
              diffWrapLines ? "text-foreground opacity-100" : "text-muted-foreground opacity-60 hover:opacity-100",
            )}
            title={diffWrapLines ? t("diffView.actions.disableLineWrap") : t("diffView.actions.enableLineWrap")}
          >
            <Icon name="text-wrap" className="size-4" />
          </Button>
        )}
        {showOpenInEditorAction && selectedFileEntry && !isStackedView && !embeddedReview && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 opacity-70 hover:opacity-100"
            onClick={() => {
              void openSelectedFileInEditorAtChange()
            }}
            disabled={isOpeningSelectedInEditor}
            title={t("diffView.actions.openFileAtFirstChangedLine")}
          >
            {isOpeningSelectedInEditor ? (
              <Icon name="loader-4" className="size-3.5 animate-spin" />
            ) : (
              <Icon name="edit" className="size-3.5" />
            )}
          </Button>
        )}
        {showOpenInEditorAction && branchReview && branchModel.selectedDiff ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 normal-case opacity-70 hover:opacity-100"
            onClick={() => {
              const selected = branchModel.selectedDiff
              if (selected) void openBranchFileInEditor(selected)
            }}
            disabled={isOpeningBranchInEditor}
            title={t("diffView.actions.openFileAtFirstChangedLine")}
          >
            {isOpeningBranchInEditor ? (
              <Icon name="loader-4" className="size-3.5 animate-spin" />
            ) : (
              <Icon name="edit" className="size-3.5" />
            )}
          </Button>
        ) : null}
        {sessionReview && sessionModel.selectedLayout ? (
          <DiffViewToggle
            mode={sessionModel.selectedLayout === "side-by-side" ? "side-by-side" : "unified"}
            onModeChange={handleHeaderLayoutChange}
          />
        ) : branchReview && branchModel.selectedLayout ? (
          <DiffViewToggle
            mode={branchModel.selectedLayout === "side-by-side" ? "side-by-side" : "unified"}
            onModeChange={handleHeaderLayoutChange}
          />
        ) : !embeddedReview && selectedFileEntry && currentLayoutForSelectedFile ? (
          <DiffViewToggle
            mode={currentLayoutForSelectedFile === "side-by-side" ? "side-by-side" : "unified"}
            onModeChange={handleHeaderLayoutChange}
          />
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1">
        {sessionReview && effectiveDirectory && currentSessionId ? (
          <SessionChangesView
            directory={effectiveDirectory}
            sessionID={currentSessionId}
            scope={diffScope === "turn" ? "turn" : "session"}
            paneRef={paneRef}
            paneWidth={paneWidth}
            allowRail={!isMobile && !hideStackedFileSidebar}
            selectedFile={sessionSelected}
            onSelectFile={setSessionSelected}
            wrapLines={diffWrapLines}
            onModelChange={handleSessionModel}
            onStaged={scopeSelectable ? () => setChosenScope("staged") : undefined}
          />
        ) : branchReview && effectiveDirectory ? (
          <BranchChangesView
            directory={effectiveDirectory}
            sessionId={currentSessionId}
            onStaged={scopeSelectable ? () => setChosenScope("staged") : undefined}
            paneRef={paneRef}
            paneWidth={paneWidth}
            allowRail={!isMobile && !hideStackedFileSidebar}
            selectedFile={branchSelected}
            onSelectFile={setBranchSelected}
            wrapLines={diffWrapLines}
            onOpenFile={showOpenInEditorAction ? (file) => void openBranchFileInEditor(file) : undefined}
            onModelChange={handleBranchModel}
          />
        ) : (
          <>
            {showFileRail && effectiveDirectory ? (
              <ReviewFileRail
                directory={effectiveDirectory}
                scope={diffScope}
                files={changedFiles}
                selectedFile={selectedFile}
                onSelectFile={handleSelectFileAndScroll}
                onOpenFile={(path) => {
                  const cached = useGitStore.getState().directories.get(effectiveDirectory)?.diffCache.get(path)
                  void openFileInEditorAtChange(
                    path,
                    cached ? { original: cached.original, modified: cached.modified, isBinary: cached.isBinary } : null,
                  )
                }}
              />
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{renderContent()}</div>
          </>
        )}
      </div>
      <DiffCommentSummaryBar
        sessionKey={inlineCommentSessionKey}
        onSelectFile={selectNavFile}
        showHint={Boolean(effectiveDirectory) && changedFiles.length > 0}
      />
      </ReviewThreadAnchorProvider>
    </div>
    </ReviewHunkScopeProvider>
  )
}
