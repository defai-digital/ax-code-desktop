import React from "react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui"
import { useRuntimeAPIs } from "@/hooks/useRuntimeAPIs"
import { useI18n } from "@/lib/i18n"
import { useGitLoadingStatus, useGitStatus, useGitStore } from "@/stores/useGitStore"
import {
  reviewBranchFileSignature,
  reviewFileSignature,
  reviewFileSignatureDetail,
  reviewProgressKey,
  useReviewProgressStore,
  type ReviewGitScope,
  type ReviewProgressFile,
} from "@/stores/useReviewProgressStore"
import type { GitBranchDiffResponse, GitStatus } from "@/lib/api/types"
import { ReviewLandingChecks } from "./ReviewLandingChecks"
import { ReviewLandingBrowserEvidence } from "./ReviewLandingBrowserEvidence"
import { CommitInput } from "./CommitInput"
import { commitChanges, pushChanges } from "./landingActions"
import { isConflictedStatusFile } from "../useDiffHunkStage"

/**
 * A session or turn diff. Its marks sign this content, and a file counts as reviewed only while staging it would apply
 * exactly that change: the index still holds `before`, the worktree holds `after`, and the file mode is unchanged.
 */
export interface ReviewLandingSessionDiff {
  files: readonly { path: string; before: string; after: string; status?: string; signature: string }[]
}

interface ReviewLandingProps {
  directory: string
  scope: ReviewGitScope | `branch:${string}` | "session" | `turn:${string}`
  files: readonly ReviewProgressFile[]
  branchDiff?: GitBranchDiffResponse
  sessionDiff?: ReviewLandingSessionDiff
  sessionId?: string | null
  onRefreshBranch?: () => void
  onStaged?: () => void
}

