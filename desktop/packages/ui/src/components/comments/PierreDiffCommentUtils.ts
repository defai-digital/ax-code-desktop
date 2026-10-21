import type { AnnotationSide, DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs"
import type { InlineCommentDraft } from "@/stores/useInlineCommentDraftStore"
import type { ReviewThread } from "@/stores/useReviewThreadStore"

/** An open thread re-anchored to the content on screen; outdated threads stay in the thread list only. */
export interface AnchoredReviewThread {
  thread: ReviewThread
  startLine: number
  endLine: number
}

export type PierreAnnotationData =
  | { type: "saved" | "edit"; draft: InlineCommentDraft }
  | { type: "new"; selection: SelectedLineRange }
  | { type: "thread"; anchored: AnchoredReviewThread }

export const toPierreAnnotationId = (meta: PierreAnnotationData): string => {
  if (meta.type === "new") {
    const start = Math.min(meta.selection.start, meta.selection.end)
    const end = Math.max(meta.selection.start, meta.selection.end)
    const side = meta.selection.side ?? "additions"
    return `new-comment-${side}-${start}-${end}`
  }
  if (meta.type === "thread") return `thread-${meta.anchored.thread.id}`

  return `draft-${meta.draft.id}`
}

interface BuildPierreLineAnnotationsOptions {
  drafts: InlineCommentDraft[]
  editingDraftId: string | null
  selection: SelectedLineRange | null
  threads?: readonly AnchoredReviewThread[]
}

export const buildPierreLineAnnotations = (
  options: BuildPierreLineAnnotationsOptions,
): DiffLineAnnotation<PierreAnnotationData>[] => {
  const { drafts, editingDraftId, selection, threads = [] } = options
  const annotations: DiffLineAnnotation<PierreAnnotationData>[] = []

  for (const anchored of threads) {
    annotations.push({
      lineNumber: Math.max(1, Math.floor(anchored.endLine)),
      side: anchored.thread.side === "original" ? "deletions" : "additions",
      metadata: { type: "thread", anchored },
    })
  }

  for (const draft of drafts) {
    if (!Number.isFinite(draft.endLine)) {
      continue
    }

    const lineNumber = Math.max(1, Math.floor(draft.endLine))
    const side: AnnotationSide = draft.side === "original" ? "deletions" : "additions"
    annotations.push({
      lineNumber,
      side,
      metadata: {
        type: draft.id === editingDraftId ? "edit" : "saved",
        draft,
      },
    })
  }

  if (selection && !editingDraftId) {
    annotations.push({
      lineNumber: Math.max(selection.start, selection.end),
      side: selection.side ?? "additions",
      metadata: { type: "new", selection },
    })
  }

  return annotations
}
