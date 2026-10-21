import React from "react"
import { Button } from "@/components/ui/button"
import { useSupervisionRows } from "@/hooks/useSupervisionRows"
import { useI18n } from "@/lib/i18n"
import { reanchorThread } from "@/lib/reanchorThread"
import { useReviewThreadStore, type ReviewThread } from "@/stores/useReviewThreadStore"
import { ReviewThreadContentsContext } from "@/components/comments/ReviewThreadAnchorContext"

export function ReviewThreadList({
  directory,
  threads,
  onSelectFile,
}: {
  directory: string
  threads: ReviewThread[]
  onSelectFile?: (file: string) => void
}) {
  const { t } = useI18n()
  const contents = React.useContext(ReviewThreadContentsContext)
  const setStatus = useReviewThreadStore((state) => state.setStatus)
  const rows = useSupervisionRows()
  const sessionTitles = React.useMemo(() => new Map(rows.map((row) => [row.sessionId, row.title])), [rows])
  // Re-anchoring scans file content, so it runs when threads or shown content change, not on every render.
  const anchors = React.useMemo(
    () =>
      new Map(
        threads.map((thread) => {
          const content = contents[thread.fileLabel]
          return [
            thread.id,
            content ? reanchorThread(thread.code, content[thread.side ?? "modified"], thread.startLine) : null,
          ] as const
        }),
      ),
    [threads, contents],
  )
  return (
    <ul aria-label={t("diffView.threads.list")} className="max-h-64 space-y-2 overflow-auto px-3 py-2">
      {threads.map((thread) => {
        const anchor = anchors.get(thread.id) ?? null
        const location =
          anchor?.status === "anchored"
            ? `${thread.fileLabel}:${anchor.startLine}-${anchor.endLine}`
            : t("diffView.threads.originalLine", {
                file: thread.fileLabel,
                start: thread.startLine,
                end: thread.endLine,
              })
        return (
          <li key={thread.id} className="space-y-1 rounded border border-border/60 p-2 typography-meta">
            <div className="break-all font-medium">{location}</div>
            <p className="whitespace-pre-wrap break-words">{thread.text}</p>
            <p className="break-all text-muted-foreground">
              {t("diffView.threads.recipient", {
                recipient: sessionTitles.get(thread.recipientSessionId) || thread.recipientSessionId,
              })}
              {" · "}
              {t(thread.status === "open" ? "diffView.threads.open" : "diffView.threads.resolved")}
              {" · "}
              {t(thread.side === "original" ? "diffView.threads.original" : "diffView.threads.modified")}
              {anchor?.status === "outdated" ? <> · {t("diffView.threads.outdated")}</> : null}
              {!anchor ? <> · {t("diffView.threads.unchecked")}</> : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="normal-case"
                onClick={() => setStatus(directory, thread.id, thread.status === "open" ? "resolved" : "open")}
              >
                {t(thread.status === "open" ? "diffView.threads.resolve" : "diffView.threads.reopen")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="normal-case"
                disabled={!onSelectFile}
                onClick={() => onSelectFile?.(thread.fileLabel)}
              >
                {t("diffView.threads.jump")}
              </Button>
            </div>
          </li>
        )
      })}
      {threads.length === 0 ? <li>{t("diffView.threads.empty")}</li> : null}
    </ul>
  )
}
