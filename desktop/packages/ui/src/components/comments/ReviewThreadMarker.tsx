import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import type { AnchoredReviewThread } from "./PierreDiffCommentUtils"

/** A sent, open review thread shown at its current line, so open notes stay visible while reading the diff. */
export function ReviewThreadMarker({
  anchored,
  onResolve,
  maxWidth,
}: {
  anchored: AnchoredReviewThread
  onResolve: (threadId: string) => void
  maxWidth?: number
}) {
  const { t } = useI18n()
  const { thread, startLine, endLine } = anchored
  return (
    <div
      role="note"
      aria-label={t("diffView.threads.marker", { start: startLine, end: endLine })}
      data-review-thread-marker={thread.id}
      className="my-1 flex w-full items-start gap-2 rounded-md border border-[var(--status-info)]/40 bg-[var(--surface-elevated)] px-2 py-1.5 typography-meta"
      style={{ maxWidth: maxWidth ? `${Math.max(200, Math.floor(maxWidth))}px` : undefined }}
    >
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-info)]" aria-hidden="true" />
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground">{thread.text}</p>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 shrink-0 px-2 typography-micro"
        onClick={() => onResolve(thread.id)}
      >
        {t("diffView.threads.resolve")}
      </Button>
    </div>
  )
}
