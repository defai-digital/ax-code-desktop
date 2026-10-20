import React from "react"

import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import {
  reviewFileSignature,
  reviewProgressKey,
  useReviewProgressStore,
  type ReviewProgressFile,
} from "@/stores/useReviewProgressStore"
import { describeGitChange } from "./git/changeDescriptors"

interface ReviewFileRailProps {
  directory: string
  scope: string
  files: ReviewProgressFile[]
  selectedFile: string | null
  onSelectFile: (path: string) => void
}

function splitReviewPath(path: string): { name: string; parent: string } {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  if (slash < 0) return { name: path, parent: "" }
  const name = path.slice(slash + 1)
  if (!name) return { name: path, parent: "" }
  return { name, parent: path.slice(0, slash) }
}

export const ReviewFileRail = React.memo<ReviewFileRailProps>(
  ({ directory, scope, files, selectedFile, onSelectFile }) => {
    const { t } = useI18n()
    const [filter, setFilter] = React.useState("")
    const listRef = React.useRef<HTMLUListElement>(null)
    const marks = useReviewProgressStore((state) => state.marks)
    const toggleViewed = useReviewProgressStore((state) => state.toggleViewed)

    const rows = React.useMemo(
      () =>
        files.map((file) => {
          const signature = reviewFileSignature(file)
          const parts = splitReviewPath(file.path)
          return {
            file,
            signature,
            name: parts.name,
            parent: parts.parent,
            descriptor: describeGitChange(file),
            viewed: marks[reviewProgressKey(directory, scope, file.path)] === signature,
          }
        }),
      [directory, files, marks, scope],
    )

    const query = filter.trim().toLowerCase()
    const visibleRows = query ? rows.filter((row) => row.file.path.toLowerCase().includes(query)) : rows
    const viewedCount = rows.reduce((count, row) => count + (row.viewed ? 1 : 0), 0)
    const progressLabel = t("diffView.rail.viewedProgress", { viewed: viewedCount, total: files.length })

    React.useEffect(() => {
      if (!selectedFile || !listRef.current) return
      if (typeof CSS === "undefined" || typeof CSS.escape !== "function") return
      const node = listRef.current.querySelector(`[data-review-file="${CSS.escape(selectedFile)}"]`)
      if (node instanceof HTMLElement) node.scrollIntoView({ block: "nearest" })
    }, [query, selectedFile])

    if (files.length === 0) return null

    const percent = (viewedCount / files.length) * 100

    return (
      <aside className="review-file-rail" aria-label={t("diffView.section.files")}>
        <div className="review-file-rail__header">
          <p className="review-file-rail__count">{progressLabel}</p>
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
        <ul ref={listRef} className="review-file-rail__files" role="list">
          {visibleRows.map((row) => {
            const selected = selectedFile === row.file.path
            const viewedLabel = t("diffView.rail.markViewed", { file: row.name })
            return (
              <li
                key={row.file.path}
                role="listitem"
                data-review-file={row.file.path}
                aria-current={selected ? "true" : undefined}
                className="review-file-rail__row"
              >
                <button type="button" className="review-file-rail__select" onClick={() => onSelectFile(row.file.path)}>
                  <span
                    className="review-file-rail__status"
                    style={{ color: row.descriptor.color }}
                    aria-label={t(row.descriptor.descriptionKey)}
                  >
                    {row.descriptor.code}
                  </span>
                  <span className="review-file-rail__identity" title={row.file.path}>
                    <span
                      className={
                        row.viewed ? "review-file-rail__name review-file-rail__name--viewed" : "review-file-rail__name"
                      }
                    >
                      {row.name}
                    </span>
                    {row.parent ? <span className="review-file-rail__parent">{row.parent}</span> : null}
                  </span>
                  <span className="review-file-rail__stats">
                    {row.file.insertions > 0 ? (
                      <span className="review-file-rail__ins">+{row.file.insertions}</span>
                    ) : null}
                    {row.file.deletions > 0 ? (
                      <span className="review-file-rail__del">-{row.file.deletions}</span>
                    ) : null}
                  </span>
                </button>
                <label className="review-file-rail__viewed">
                  <input
                    type="checkbox"
                    checked={row.viewed}
                    aria-label={viewedLabel}
                    title={viewedLabel}
                    onChange={() => toggleViewed(directory, scope, row.file.path, row.signature)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </label>
              </li>
            )
          })}
        </ul>
      </aside>
    )
  },
)

ReviewFileRail.displayName = "ReviewFileRail"

interface ReviewProgressCompactProps {
  directory: string
  scope: string
  files: ReviewProgressFile[]
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
      (count, file) => count + (marks[reviewProgressKey(directory, scope, file.path)] === reviewFileSignature(file) ? 1 : 0),
      0,
    )
    const selected = selectedFile ? files.find((file) => file.path === selectedFile) : undefined
    const selectedSignature = selected ? reviewFileSignature(selected) : null
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
