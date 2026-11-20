import type { I18nKey } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n"
import type { EvidenceSeal, EvidenceSealReason } from "@/lib/supervision/evidenceSeal"
import { cn } from "@/lib/utils"

import { StatusMark, type StatusMarkKind } from "./StatusMark"

type Wording = { word: I18nKey; reason: I18nKey }

/** Reasons with nothing to bind to a commit show no seal: an empty chip would read as a claim. */
const WORDING: Partial<Record<EvidenceSealReason, Wording>> = {
  "same-commit": { word: "supervision.seal.word.current", reason: "supervision.seal.reason.sameCommit" },
  moved: { word: "supervision.seal.word.stale", reason: "supervision.seal.reason.moved" },
  mixed: { word: "supervision.seal.word.stale", reason: "supervision.seal.reason.mixed" },
  dirty: { word: "supervision.seal.word.uncommitted", reason: "supervision.seal.reason.dirty" },
  "no-head": { word: "supervision.seal.word.unconfirmed", reason: "supervision.seal.reason.noHead" },
  unread: { word: "supervision.seal.word.unconfirmed", reason: "supervision.seal.reason.unread" },
}

const MARK: Record<EvidenceSeal["state"], StatusMarkKind> = {
  current: "idle",
  stale: "stale",
  unverified: "idle",
}

interface VersionSealProps {
  seal: EvidenceSeal
  className?: string
}

/**
 * The commit a verification result is about, and whether that is still the tree on disk. The same chip is used
 * wherever a result is shown, so check counts are never printed without the commit they are about. It carries no
 * verdict colour: Desktop can prove which commit the checks ran on, not that the files were identical.
 */
export function VersionSeal(props: VersionSealProps) {
  const { seal, className } = props
  const { t } = useI18n()
  const wording = WORDING[seal.reason]
  if (!wording) return null
  const head = seal.head ?? ""
  const checked = seal.checked ?? ""
  const reason = t(wording.reason, { head, checked })
  // A moved HEAD shows both commits. Mixed checks have no single commit, and showing HEAD would claim they ran on it.
  const commits = seal.reason === "moved" ? `${checked} → ${head}` : seal.reason === "mixed" ? "" : checked || head
  return (
    <span
      data-version-seal={seal.state}
      data-seal-reason={seal.reason}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 typography-micro text-foreground",
        seal.state === "stale" ? "border-dashed border-muted-foreground bg-muted" : "border-border bg-transparent",
        className,
      )}
    >
      <StatusMark kind={MARK[seal.state]} />
      <span className="sr-only">{reason}</span>
      <span aria-hidden="true" title={reason} className="min-w-0 truncate font-mono tabular-nums">
        {commits ? `${commits} · ` : ""}
        {t(wording.word)}
      </span>
    </span>
  )
}
