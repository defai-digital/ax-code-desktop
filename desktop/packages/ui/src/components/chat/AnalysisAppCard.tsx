import React from "react"
import { useI18n } from "@/lib/i18n"
import { toast } from "@/components/ui"
import { useSessionDirectory } from "@/sync/sync-context"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useSessionWorktreeStore } from "@/sync/session-worktree-store"
import { getAttachedSessionDirectory } from "@/sync/session-worktree-contract"
import { requestAnalysisAppRun, type AnalysisAppArtifact } from "@/lib/analysisAppArtifact"
import { useTerminalStore } from "@/stores/useTerminalStore"
import { useDeviceInfo } from "@/lib/device"
import { normalizeProjectActionDirectory } from "@/lib/projectActions"

/** Bound to the originating session, never the currently selected project's fallback. */
export function AnalysisAppCard({ artifact, sessionId }: { artifact: AnalysisAppArtifact; sessionId: string }) {
  const { t } = useI18n()
  const { isMobile } = useDeviceInfo()
  const sessionDirectory = useSessionDirectory(sessionId)
  const activeSessionId = useSessionUIStore((state) => state.currentSessionId)
  const legacyWorktree = useSessionUIStore((state) => state.worktreeMetadata.get(sessionId)?.path)
  const attachment = useSessionWorktreeStore((state) => state.getAttachment(sessionId))
  const directory = getAttachedSessionDirectory(attachment) || legacyWorktree || sessionDirectory
  const run = useTerminalStore((state) =>
    Object.values(state.projectActionRuns).find(
      (item) =>
        item.directory === normalizeProjectActionDirectory(directory ?? "") &&
        item.action?.streamlit?.entrypoint === artifact.entrypoint,
    ),
  )
  const busy = run && ["preparing", "waiting-for-preview", "stopping"].includes(run.status)
  const label = busy
    ? t("projectActions.streamlit.preparing")
    : run?.status === "running"
      ? t("projectActions.actions.openPreview")
      : t("projectActions.streamlit.run")
  return (
    <div className="my-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-elevated p-3">
      <code className="min-w-0 flex-1 break-all">{artifact.entrypoint}</code>
      <button
        type="button"
        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-interactive-hover disabled:opacity-50"
        disabled={isMobile || !directory || activeSessionId !== sessionId || Boolean(busy)}
        onClick={() => {
          if (isMobile || !directory || busy || useSessionUIStore.getState().currentSessionId !== sessionId) return
          if (!requestAnalysisAppRun({ sessionId, directory, artifact })) {
            toast.error(t("projectActions.error.noActiveDirectoryForAction"))
          }
        }}
      >
        {label}
      </button>
      {isMobile ? (
        <p className="w-full text-sm text-muted-foreground">{t("projectActions.streamlit.desktopWindow")}</p>
      ) : null}
    </div>
  )
}
