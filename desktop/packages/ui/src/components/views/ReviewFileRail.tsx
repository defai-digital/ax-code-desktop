import React from "react"

import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import type { I18nKey } from "@/lib/i18n/store"
import {
  reviewFileSignatureDetail,
  reviewProgressKey,
  useReviewProgressStore,
  type ReviewProgressFile,
} from "@/stores/useReviewProgressStore"
import { describeGitChange } from "./git/changeDescriptors"
import {
  buildReviewFileTree,
  clampReviewRailWidth,
  directoryIdsInReviewTree,
  filterReviewTree,
  pruneReviewDirectoryCollapse,
  REVIEW_RAIL_MIN_WIDTH,
  REVIEW_RAIL_WIDTH_STEP,
  reviewRailMaxWidth,
  reviewSelectionAncestorKey,
  reviewTreeDirectoryKey,
  reviewTreeFileKey,
  reviewTreeKeyMotion,
  revealReviewSelection,
  sameReviewPaths,
  setReviewDirectoryCollapsed,
  setReviewRailMode,
  setReviewRailWidth,
  splitReviewPath,
  toggleReviewDirectory,
  useReviewRailSnapshot,
  visibleReviewStops,
  type ReviewFileTree,
  type ReviewRailMode,
  type ReviewTreeDirNode,
  type ReviewTreeFileNode,
  type ReviewTreeMotion,
} from "./reviewFileRailTree"

export interface ReviewRailStatus {
  code: string
  color: string
  descriptionKey: I18nKey
}

/**
 * Git rows keep index and working_dir. Their signature uses blob ids for the scope, and falls
 * back to line counts when those ids are missing (`data-review-signature-fallback`).
 * Session and branch rows pass a signature and a status letter and omit the git columns.
 */
export type ReviewRailFile = {
  path: string
  insertions: number
  deletions: number
  signature?: string
  /** Set when the signature fell back to line counts because blob ids were missing. */
  signatureFallback?: boolean
  status?: ReviewRailStatus
  index?: string
  working_dir?: string
}

interface ReviewFileRailProps {
  directory: string
  scope: string
  files: ReviewRailFile[]
  selectedFile: string | null
  onSelectFile: (path: string) => void
  /** Opens the file in the editor at its first change; omitted where there is no working-tree file to open. */
  onOpenFile?: (path: string) => void
}

type SignedRow = {
  file: ReviewRailFile
  signature: string
  fallback: boolean
  name: string
  parent: string
  descriptor: ReviewRailStatus
}

function railSignature(file: ReviewRailFile, scope: string): { signature: string; fallback: boolean } {
  if (file.signature !== undefined) return { signature: file.signature, fallback: file.signatureFallback === true }
  const detail = reviewFileSignatureDetail(file as ReviewProgressFile, scope)
  return { signature: detail.signature, fallback: detail.fallback }
}

function railStatus(file: ReviewRailFile): ReviewRailStatus {
  if (file.status) return file.status
  return describeGitChange({
    path: file.path,
    index: file.index ?? " ",
    working_dir: file.working_dir ?? " ",
  })
}

function useReviewFileTree(files: readonly { path: string }[]): ReviewFileTree {
  const cache = React.useRef<{ files: readonly { path: string }[]; tree: ReviewFileTree } | null>(null)
  const current = cache.current
  if (current && sameReviewPaths(current.files, files)) return current.tree
  const tree = buildReviewFileTree(files)
  cache.current = { files, tree }
  return tree
}

