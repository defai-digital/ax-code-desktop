import React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { useReviewHunkFocus } from "@/lib/reviewHunkRegistry"
import { getFileHunks } from "./diffHunkRevert"
import type { FileDiffHunk } from "./gitHunkPatch"

interface DiffHunkReviewListProps {
  original: string
  modified: string
  fileName?: string
  onRevertHunk: (hunkIndex: number) => void
  revertingHunkIndex: number | null
  /** Hunks of the file's git diff text, matched to rows by new-side start line; omitted hides the per-hunk stage action. */
  gitHunks?: FileDiffHunk[] | null
  onStageHunk?: (gitHunkIndex: number) => void
  stagingHunkIndex?: number | null
  /** Staged rows unstage their hunk and have no working-tree revert. */
  staged?: boolean
}

export const DiffHunkReviewList: React.FC<DiffHunkReviewListProps> = React.memo(
  ({
    original,
    modified,
    fileName,
    onRevertHunk,
    revertingHunkIndex,
    gitHunks,
    onStageHunk,
    stagingHunkIndex,
    staged = false,
  }) => {
    const { t } = useI18n()
    const hunkFocus = useReviewHunkFocus(fileName)

    const hunks = React.useMemo(() => getFileHunks(original, modified, fileName ?? ""), [original, modified, fileName])

    // Rows come from the diff library's parse of the file contents; the git diff
    // text's hunks start at the same new-side line whenever both segment the
    // changes the same way, so a row is offered the action only for the exact
    // hunk it displays. A row without a match (binary edge cases, segmentation
    // disagreement) simply shows no action rather than acting on the wrong hunk.
    const gitHunkIndexByRow = React.useMemo(() => {
      if (!onStageHunk || !gitHunks) return null
      const byRow = new Map<number, number>()
      hunks.forEach((hunk, index) => {
        const gitHunkIndex = gitHunks.findIndex((candidate) => candidate.newStart === hunk.additionStart)
        if (gitHunkIndex >= 0) {
          byRow.set(index, gitHunkIndex)
        }
      })
      return byRow
    }, [gitHunks, hunks, onStageHunk])

    if (hunks.length === 0) {
      return null
    }

    return (
      <div className="flex flex-col border-b border-border/60 bg-[var(--surface-elevated)]">
        {hunks.map((hunk, index) => {
          const isReverting = revertingHunkIndex === index
          const header = (hunk.hunkSpecs ?? "").trim()
          const gitHunkIndex = gitHunkIndexByRow?.get(index)
          const hasStageAction = gitHunkIndexByRow != null && gitHunkIndex !== undefined
          const isStaging = hasStageAction && stagingHunkIndex === gitHunkIndex
          const stageBusy = stagingHunkIndex != null
          const active = hunkFocus?.hunkIndex === index
          return (
            <div
              key={`${header}-${index}`}
              data-review-hunk-index={index}
              data-review-hunk-focus={active ? "header" : undefined}
              aria-current={active ? "true" : undefined}
              className={`flex items-center gap-2 px-3 py-1 border-b border-border/40 last:border-b-0${active ? " ring-2 ring-inset ring-primary bg-primary/10" : ""}`}
            >
              <span className="flex-1 min-w-0 truncate font-mono typography-micro text-muted-foreground">{header}</span>
              <span className="shrink-0 typography-micro">
                <span style={{ color: "var(--status-success)" }}>+{hunk.additionLines}</span>
                <span className="text-muted-foreground mx-0.5">/</span>
                <span style={{ color: "var(--status-error)" }}>-{hunk.deletionLines}</span>
              </span>
              {hasStageAction && onStageHunk ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onStageHunk(gitHunkIndex as number)}
                      disabled={stageBusy}
                      className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={
                        staged
                          ? t("diffView.hunk.unstageAria", { hunk: header })
                          : t("diffView.hunk.stageAria", { hunk: header })
                      }
                    >
                      {isStaging ? (
                        <Icon name="loader-4" className="size-3.5 animate-spin" />
                      ) : (
                        <Icon name={staged ? "arrow-down" : "arrow-up"} className="size-3.5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8}>
                    {staged ? t("diffView.hunk.unstageTooltip") : t("diffView.hunk.stageTooltip")}
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {staged ? null : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onRevertHunk(index)}
                      disabled={revertingHunkIndex !== null}
                      className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={t("diffView.hunk.revertAria", { hunk: header })}
                    >
                      {isReverting ? (
                        <Icon name="loader-4" className="size-3.5 animate-spin" />
                      ) : (
                        <Icon name="arrow-go-back" className="size-3.5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8}>{t("diffView.hunk.revertTooltip")}</TooltipContent>
                </Tooltip>
              )}
            </div>
          )
        })}
      </div>
    )
  },
)

DiffHunkReviewList.displayName = "DiffHunkReviewList"
