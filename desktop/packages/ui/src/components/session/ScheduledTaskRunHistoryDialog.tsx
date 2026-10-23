import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Icon } from "@/components/icon/Icon"
import { useI18n, type I18nKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { fetchScheduledTaskRuns, type ScheduledTaskRun } from "@/lib/scheduledTasksApi"
import { useNow } from "@/hooks/useNow"
import { formatRunMoment } from "./scheduledTaskFormat"
import {
  SCHEDULED_TASK_RUN_HISTORY_LIMIT,
  formatRunDuration,
  mergeScheduledTaskRuns,
  runDurationMs,
  runOutcome,
  runStartedAt,
  summarizeScheduledTaskRuns,
  type ScheduledTaskRunOutcome,
} from "./scheduledTaskRunHistory"

export type ScheduledTaskRunHistoryTarget = {
  directory: string
  title: string
  projectLabel: string
  taskIDs: string[]
}

type Props = {
  target: ScheduledTaskRunHistoryTarget | null
  onOpenChange: (open: boolean) => void
}

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "loaded"; runs: ScheduledTaskRun[] }

const OUTCOME_LABEL: Record<ScheduledTaskRunOutcome, I18nKey> = {
  running: "sessions.sidebar.scheduled.history.outcome.running",
  success: "sessions.sidebar.scheduled.history.outcome.success",
  failed: "sessions.sidebar.scheduled.history.outcome.failed",
  timeout: "sessions.sidebar.scheduled.history.outcome.timeout",
  skipped: "sessions.sidebar.scheduled.history.outcome.skipped",
}

const OUTCOME_DOT: Record<ScheduledTaskRunOutcome, string> = {
  running: "bg-status-warning",
  success: "bg-status-success",
  failed: "bg-status-error",
  timeout: "bg-status-error",
  skipped: "bg-muted-foreground/40",
}

function OutcomeIcon({ outcome }: { outcome: ScheduledTaskRunOutcome }) {
  const className = "h-3.5 w-3.5 shrink-0"
  switch (outcome) {
    case "running":
      return <Icon name="loader-4" className={cn(className, "animate-spin text-status-warning")} />
    case "success":
      return <Icon name="checkbox-circle" className={cn(className, "text-status-success")} />
    case "failed":
      return <Icon name="close-circle" className={cn(className, "text-status-error")} />
    case "timeout":
      return <Icon name="timer" className={cn(className, "text-status-error")} />
    case "skipped":
      return <Icon name="time" className={cn(className, "text-muted-foreground")} />
  }
}

/**
 * Run history of one scheduled task (every part of a fan-out family merged):
 * a health strip of recent outcomes, a summary, and each run with its
 * trigger, start, duration and error.
 */
