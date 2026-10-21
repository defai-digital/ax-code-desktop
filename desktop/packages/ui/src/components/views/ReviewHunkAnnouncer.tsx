import { useI18n } from "@/lib/i18n"
import { useReviewHunkAnnouncement } from "@/lib/reviewHunkRegistry"

/** Polite live region for hunk locomotion. Empty until a change is focused. */
export function ReviewHunkAnnouncer() {
  const { t } = useI18n()
  const announcement = useReviewHunkAnnouncement()
  let text = ""
  if (announcement?.kind === "edge") {
    text = announcement.edge === "first" ? t("diffView.nav.firstChange") : t("diffView.nav.lastChange")
  } else if (announcement?.kind === "position") {
    text = announcement.header
      ? t("diffView.nav.changePositionWithHeader", {
          index: announcement.index,
          total: announcement.total,
          path: announcement.path,
          header: announcement.header,
        })
      : t("diffView.nav.changePosition", {
          index: announcement.index,
          total: announcement.total,
          path: announcement.path,
        })
  }

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-review-hunk-announcement>
      {text}
    </div>
  )
}