function usePaneWidth(shown: boolean): [React.RefObject<HTMLElement | null>, number] {
  const ref = React.useRef<HTMLElement | null>(null)
  const [paneWidth, setPaneWidth] = React.useState(0)
  React.useLayoutEffect(() => {
    if (!shown) return
    const parent = ref.current?.parentElement
    if (!parent) return
    const measure = () => {
      const next = parent.getBoundingClientRect().width
      setPaneWidth((currentWidth) => (currentWidth === next ? currentWidth : next))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [shown])
  return [ref, paneWidth]
}

export const ReviewFileRail = React.memo<ReviewFileRailProps>(
  ({ directory, scope, files, selectedFile, onSelectFile, onOpenFile }) => {
    const { t } = useI18n()
    const [filter, setFilter] = React.useState("")
    const listRef = React.useRef<HTMLDivElement>(null)
    const layout = useReviewRailSnapshot()
    const marks = useReviewProgressStore((state) => state.marks)
    const toggleViewed = useReviewProgressStore((state) => state.toggleViewed)
    const [railRef, paneWidth] = usePaneWidth(files.length > 0)
    const paneWidthRef = React.useRef(paneWidth)
    paneWidthRef.current = paneWidth

    const signed = React.useMemo(() => {
      const rows: SignedRow[] = []
      const byPath = new Map<string, SignedRow>()
      for (const file of files) {
        const signature = railSignature(file, scope)
        const parts = splitReviewPath(file.path)
        const row: SignedRow = {
          file,
          signature: signature.signature,
          fallback: signature.fallback,
          name: parts.name,
          parent: parts.parent,
          descriptor: railStatus(file),
        }
        rows.push(row)
        byPath.set(file.path, row)
      }
      return { rows, byPath }
    }, [files, scope])

    const tree = useReviewFileTree(files)
    const query = filter.trim().toLowerCase()
    const filtering = query.length > 0
    const visibleRows = filtering ? signed.rows.filter((row) => row.file.path.toLowerCase().includes(query)) : signed.rows
    const viewedCount = signed.rows.reduce(
      (count, row) => count + (marks[reviewProgressKey(directory, scope, row.file.path)] === row.signature ? 1 : 0),
      0,
    )
    const progressLabel = t("diffView.rail.viewedProgress", { viewed: viewedCount, total: files.length })
    const width = clampReviewRailWidth(layout.width, paneWidth)
    const maxWidth = reviewRailMaxWidth(paneWidth)
    const ariaMax = Number.isFinite(maxWidth) ? maxWidth : width

    // A string, not the ancestor array, so a rebuilt tree with the same ids does not re-open.
    const selectedAncestorKey = selectedFile ? reviewSelectionAncestorKey(tree.ancestors, selectedFile) : ""
    const revealedFile = React.useRef<string | null>(null)
    React.useEffect(() => {
      // Open a collapsed directory when selection lands inside it. The same file staying
      // selected must not pop the directory back open, so a scope change keeps its collapse.
      const previous = revealedFile.current
      revealedFile.current = selectedFile
      if (layout.mode !== "tree" || !selectedFile || previous === selectedFile) return
      const ancestorIds = selectedAncestorKey.length > 0 ? selectedAncestorKey.split("\0") : undefined
      revealReviewSelection(directory, scope, ancestorIds)
    }, [directory, layout.mode, scope, selectedAncestorKey, selectedFile])

    const directoryIdKey = React.useMemo(() => directoryIdsInReviewTree(tree.nodes).join("\0"), [tree])
    React.useEffect(() => {
      pruneReviewDirectoryCollapse(directory, scope, directoryIdKey.length > 0 ? directoryIdKey.split("\0") : [])
    }, [directory, directoryIdKey, scope])

    const shown = React.useMemo(() => filterReviewTree(tree.nodes, query), [query, tree])
    const collapsedIds = React.useMemo(() => {
      const ids = new Set<string>()
      if (filtering) return ids
      const prefix = `${directory}\0${scope}\0`
      for (const key of layout.collapsed) {
        if (key.startsWith(prefix)) ids.add(key.slice(prefix.length))
      }
      return ids
    }, [directory, filtering, layout.collapsed, scope])
    const stops = React.useMemo(() => visibleReviewStops(shown, collapsedIds), [collapsedIds, shown])
    const [activeTreeKey, setActiveTreeKey] = React.useState<string | null>(null)
    React.useEffect(() => {
      if (!selectedFile) return
      setActiveTreeKey(reviewTreeFileKey(selectedFile))
    }, [selectedFile])
    const selectedStop = selectedFile ? reviewTreeFileKey(selectedFile) : null
    const tabKey =
      (activeTreeKey && stops.some((stop) => stop.key === activeTreeKey) && activeTreeKey) ||
      (selectedStop && stops.some((stop) => stop.key === selectedStop) && selectedStop) ||
      stops[0]?.key ||
      null

    React.useEffect(() => {
      if (!selectedFile || !listRef.current) return
      if (typeof CSS === "undefined" || typeof CSS.escape !== "function") return
      const node = listRef.current.querySelector(`[data-review-file="${CSS.escape(selectedFile)}"]`)
      if (!(node instanceof HTMLElement)) return
      if (node.closest(".review-file-rail__branch--collapsed")) return
      node.scrollIntoView({ block: "nearest" })
    }, [filtering, layout.collapsed, layout.mode, query, selectedFile])

    const pendingTreeFocus = React.useRef<string | null>(null)
    const [treeFocusGeneration, setTreeFocusGeneration] = React.useState(0)
    const focusTreeStop = React.useCallback((key: string) => {
      pendingTreeFocus.current = key
      setActiveTreeKey(key)
      setTreeFocusGeneration((generation) => generation + 1)
    }, [])
    React.useLayoutEffect(() => {
      const key = pendingTreeFocus.current
      const root = listRef.current
      if (!key || !root) return
      const node = findTreeStop(root, key)
      if (!node) return
      pendingTreeFocus.current = null
      // Focus after tabIndex is updated. A tabindex of -1 is not always programmatically focusable.
      if (document.activeElement !== node) node.focus()
    }, [treeFocusGeneration])

    const applyTreeMotion = React.useCallback(
      (motion: ReviewTreeMotion) => {
        if (motion.type === "focus") {
          focusTreeStop(motion.key)
          return
        }
        if (motion.type === "select") {
          onSelectFile(motion.path)
          focusTreeStop(motion.key)
          return
        }
        if (motion.type === "expand") {
          setReviewDirectoryCollapsed(directory, scope, motion.directoryId, false)
          focusTreeStop(motion.key)
          return
        }
        if (motion.type === "collapse") {
          setReviewDirectoryCollapsed(directory, scope, motion.directoryId, true)
          focusTreeStop(motion.key)
          return
        }
        if (motion.type === "toggle") {
          toggleReviewDirectory(directory, scope, motion.directoryId)
          focusTreeStop(motion.key)
        }
      },
      [directory, focusTreeStop, onSelectFile, scope],
    )

    const commitWidth = React.useCallback((next: number) => {
      setReviewRailWidth(clampReviewRailWidth(next, paneWidthRef.current))
    }, [])

    const dragStop = React.useRef<(() => void) | null>(null)
    React.useEffect(() => {
      return () => dragStop.current?.()
    }, [])

    const onResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      dragStop.current?.()
      const handle = event.currentTarget
      try {
        handle.setPointerCapture(event.pointerId)
      } catch {
        // A pointer the platform already released cannot be captured; pointerup still ends the drag.
      }
      const startX = event.clientX
      const startWidth = clampReviewRailWidth(layout.width, paneWidthRef.current)
      const sign = getComputedStyle(handle).direction === "rtl" ? -1 : 1
      const onMove = (move: PointerEvent) => {
        commitWidth(startWidth + (move.clientX - startX) * sign)
      }
      const stop = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", stop)
        window.removeEventListener("pointercancel", stop)
        if (dragStop.current === stop) dragStop.current = null
        try {
          handle.releasePointerCapture(event.pointerId)
        } catch {
          // The handle may already be detached.
        }
      }
      dragStop.current = stop
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", stop)
      window.addEventListener("pointercancel", stop)
    }

    const onResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Home") {
        event.preventDefault()
        commitWidth(REVIEW_RAIL_MIN_WIDTH)
        return
      }
      if (event.key === "End") {
        event.preventDefault()
        const max = reviewRailMaxWidth(paneWidthRef.current)
        if (Number.isFinite(max)) commitWidth(max)
        return
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      event.preventDefault()
      const delta = event.key === "ArrowRight" ? REVIEW_RAIL_WIDTH_STEP : -REVIEW_RAIL_WIDTH_STEP
      commitWidth(width + delta)
    }

    const onTreeKeyDown = (event: React.KeyboardEvent<HTMLElement>, stopKey: string) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest("input, textarea, select, .review-file-rail__open")) return
      const nearest = target.closest("[role='treeitem']")
      if (nearest && nearest !== event.currentTarget) return
      if (event.key === "Enter" && target.closest("button, a")) return
      const motion = reviewTreeKeyMotion(stops, stopKey, event.key, filtering)
      if (
        motion.type === "ignore" &&
        (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Home" || event.key === "End")
      ) {
        event.preventDefault()
        return
      }
      if (motion.type === "ignore") return
      event.preventDefault()
      event.stopPropagation()
      applyTreeMotion(motion)
    }

    const fileLabel = (row: SignedRow, viewed: boolean) =>
      `${row.file.path}, ${t(row.descriptor.descriptionKey)}, ${t("diffView.rail.viewedProgress", {
        viewed: viewed ? 1 : 0,
        total: 1,
      })}`

    if (files.length === 0) return null

    const percent = (viewedCount / files.length) * 100
    const isViewed = (row: SignedRow) => marks[reviewProgressKey(directory, scope, row.file.path)] === row.signature

    const renderFile = (row: SignedRow, level: number | null, parentDirectory: string | null) => {
      const selected = selectedFile === row.file.path
      const viewed = isViewed(row)
      const viewedLabel = t("diffView.rail.markViewed", { file: row.name })
      const treeRow = level !== null
      const stopKey = reviewTreeFileKey(row.file.path)
      return (
        <div
          key={row.file.path}
          role={treeRow ? "treeitem" : "listitem"}
          aria-level={treeRow ? level : undefined}
          aria-label={fileLabel(row, viewed)}
          data-review-file={row.file.path}
          data-review-tree-kind={treeRow ? "file" : undefined}
          data-review-tree-stop={treeRow ? stopKey : undefined}
          data-review-parent-directory={parentDirectory ?? undefined}
          data-review-signature-fallback={row.fallback ? "true" : undefined}
          aria-current={selected ? "true" : undefined}
          tabIndex={treeRow ? (stopKey === tabKey ? 0 : -1) : undefined}
          className="review-file-rail__row"
          style={treeRow ? { paddingInlineStart: `${(level - 1) * 0.75}rem` } : undefined}
          onKeyDown={treeRow ? (event) => onTreeKeyDown(event, stopKey) : undefined}
        >
          <button
            type="button"
            className="review-file-rail__select"
            tabIndex={treeRow ? -1 : undefined}
            onClick={() => {
              if (treeRow) focusTreeStop(stopKey)
              onSelectFile(row.file.path)
            }}
          >
            <span
              className="review-file-rail__status"
              style={{ color: row.descriptor.color }}
              aria-label={t(row.descriptor.descriptionKey)}
            >
              {row.descriptor.code}
            </span>
            <span className="review-file-rail__identity" title={row.file.path}>
              <span className={viewed ? "review-file-rail__name review-file-rail__name--viewed" : "review-file-rail__name"}>
                {row.name}
              </span>
              {row.parent ? <span className="review-file-rail__parent">{row.parent}</span> : null}
            </span>
            <span className="review-file-rail__stats">
              {row.file.insertions > 0 ? <span className="review-file-rail__ins">+{row.file.insertions}</span> : null}
              {row.file.deletions > 0 ? <span className="review-file-rail__del">-{row.file.deletions}</span> : null}
            </span>
          </button>
          {onOpenFile ? (
            <button
              type="button"
              className="review-file-rail__open"
              tabIndex={treeRow ? -1 : undefined}
              aria-label={t("diffView.rail.openFile", { file: row.name })}
              title={t("diffView.rail.openFile", { file: row.name })}
              onClick={(event) => {
                event.stopPropagation()
                onOpenFile(row.file.path)
              }}
            >
              <Icon name="edit" className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
          <label className="review-file-rail__viewed">
            <input
              type="checkbox"
              checked={viewed}
              tabIndex={treeRow ? -1 : undefined}
              aria-label={viewedLabel}
              title={viewedLabel}
              onChange={() => toggleViewed(directory, scope, row.file.path, row.signature)}
              onClick={(event) => event.stopPropagation()}
            />
          </label>
          {viewed && row.fallback ? (
            <span
              role="img"
              aria-label={t("diffView.rail.viewedFallback")}
              title={t("diffView.rail.viewedFallback")}
              className="mr-1 shrink-0 text-muted-foreground"
            >
              <Icon name="information" className="h-3 w-3" aria-hidden="true" />
            </span>
          ) : null}
        </div>
      )
    }

    const renderDirectory = (node: ReviewTreeDirNode): React.ReactElement => {
      const open = filtering || !collapsedIds.has(node.id)
      let reviewed = 0
      for (const path of node.filePaths) {
        const row = signed.byPath.get(path)
        if (row && isViewed(row)) reviewed += 1
      }
      const summary = t("diffView.rail.directorySummary", {
        name: node.name,
        viewed: reviewed,
        total: node.filePaths.length,
      })
      const stopKey = reviewTreeDirectoryKey(node.id)
      return (
        <div
          key={node.id}
          role="treeitem"
          aria-expanded={open}
          aria-level={node.level}
          aria-label={summary}
          data-review-directory={node.id}
          data-review-tree-kind="dir"
          data-review-tree-stop={stopKey}
          data-review-parent-directory={node.parentId ?? undefined}
          tabIndex={stopKey === tabKey ? 0 : -1}
          className="review-file-rail__branch-item"
          onClick={(event) => {
            const target = event.target
            if (!(target instanceof Element) || target.closest("[role='group']")) return
            focusTreeStop(stopKey)
            if (!filtering) toggleReviewDirectory(directory, scope, node.id)
          }}
          onKeyDown={(event) => onTreeKeyDown(event, stopKey)}
        >
          <div
            className="review-file-rail__row review-file-rail__dir"
            style={{ paddingInlineStart: `${(node.level - 1) * 0.75}rem` }}
          >
            <Icon name={open ? "arrow-down-s" : "arrow-right-s"} className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="review-file-rail__name">{node.name}</span>
            <span className="review-file-rail__dir-count">
              {t("diffView.rail.viewedProgress", { viewed: reviewed, total: node.filePaths.length })}
            </span>
          </div>
          <div
            role="group"
            className={
              open ? "review-file-rail__branch" : "review-file-rail__branch review-file-rail__branch--collapsed"
            }
          >
            {renderTreeNodes(node.children)}
          </div>
        </div>
      )
    }

    const renderTreeNodes = (nodes: ReviewTreeDirNode["children"]): React.ReactNode =>
      nodes.map((child) =>
        child.kind === "dir"
          ? renderDirectory(child)
          : renderFile(signed.byPath.get(child.path) ?? missingRow(child), child.level, child.parentId),
      )

    return (
      <aside
        ref={railRef}
        className="review-file-rail"
        aria-label={t("diffView.section.files")}
        style={{ width, minWidth: width, maxWidth: width, flex: `0 0 ${width}px` }}
      >
        <div className="review-file-rail__header">
          <div className="review-file-rail__title-row">
            <p className="review-file-rail__count">{progressLabel}</p>
            <div role="group" aria-label={t("diffView.rail.viewMode")} className="review-file-rail__modes">
              <ModeButton mode="tree" current={layout.mode} label={t("diffView.rail.viewTree")} />
              <ModeButton mode="list" current={layout.mode} label={t("diffView.rail.viewList")} />
            </div>
          </div>
          <div
            className="review-file-rail__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={files.length}
            aria-valuenow={viewedCount}
            aria-label={progressLabel}
          >
            <div className="review-file-rail__progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <input
            type="search"
            className="review-file-rail__filter"
            placeholder={t("diffView.rail.filterPlaceholder")}
            aria-label={t("diffView.rail.filterPlaceholder")}
            value={filter}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        {layout.mode === "tree" ? (
          <div ref={listRef} className="review-file-rail__files" role="tree">
            {renderTreeNodes(shown)}
          </div>
        ) : (
          <div ref={listRef} className="review-file-rail__files" role="list">
            {visibleRows.map((row) => renderFile(row, null, null))}
          </div>
        )}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={REVIEW_RAIL_MIN_WIDTH}
          aria-valuemax={ariaMax}
          aria-valuenow={width}
          aria-label={t("diffView.rail.resize")}
          tabIndex={0}
          className="review-file-rail__resize"
          onPointerDown={onResizePointerDown}
          onKeyDown={onResizeKeyDown}
        />
      </aside>
    )
  },
)