export function ScheduledTaskRunHistoryDialog({ target, onOpenChange }: Props): React.ReactNode {
  const { t } = useI18n()
  const [state, setState] = React.useState<LoadState>({ kind: "loading" })
  const [reloadToken, setReloadToken] = React.useState(0)
  const descriptionId = React.useId()

  React.useEffect(() => {
    if (!target) return
    let cancelled = false
    setState({ kind: "loading" })
    fetchScheduledTaskRuns(target.directory, target.taskIDs, SCHEDULED_TASK_RUN_HISTORY_LIMIT)
      .then((runs) => {
        if (cancelled) return
        setState({ kind: "loaded", runs: mergeScheduledTaskRuns(runs, SCHEDULED_TASK_RUN_HISTORY_LIMIT) })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          kind: "error",
          message:
            error instanceof Error && error.message
              ? error.message
              : t("sessions.sidebar.scheduled.history.loadFailed"),
        })
      })
    return () => {
      cancelled = true
    }
  }, [target, reloadToken, t])

  // Run moments ("today" vs a date) must follow a reactive clock, not a memoized mount read.
  const now = useNow()
  const runs = state.kind === "loaded" ? state.runs : []
  const summary = summarizeScheduledTaskRuns(runs)
  // Oldest to newest, so the strip reads left to right like a timeline.
  const strip = [...runs].reverse()

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={descriptionId}
        className="!max-w-[560px] w-[90vw] max-h-[80vh] gap-0 p-0 overflow-hidden flex flex-col"
      >
        <header className="shrink-0 px-5 pt-5 pb-3">
          <DialogTitle className="typography-ui-label font-medium text-foreground">
            {t("sessions.sidebar.scheduled.history.title", { taskName: target?.title ?? "" })}
          </DialogTitle>
          <DialogDescription id={descriptionId} className="typography-meta mt-0.5 text-muted-foreground">
            {t("sessions.sidebar.scheduled.history.description", {
              project: target?.projectLabel ?? "",
              count: SCHEDULED_TASK_RUN_HISTORY_LIMIT,
            })}
          </DialogDescription>
        </header>

        <div className="flex-1 min-h-0 overflow-auto px-5 pb-5">
          {state.kind === "loading" ? (
            <div className="space-y-2 py-2" aria-busy="true">
              <span className="sr-only">{t("sessions.scheduledTasks.dialog.loading")}</span>
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
            </div>
          ) : state.kind === "error" ? (
            <div className="flex items-center gap-2 py-2 typography-meta text-status-error" role="alert">
              <Icon name="error-warning" className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-words">{state.message}</span>
              <button
                type="button"
                className="shrink-0 rounded px-1 text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                onClick={() => setReloadToken((value) => value + 1)}
              >
                {t("sessions.scheduledTasks.dialog.actions.retry")}
              </button>
            </div>
          ) : runs.length === 0 ? (
            <p className="py-2 typography-meta text-muted-foreground">
              {t("sessions.sidebar.scheduled.history.empty")}
            </p>
          ) : (
            <>
              <div className="mb-3 space-y-1.5">
                <div className="flex items-center gap-[3px]" aria-hidden="true">
                  {strip.map((run) => (
                    <span
                      key={run.id}
                      className={cn("h-3 w-1.5 rounded-sm", OUTCOME_DOT[runOutcome(run)])}
                      title={`${formatRunMoment(runStartedAt(run), now)} · ${t(OUTCOME_LABEL[runOutcome(run)])}`}
                    />
                  ))}
                </div>
                <p className="typography-micro text-muted-foreground">
                  {summary.finished > 0
                    ? t("sessions.sidebar.scheduled.history.summary", {
                        succeeded: summary.succeeded,
                        finished: summary.finished,
                      })
                    : t("sessions.sidebar.scheduled.history.summaryNoneFinished")}
                  {summary.failureStreak > 1 ? (
                    <span className="text-status-error">
                      {" · "}
                      {t("sessions.sidebar.scheduled.history.failureStreak", { count: summary.failureStreak })}
                    </span>
                  ) : null}
                </p>
              </div>

              <ul className="divide-y divide-border/40">
                {runs.map((run) => {
                  const outcome = runOutcome(run)
                  const duration = runDurationMs(run)
                  return (
                    <li key={run.id} className="flex items-start gap-2 py-2">
                      <span className="mt-[2px]">
                        <OutcomeIcon outcome={outcome} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-1.5 typography-ui-label">
                          <span className="text-foreground">{t(OUTCOME_LABEL[outcome])}</span>
                          <span className="typography-micro text-muted-foreground">
                            {run.triggerType === "manual"
                              ? t("sessions.sidebar.scheduled.history.trigger.manual")
                              : t("sessions.sidebar.scheduled.history.trigger.scheduled")}
                          </span>
                          {run.coalescedCount > 0 ? (
                            <span
                              className="rounded px-1 typography-micro tabular-nums text-muted-foreground ring-1 ring-border"
                              title={t("sessions.sidebar.scheduled.history.coalescedTitle", {
                                count: run.coalescedCount,
                              })}
                            >
                              {t("sessions.sidebar.scheduled.history.coalesced", { count: run.coalescedCount })}
                            </span>
                          ) : null}
                        </div>
                        {run.error ? (
                          <p className="mt-0.5 whitespace-pre-wrap break-words typography-micro text-status-error">
                            {run.error}
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right typography-micro tabular-nums text-muted-foreground">
                        <div>{formatRunMoment(runStartedAt(run), now)}</div>
                        {duration !== undefined ? <div>{formatRunDuration(duration)}</div> : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
