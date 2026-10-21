import React from "react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui"
import { useRuntimeAPIs } from "@/hooks/useRuntimeAPIs"
import { useI18n } from "@/lib/i18n"
import { useGitLoadingStatus, useGitStatus, useGitStore } from "@/stores/useGitStore"
import {
  reviewFileSignature,
  reviewFileSignatureDetail,
  reviewProgressKey,
  useReviewProgressStore,
  type ReviewGitScope,
  type ReviewProgressFile,
} from "@/stores/useReviewProgressStore"
import { CommitInput } from "./CommitInput"
import { commitChanges, pushChanges } from "./landingActions"
import { isConflictedStatusFile } from "../useDiffHunkStage"

interface ReviewLandingProps {
  directory: string
  scope: ReviewGitScope
  files: readonly ReviewProgressFile[]
  onStaged?: () => void
}

/** One explicit action at a time: stage the reviewed set, compose a commit, then push. */
export function ReviewLanding({ directory, scope, files, onStaged }: ReviewLandingProps) {
  const { t } = useI18n()
  const { git } = useRuntimeAPIs()
  const status = useGitStatus(directory)
  const loading = useGitLoadingStatus(directory)
  const marks = useReviewProgressStore((state) => state.marks)
  const [message, setMessage] = React.useState("")
  const [composing, setComposing] = React.useState(false)
  const [pending, setPending] = React.useState<"stage" | "commit" | "push" | null>(null)
  const busy = React.useRef(false)
  const mounted = React.useRef(true)
  const inputContainer = React.useRef<HTMLDivElement>(null)
  const contextId = React.useId()

  const unstaged = files.filter((file) => scope !== "staged" && (file.working_dir.trim() || file.index === "?"))
  // A mark resting on line counts cannot prove the content is what was reviewed, so it never counts as reviewed here.
  const reviewed = unstaged.filter((file) => {
    const detail = reviewFileSignatureDetail(file, scope)
    return !detail.fallback && marks[reviewProgressKey(directory, scope, file.path)] === detail.signature
  })
  const toStage = reviewed.length ? reviewed : unstaged
  // Staging unreviewed files is never what the reviewed action silently becomes: it takes a second, explicit click.
  const [confirmAllKey, setConfirmAllKey] = React.useState<string | null>(null)
  const stageAllKey = reviewed.length ? null : unstaged.map((file) => file.path).join("\0")
  const confirmingAll = stageAllKey !== null && confirmAllKey === stageAllKey
  const staged = status?.files.filter((file) => file.index.trim() && file.index !== "?") ?? []
  const ahead = status?.ahead ?? 0
  const action = toStage.length ? "stage" : staged.length ? "commit" : ahead > 0 ? "push" : null
  const affected = action === "stage" ? toStage : action === "commit" ? staged : []
  const tracking = status?.tracking
  const remote = tracking?.includes("/") ? tracking.slice(0, tracking.indexOf("/")) : null
  const branch = status?.current
  const reason = pending
    ? t(`diffView.landing.${pending}Pending`)
    : loading || !status
      ? t("diffView.state.loadingChanges")
      : !branch || branch === "HEAD"
        ? t("diffView.landing.detached")
        : status.files.some(isConflictedStatusFile) ||
            status.attentionReason ||
            status.mergeInProgress ||
            status.rebaseInProgress
          ? t("diffView.landing.resolveConflicts")
          : action === "push" && !remote
            ? t("diffView.landing.noUpstream")
            : action === "push" && status.behind > 0
              ? t("gitView.toast.pullBeforePush", { count: status.behind, name: remote ?? "" })
              : action === "commit" && composing && !message.trim()
                ? t("gitView.toast.enterCommitMessage")
                : !action
                  ? status.behind > 0
                    ? t("diffView.landing.behind", { count: status.behind })
                    : t("diffView.landing.upToDate")
                  : null
  const label =
    action === "stage"
      ? reviewed.length
        ? t("diffView.landing.stageReviewed")
        : confirmingAll
          ? t("diffView.landing.stageAllConfirm", { count: toStage.length })
          : t("diffView.landing.stageAll", { count: toStage.length })
      : action === "commit"
        ? t("diffView.landing.commit", { count: staged.length })
        : action === "push"
          ? t("diffView.landing.push", { count: ahead, target: tracking ?? t("diffView.landing.noUpstream") })
          : t("diffView.landing.upToDate")

  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  React.useEffect(() => {
    if (composing) inputContainer.current?.querySelector("textarea")?.focus()
  }, [composing])

  const run = async () => {
    if (busy.current || reason || !action || !status) return
    if (action === "commit" && !composing) {
      setComposing(true)
      return
    }
    if (action === "stage" && stageAllKey !== null && !confirmingAll) {
      setConfirmAllKey(stageAllKey)
      return
    }
    busy.current = true
    setPending(action)
    const store = useGitStore.getState()
    try {
      if (action === "stage") {
        // Stage only what is still the content on screen: a write since the last status refresh aborts instead of being
        // staged as reviewed.
        const fresh = await git.getGitStatus(directory)
        const freshByPath = new Map(fresh.files.map((file) => [file.path, file]))
        const unchanged = toStage.every((file) => {
          const current = freshByPath.get(file.path)
          // Status carries no line counts; the blob ids and status letters in the signature are what identify the content.
          if (current === undefined) return false
          const comparable: ReviewProgressFile = { ...file, ...current }
          return reviewFileSignature(comparable, scope) === reviewFileSignature(file, scope)
        })
        if (!unchanged) throw new Error(t("diffView.landing.changedSinceReview"))
        const paths = toStage.map((file) => file.path)
        if (git.stageGitFiles) await git.stageGitFiles(directory, paths)
        else for (const path of paths) await git.stageGitFile(directory, path)
        store.bumpIndexRevision(directory)
        await store.fetchStatus(directory, git, { silent: true })
        if (mounted.current) onStaged?.()
      } else if (action === "commit") {
        // The commit takes the whole index, so it must still be exactly the staged list the reviewer saw.
        const fresh = await git.getGitStatus(directory)
        const freshStaged = fresh.files
          .filter((file) => file.index.trim() && file.index !== "?")
          .map((file) => `${file.path}\0${file.index}`)
          .sort()
        const shownStaged = staged.map((file) => `${file.path}\0${file.index}`).sort()
        if (freshStaged.join("\n") !== shownStaged.join("\n")) throw new Error(t("diffView.landing.stagedChanged"))
        await commitChanges({
          git,
          directory,
          message,
          stagedPaths: staged.map((file) => file.path),
          changedPaths: [],
          allowCommitAll: false,
          t,
        })
        store.bumpIndexRevision(directory)
        if (mounted.current) {
          setMessage("")
          setComposing(false)
        }
        toast.success(t("gitView.toast.commitCreated"))
      } else if (remote) {
        const result = await pushChanges({ git, directory, remote, t, expected: status })
        toast.success(
          result === "pushed"
            ? t("gitView.toast.pushedToUpstream", { name: remote })
            : t("gitView.toast.alreadyUpToDate"),
        )
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("diffView.landing.failed"))
    } finally {
      // Reconcile even after a partially successful batch or a rejected push.
      await store.fetchStatus(directory, git, { silent: true })
      if (action !== "stage") await Promise.all([store.fetchBranches(directory, git), store.fetchLog(directory, git)])
      busy.current = false
      if (mounted.current) setPending(null)
    }
  }

  return (
    <section
      aria-label={t("diffView.landing.title")}
      aria-busy={pending !== null}
      className="shrink-0 border-b border-border/50 px-3 py-2 space-y-2"
    >
      <div id={contextId} className="typography-meta text-muted-foreground break-words">
        <span title={directory}>{directory.split(/[\\/]/).filter(Boolean).at(-1)}</span>
        {" · "}
        {branch || t("diffView.landing.detached")}
        {" · "}
        {action === "push"
          ? t("diffView.landing.commits", { count: ahead })
          : t("diffView.landing.files", { count: affected.length })}
      </div>
      {affected.length > 0 && (
        <details open className="typography-meta">
          <summary className="cursor-pointer">
            {t("diffView.landing.selectedFiles", { count: affected.length })}
          </summary>
          <ul className="max-h-24 overflow-auto text-muted-foreground">
            {affected.map((file) => (
              <li key={file.path} className="break-all">
                {file.path}
              </li>
            ))}
          </ul>
        </details>
      )}
      {composing && (
        <div ref={inputContainer}>
          <CommitInput
            value={message}
            onChange={setMessage}
            disabled={pending !== null}
            onSubmit={action === "commit" && !reason ? () => void run() : undefined}
          />
        </div>
      )}
      <Button
        type="button"
        size="sm"
        onClick={() => void run()}
        disabled={Boolean(reason)}
        aria-describedby={contextId}
      >
        {pending ? t(`diffView.landing.${pending}Pending`) : label}
      </Button>
      {reason && (
        <p role="status" className="typography-meta text-muted-foreground">
          {reason}
        </p>
      )}
    </section>
  )
}