ReviewFileRail.displayName = "ReviewFileRail"

function ModeButton({ mode, current, label }: { mode: ReviewRailMode; current: ReviewRailMode; label: string }) {
  return (
    <button
      type="button"
      className="review-file-rail__mode"
      aria-pressed={current === mode}
      onClick={() => setReviewRailMode(mode)}
    >
      {label}
    </button>
  )
}

function findTreeStop(root: ParentNode, key: string): HTMLElement | null {
  for (const node of root.querySelectorAll<HTMLElement>("[data-review-tree-stop]")) {
    if (node.getAttribute("data-review-tree-stop") === key) return node
  }
  return null
}

function missingRow(node: ReviewTreeFileNode): SignedRow {
  const parts = splitReviewPath(node.path)
  return {
    file: { path: node.path, insertions: 0, deletions: 0 },
    signature: "",
    fallback: false,
    name: parts.name || node.name,
    parent: parts.parent,
    descriptor: railStatus({ path: node.path, insertions: 0, deletions: 0 }),
  }
}

interface ReviewProgressCompactProps {
  directory: string
  scope: string
  files: ReviewRailFile[]
  selectedFile: string | null
}

/**
 * Review progress for panes too narrow for the rail: the viewed count and a toggle for the selected file,
 * so a split review keeps the same "mark viewed" loop the rail offers.
 */
