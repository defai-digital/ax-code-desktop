import React from "react"
import { createPortal } from "react-dom"
import type { SelectedLineRange } from "@pierre/diffs"
import type { InlineCommentDraft } from "@/stores/useInlineCommentDraftStore"
import { InlineCommentCard } from "./InlineCommentCard"
import { InlineCommentInput } from "./InlineCommentInput"
import { toPierreAnnotationId, type AnchoredReviewThread } from "./PierreDiffCommentUtils"
import { ReviewThreadMarker } from "./ReviewThreadMarker"
import type { PostRenderSignal } from "@/lib/postRenderSignal"

interface PierreDiffCommentOverlaysProps {
  diffRootRef: React.RefObject<HTMLDivElement | null>
  drafts: InlineCommentDraft[]
  selection: SelectedLineRange | null
  editingDraftId: string | null
  commentText: string
  fileLabel: string
  onSave: (text: string, range?: SelectedLineRange) => void
  onCancel: () => void
  onEdit: (draft: InlineCommentDraft) => void
  onDelete: (draft: InlineCommentDraft) => void
  threads?: readonly AnchoredReviewThread[]
  onResolveThread?: (threadId: string) => void
  /** Fires after each render of the diff; without it targets are checked only when the expected ids change. */
  postRenderSignal?: PostRenderSignal
}

const NO_THREADS: readonly AnchoredReviewThread[] = []