/** One explicit action at a time: stage the reviewed set, compose a commit, then push. */
export function ReviewLanding({
  directory,
  scope,
  files,
  branchDiff,
  sessionDiff,
  sessionId,
  onStaged,
  onRefreshBranch,
}: ReviewLandingProps) {
  const { t } = useI18n()
  const { git } = useRuntimeAPIs()
  const status = useGitStatus(directory)
  const loading = useGitLoadingStatus(directory)
  const marks = useReviewProgressStore((state) => state.marks)
  const [message, setMessage] = React.useState("")
  const [composing, setComposing] = React.useState(false)
  const commitSnapshot = React.useRef<GitStatus | null>(null)
  const [pending, setPending] = React.useState<"stage" | "commit" | "push" | null>(null)
  const busy = React.useRef(false)
  const mounted = React.useRef(true)
  const inputContainer = React.useRef<HTMLDivElement>(null)
  const contextId = React.useId()

  const branchSignatures = new Map(
    branchDiff?.files.map((file) => [
      file.file,
      reviewBranchFileSignature({ ...file, path: file.file }, branchDiff.mergeBase),
    ]),
  )
  const sessionSignatures = new Map(sessionDiff?.files.map((file) => [file.path, file.signature]))
  const expectedWorktree = useSessionWorktreeIds(sessionDiff)
  // A session file is reviewed only while staging it would apply exactly the change the mark signed. Earlier changes in
  // the same file (another turn, a person) would otherwise be staged with it, and equal bytes can hide a type or mode change.
  const holdsReviewedContent = (file: ReviewProgressFile) => {
    const expected = expectedWorktree?.get(file.path)
    if (expected === undefined) return false
    const indexHoldsBefore =
      expected.before === null
        ? file.index === "?"
        : file.indexBlobId === expected.before && REGULAR_MODES.has(file.indexMode ?? "")
    if (!indexHoldsBefore) return false
    if (expected.after === null) return file.working_dir === "D"
    const mode = file.worktreeMode ?? ""
    return (
      file.worktreeBlobId === expected.after &&
      (expected.before === null ? mode === "100644" : mode === file.indexMode)
    )
  }
  // Branch and session membership come from the displayed diff; stageability comes only from live Git status.
  const candidates = branchDiff || sessionDiff
    ? files.flatMap((file) => {
        const current = status?.files.find((entry) => entry.path === file.path)
        return current ? [{ ...file, ...current }] : []
      })
    : files
  const committedOnly = branchDiff
    ? files.filter((file) => !status?.files.some((entry) => entry.path === file.path))
    : []
  const unstaged = candidates.filter((file) => scope !== "staged" && (file.working_dir.trim() || file.index === "?"))
  // A mark resting on line counts cannot prove the content is what was reviewed, so it never counts as reviewed here.
  const reviewed = unstaged.filter((file) => {
    if (sessionDiff) {
      const signature = sessionSignatures.get(file.path)
      return (
        signature !== undefined &&
        marks[reviewProgressKey(directory, scope, file.path)] === signature &&
        holdsReviewedContent(file)
      )
    }
    const detail = branchSignatures.get(file.path) ?? reviewFileSignatureDetail(file, scope)
    return !detail.fallback && marks[reviewProgressKey(directory, scope, file.path)] === detail.signature
  })
  const toStage = reviewed.length ? reviewed : unstaged
  // Staging unreviewed files is never what the reviewed action silently becomes: it takes a second, explicit click.
  const [confirmAllKey, setConfirmAllKey] = React.useState<string | null>(null)
  const stageAllKey = reviewed.length
    ? null
    : JSON.stringify([
        directory,
        scope,
        unstaged.map((file) => [
          file.path,
          reviewFileSignature(file, "all"),
          branchSignatures.get(file.path)?.signature ?? sessionSignatures.get(file.path),
        ]),
      ])
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

  React.useEffect(() => {
    if (action !== "commit") {
      setComposing(false)
      commitSnapshot.current = null
    }
  }, [action])

  const run = async () => {
    if (busy.current || reason || !action || !status) return
    if (action === "commit" && !composing) {
      commitSnapshot.current = status
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
        if (branchDiff) {
          const freshBranch = await git.getGitBranchDiff(directory, { base: branchDiff.base })
          const currentSignatures = new Map(
            freshBranch.files.map((file) => [
              file.file,
              reviewBranchFileSignature({ ...file, path: file.file }, freshBranch.mergeBase).signature,
            ]),
          )
          if (
            freshBranch.mergeBase !== branchDiff.mergeBase ||
            toStage.some((file) => currentSignatures.get(file.path) !== branchSignatures.get(file.path)?.signature)
          )
            throw new Error(t("diffView.landing.changedSinceReview"))
        }
        const fresh = await git.getGitStatus(directory, { bypassCache: true })
        if (
          fresh.current !== status.current ||
          fresh.headOid !== status.headOid ||
          fresh.files.some(isConflictedStatusFile) ||
          fresh.attentionReason ||
          fresh.mergeInProgress ||
          fresh.rebaseInProgress
        ) {
          throw new Error(t("diffView.landing.changedSinceReview"))
        }
        const freshByPath = new Map(fresh.files.map((file) => [file.path, file]))
        const unchanged = toStage.every((file) => {
          const current = freshByPath.get(file.path)
          // Status carries no line counts; the blob ids and status letters in the signature are what identify the content.
          if (current === undefined) return false
          const comparable: ReviewProgressFile = { ...file, ...current }
          return (
            reviewFileSignature(comparable, branchDiff || sessionDiff ? "all" : scope) ===
            reviewFileSignature(file, branchDiff || sessionDiff ? "all" : scope)
          )
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
        const fresh = await git.getGitStatus(directory, { bypassCache: true })
        const shown = commitSnapshot.current ?? status
        const indexIdentity = (snapshot: GitStatus) =>
          JSON.stringify(
            snapshot.files
              .filter((file) => file.index.trim() && file.index !== "?")
              .map((file) => JSON.stringify([file.path, file.index, file.indexBlobId]))
              .sort(),
          )
        const missingIdentity = (snapshot: GitStatus) =>
          snapshot.headOid === undefined ||
          snapshot.files.some(
            (file) =>
              file.index.trim() &&
              file.index !== "?" &&
              (file.index === "D" ? file.indexBlobId !== null : !file.indexBlobId),
          )
        if (
          missingIdentity(shown) ||
          missingIdentity(fresh) ||
          fresh.headOid !== shown.headOid ||
          fresh.current !== shown.current ||
          indexIdentity(fresh) !== indexIdentity(shown) ||
          fresh.files.some(isConflictedStatusFile) ||
          fresh.attentionReason ||
          fresh.mergeInProgress ||
          fresh.rebaseInProgress
        ) {
          commitSnapshot.current = fresh
          throw new Error(t("diffView.landing.stagedChanged"))
        }
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
      if (mounted.current && branchDiff) onRefreshBranch?.()
      busy.current = false
      if (mounted.current) setPending(null)
    }
  }

  return (
    <section
      aria-label={t("diffView.landing.title")}
      data-review-landing
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
      {status && committedOnly.length > 0 && (
        <details className="typography-meta">
          <summary>{t("diffView.landing.alreadyCommitted", { count: committedOnly.length })}</summary>
          <ul>
            {committedOnly.map((file) => (
              <li key={file.path}>{file.path}</li>
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
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void run()}
          disabled={Boolean(reason)}
          aria-describedby={contextId}
        >
          {pending ? t(`diffView.landing.${pending}Pending`) : label}
        </Button>
        {sessionId ? (
          <ReviewLandingChecks
            directory={directory}
            sessionId={sessionId}
            warn={action === "commit" || action === "push"}
          />
        ) : null}
        {sessionId ? <ReviewLandingBrowserEvidence directory={directory} sessionId={sessionId} /> : null}
      </div>
      {reason && (
        <p role="status" className="typography-meta text-muted-foreground">
          {reason}
        </p>
      )}
    </section>
  )
}

const REGULAR_MODES = new Set(["100644", "100755"])

/**
 * Git blob ids of each session file's `before` text (null for an addition) and `after` text (null for a deletion), the
 * same raw-bytes ids the status reports. Undefined while hashing, or when the runtime cannot hash, so nothing counts as reviewed without proof.
 */
type ExpectedIds = { before: string | null; after: string | null }

function useSessionWorktreeIds(sessionDiff: ReviewLandingSessionDiff | undefined) {
  const [ids, setIds] = React.useState<{ source: ReviewLandingSessionDiff; ids: Map<string, ExpectedIds> } | null>(
    null,
  )
  React.useEffect(() => {
    if (!sessionDiff) return
    let cancelled = false
    void Promise.all(
      sessionDiff.files.map(
        async (file) =>
          [
            file.path,
            {
              before: file.status === "added" ? null : await gitBlobId(file.before),
              after: file.status === "deleted" ? null : await gitBlobId(file.after),
            },
          ] as const,
      ),
    )
      .then((entries) => {
        if (!cancelled) setIds({ source: sessionDiff, ids: new Map(entries) })
      })
      .catch(() => {
        if (!cancelled) setIds(null)
      })
    return () => {
      cancelled = true
    }
  }, [sessionDiff])
  return ids && ids.source === sessionDiff ? ids.ids : undefined
}

async function gitBlobId(text: string): Promise<string> {
  const body = new TextEncoder().encode(text)
  const header = new TextEncoder().encode(`blob ${body.length}\0`)
  const bytes = new Uint8Array(header.length + body.length)
  bytes.set(header)
  bytes.set(body, header.length)
  const digest = await crypto.subtle.digest("SHA-1", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