export const ReviewProgressCompact = React.memo<ReviewProgressCompactProps>(
  ({ directory, scope, files, selectedFile }) => {
    const { t } = useI18n()
    const marks = useReviewProgressStore((state) => state.marks)
    const toggleViewed = useReviewProgressStore((state) => state.toggleViewed)
    if (files.length === 0) return null
    const viewedCount = files.reduce(
      (count, file) =>
        count +
        (marks[reviewProgressKey(directory, scope, file.path)] === railSignature(file, scope).signature ? 1 : 0),
      0,
    )
    const selected = selectedFile ? files.find((file) => file.path === selectedFile) : undefined
    const selectedSignature = selected ? railSignature(selected, scope).signature : null
    const selectedViewed =
      selected !== undefined && marks[reviewProgressKey(directory, scope, selected.path)] === selectedSignature
    const name = selected ? splitReviewPath(selected.path).name : ""
    return (
      <span className="review-progress-compact" data-review-progress-compact>
        <span className="review-progress-compact__count">
          {t("diffView.rail.viewedProgress", { viewed: viewedCount, total: files.length })}
        </span>
        {selected && selectedSignature ? (
          <button
            type="button"
            aria-pressed={selectedViewed}
            aria-label={t("diffView.rail.markViewed", { file: name })}
            title={t("diffView.rail.markViewed", { file: name })}
            className="review-progress-compact__toggle"
            onClick={() => toggleViewed(directory, scope, selected.path, selectedSignature)}
          >
            <Icon name={selectedViewed ? "checkbox" : "checkbox-blank"} className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </span>
    )
  },
)

ReviewProgressCompact.displayName = "ReviewProgressCompact"