function parseCssWidth(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const parsed = Number.parseFloat(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (trimmed.endsWith("px")) {
    const parsed = Number.parseFloat(trimmed.slice(0, -2))
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function clampMaxWidth(value: number | null | undefined): number | undefined {
  if (!value || value <= 0) return undefined
  return Math.max(200, Math.floor(value))
}

export function PierreDiffCommentOverlays(props: PierreDiffCommentOverlaysProps) {
  const {
    diffRootRef,
    drafts,
    selection,
    editingDraftId,
    commentText,
    fileLabel,
    onSave,
    onCancel,
    onEdit,
    onDelete,
    threads = NO_THREADS,
    onResolveThread,
    postRenderSignal,
  } = props

  const [retryTick, setRetryTick] = React.useState(0)
  const [fallbackMaxWidth, setFallbackMaxWidth] = React.useState<number | null>(null)

  const selectionAnnotationId = React.useMemo(() => {
    if (!selection || editingDraftId) return null
    return toPierreAnnotationId({ type: "new", selection })
  }, [editingDraftId, selection])

  const expectedTargetIds = React.useMemo(() => {
    const ids = drafts.map((draft) =>
      toPierreAnnotationId({ type: draft.id === editingDraftId ? "edit" : "saved", draft }),
    )
    if (selectionAnnotationId) {
      ids.push(selectionAnnotationId)
    }
    if (onResolveThread) {
      for (const anchored of threads) ids.push(toPierreAnnotationId({ type: "thread", anchored }))
    }
    return ids
  }, [drafts, editingDraftId, onResolveThread, selectionAnnotationId, threads])

  const resolveTarget = React.useCallback(
    (annotationId: string): HTMLElement | null => {
      const wrapper = diffRootRef.current
      if (!wrapper) return null

      const host = wrapper.querySelector("diffs-container")
      if (!(host instanceof HTMLElement)) return null

      const lightDomTarget = host.querySelector(`[data-annotation-id="${annotationId}"]`)
      if (lightDomTarget instanceof HTMLElement) {
        return lightDomTarget
      }

      const shadowRoot = host.shadowRoot
      if (!shadowRoot) return null

      return shadowRoot.querySelector(`[data-annotation-id="${annotationId}"]`) as HTMLElement | null
    },
    [diffRootRef],
  )


  // Unsaved text of an open comment input, by portal key: when its line node is replaced the input mounts again and
  // starts from this instead of losing what was typed. Entries go with their annotation.
  const unsavedTextRef = React.useRef<Map<string, string>>(new Map())
  React.useEffect(() => {
    const live = new Set<string>()
    if (selectionAnnotationId) live.add(selectionAnnotationId)
    if (editingDraftId) live.add(`draft-edit-${editingDraftId}`)
    for (const key of Array.from(unsavedTextRef.current.keys())) {
      if (!live.has(key)) unsavedTextRef.current.delete(key)
    }
  }, [editingDraftId, selectionAnnotationId])
  const unsavedTextProps = (key: string) => ({
    initialText: unsavedTextRef.current.get(key) ?? commentText,
    onTextChange: (text: string) => unsavedTextRef.current.set(key, text),
  })

  React.useEffect(() => {
    const root = diffRootRef.current
    if (!root) return

    const computeMaxWidth = () => {
      const styles = getComputedStyle(root)
      const cssWidth = parseCssWidth(styles.getPropertyValue("--ax-context-panel-width"))
      const rootRect = root.getBoundingClientRect()
      const measured = cssWidth ?? rootRect.width
      setFallbackMaxWidth(measured > 0 ? measured : null)
    }

    computeMaxWidth()

    const observer = new ResizeObserver(() => {
      computeMaxWidth()
    })
    observer.observe(root)

    window.addEventListener("resize", computeMaxWidth)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", computeMaxWidth)
    }
  }, [diffRootRef])

  const resolveTargetMaxWidth = React.useCallback(
    (target: HTMLElement): number | undefined => {
      const root = diffRootRef.current
      const rootRect = root?.getBoundingClientRect()

      const annotationContent = target.closest("[data-annotation-content]")
      const contentRect =
        annotationContent instanceof HTMLElement
          ? annotationContent.getBoundingClientRect()
          : target.getBoundingClientRect()

      const candidates = [contentRect.width]
      if (rootRect) {
        candidates.push(rootRect.right - contentRect.left)
      }

      const positiveCandidates = candidates.filter((value) => Number.isFinite(value) && value > 0)
      if (positiveCandidates.length > 0) {
        return clampMaxWidth(Math.min(...positiveCandidates))
      }

      return clampMaxWidth(fallbackMaxWidth)
    },
    [diffRootRef, fallbackMaxWidth],
  )

  // A comment's line may not be mounted yet: the diff is virtualized and mounts lines as they scroll in. Re-check the
  // targets after every Pierre render and re-render only when one appeared, went away or was replaced, so a comment
  // attaches whenever its line arrives instead of giving up after a few frames (G UX-14). The width is compared too:
  // Pierre keeps the light-DOM target while its shadow slot leaves and returns, so a line scrolled back into view
  // can have the same target with a new size.
  const targetsRef = React.useRef<Map<string, { target: HTMLElement | null; width: number | undefined }>>(new Map())
  React.useEffect(() => {
    let frame: number | null = null
    const check = () => {
      frame = null
      const previous = targetsRef.current
      const next = new Map<string, { target: HTMLElement | null; width: number | undefined }>()
      let changed = previous.size !== expectedTargetIds.length
      for (const id of expectedTargetIds) {
        const target = resolveTarget(id)
        const width = target ? resolveTargetMaxWidth(target) : undefined
        next.set(id, { target, width })
        const before = previous.get(id)
        if (before?.target !== target || before.width !== width) changed = true
      }
      targetsRef.current = next
      if (changed) setRetryTick((tick) => tick + 1)
    }
    check()
    const unsubscribe = postRenderSignal?.subscribe(() => {
      if (frame === null) frame = requestAnimationFrame(check)
    })
    return () => {
      unsubscribe?.()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [expectedTargetIds, postRenderSignal, resolveTarget, resolveTargetMaxWidth])

  void retryTick

  return (
    <>
      {onResolveThread
        ? threads.map((anchored) => {
            const id = toPierreAnnotationId({ type: "thread", anchored })
            const target = resolveTarget(id)
            if (!target) return null
            return createPortal(
              <ReviewThreadMarker
                anchored={anchored}
                onResolve={onResolveThread}
                maxWidth={resolveTargetMaxWidth(target)}
              />,
              target,
              id,
            )
          })
        : null}
      {drafts.map((draft) => {
        const id = toPierreAnnotationId({ type: draft.id === editingDraftId ? "edit" : "saved", draft })
        const target = resolveTarget(id)
        if (!target) return null
        const targetMaxWidth = resolveTargetMaxWidth(target)

        if (draft.id === editingDraftId) {
          return createPortal(
            <InlineCommentInput
              {...unsavedTextProps(`draft-edit-${draft.id}`)}
              fileLabel={fileLabel}
              lineRange={{
                start: draft.startLine,
                end: draft.endLine,
                side: draft.side === "original" ? "deletions" : "additions",
              }}
              isEditing={true}
              onSave={onSave}
              onCancel={onCancel}
              maxWidth={targetMaxWidth}
            />,
            target,
            `draft-edit-${draft.id}`,
          )
        }

        return createPortal(
          <InlineCommentCard
            draft={draft}
            onEdit={() => onEdit(draft)}
            onDelete={() => onDelete(draft)}
            maxWidth={targetMaxWidth}
          />,
          target,
          `draft-card-${draft.id}`,
        )
      })}

      {selection &&
        !editingDraftId &&
        selectionAnnotationId &&
        (() => {
          const target = resolveTarget(selectionAnnotationId)
          if (!target) return null
          const targetMaxWidth = resolveTargetMaxWidth(target)

          return createPortal(
            <InlineCommentInput
              {...unsavedTextProps(selectionAnnotationId)}
              fileLabel={fileLabel}
              lineRange={selection}
              isEditing={false}
              onSave={onSave}
              onCancel={onCancel}
              maxWidth={targetMaxWidth}
            />,
            target,
            selectionAnnotationId,
          )
        })()}
    </>
  )
}
