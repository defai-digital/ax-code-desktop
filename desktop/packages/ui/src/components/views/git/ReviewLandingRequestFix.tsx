import { Button } from "@/components/ui/button"
import { useEvidenceSeal, useSessionVerification } from "@/hooks/useEvidenceSeal"
import { useI18n } from "@/lib/i18n"
import type { MissionPullRequest } from "@/lib/supervision/pullRequestCache"
import { requestFixKind } from "@/lib/supervision/requestFix"
import { useUIStore } from "@/stores/useUIStore"
import { useInputStore } from "@/sync/input-store"
import { useSessionUIStore } from "@/sync/session-ui-store"

/**
 * Starts a fix request from the evidence instead of from the transcript. It only writes a draft into the composer,
 * naming the commit the checks ran on; the person edits and sends it, so nothing is dispatched by this button.
 */
export function ReviewLandingRequestFix({
  directory,
  sessionId,
  pullRequest,
}: {
  directory: string
  sessionId: string
  pullRequest?: MissionPullRequest | null
}) {
  const { t } = useI18n()
  const checks = useSessionVerification(sessionId, directory)
  const seal = useEvidenceSeal(checks, directory)
  const kind = requestFixKind(checks, seal, pullRequest)
  const onScreen = useSessionUIStore((state) => state.currentSessionId === sessionId)

  const request = () => {
    const commit = seal.checked ?? ""
    const text =
      kind === "stale"
        ? t("diffView.landing.requestFix.promptStale", { commit })
        : kind === "failed"
          ? t("diffView.landing.requestFix.promptFailed", { count: checks?.failed ?? 0, commit })
          : kind === "pr-failed"
            ? t("diffView.landing.requestFix.promptPullRequest", { number: pullRequest?.number ?? 0 })
            : t("diffView.landing.requestFix.promptGeneral")
    // Read again at click time: the composer belongs to whichever session is on screen now.
    if (useSessionUIStore.getState().currentSessionId !== sessionId) return
    // Appended: whatever the person already typed stays.
    useInputStore.getState().setPendingInputText(text, "append", sessionId)
    // On mobile the review covers the chat, so the draft would be written where nobody can see it.
    const ui = useUIStore.getState()
    if (ui.isMobile) ui.setActiveMainTab("chat")
  }

  // The composer belongs to the session on screen, so a draft for another session has nowhere safe to go.
  if (!onScreen) return null

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      data-landing-request-fix={kind}
      title={t("diffView.landing.requestFix.hint")}
      onClick={request}
    >
      {t(kind === "pr-failed" ? "diffView.landing.requestFix.fixForward" : "diffView.landing.requestFix.action")}
    </Button>
  )
}
