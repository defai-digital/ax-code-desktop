import React from "react"
import { toast } from "@/components/ui"
import { useGitStore, useGitStatus } from "@/stores/useGitStore"
import { useRuntimeAPIs } from "@/hooks/useRuntimeAPIs"
import { useI18n } from "@/lib/i18n"
import { buildHunkPatch, parseFileDiffHunks, type FileDiffHunk } from "./gitHunkPatch"
import { createGitIndexMutationQueue, type GitIndexMutationQueue } from "./git/gitIndexMutationQueue"

interface UseDiffHunkStageOptions {
  directory: string | null
  filePath: string
  diff: { original: string; modified: string; isBinary?: boolean } | null
  /** Staged rows unstage their hunk; unstaged rows stage it. */
  staged: boolean
}

/**
 * Git's unmerged porcelain codes split the letter across both columns ("UU",
 * "AA", "DD", "AU", …); every variant carries a "U" in one of them, and the
 * same-letter pairs are the two remaining conflicted shapes.
 */
export const isConflictedStatusFile = (file: { index?: string | null; working_dir?: string | null }): boolean => {
  const index = (file.index ?? "").trim()
  const working = (file.working_dir ?? "").trim()
  return index === "U" || working === "U" || (index === "A" && working === "A") || (index === "D" && working === "D")
}

/**
 * Per-hunk stage/unstage for both diff viewers in DiffView.tsx. The exact
 * unified diff text for the file is fetched once per revision, the hunk rows
 * are matched to its hunks by new-side start line (see DiffHunkReviewList),
 * and the patch for a click is cut from that same text so the hunk the user
 * sees is the hunk that gets applied. Mutations run through the shared index
 * mutation queue (one at a time, in click order) and refresh status exactly
 * like the whole-file stage/unstage actions do.
 */
export function useDiffHunkStage({ directory, filePath, diff, staged }: UseDiffHunkStageOptions) {
  const { t } = useI18n()
  const { git } = useRuntimeAPIs()
  const status = useGitStatus(directory)
  const bumpIndexRevision = useGitStore((state) => state.bumpIndexRevision)
  const fetchStatus = useGitStore((state) => state.fetchStatus)
  const indexRevision = useGitStore(
    React.useCallback(
      (state) => {
        if (!directory) return 0
        return state.directories.get(directory)?.indexRevision ?? 0
      },
      [directory],
    ),
  )

  const [gitHunks, setGitHunks] = React.useState<FileDiffHunk[] | null>(null)
  const [stagingHunkIndex, setStagingHunkIndex] = React.useState<number | null>(null)
  const [revisionNonce, setRevisionNonce] = React.useState(0)
  const fileDiffTextRef = React.useRef<string | null>(null)
  // The queue already serializes mutations; this ref is the synchronous half of
  // the guard so two clicks in the same tick cannot both enqueue (state alone
  // lags a render behind the click).
  const stagingRef = React.useRef(false)
  const flushQueueRef = React.useRef<(() => void) | null>(null)

  const canStageHunks = Boolean(staged ? git.unstageGitHunk : git.stageGitHunk)
  const conflicted = Boolean(
    directory && status?.files?.some((file) => file.path === filePath && isConflictedStatusFile(file)),
  )
  const binary = diff?.isBinary === true
  // Read outside the effect below so its dependency list can key on the diff's
  // contents instead of its object identity.
  const hasDiff = diff != null

  const scheduleFlush = React.useCallback(() => {
    window.setTimeout(() => flushQueueRef.current?.(), 0)
  }, [])

  const gitIndexMutationQueue = React.useMemo<GitIndexMutationQueue>(
    () =>
      createGitIndexMutationQueue({
        // Each queued entry carries single-hunk patch payloads in `paths` rather
        // than file paths: the queue serializes index mutations one at a time,
        // and its same-direction merge unions payloads so two rapid clicks apply
        // both patches in order instead of racing.
        runMutation: async ({ directory: mutationDirectory, direction, paths }) => {
          for (const patch of paths) {
            if (direction === "unstage") {
              await git.unstageGitHunk?.(mutationDirectory, filePath, patch)
              continue
            }
            await git.stageGitHunk?.(mutationDirectory, filePath, patch)
          }
        },
        onMutationComplete: ({ directory: mutationDirectory }) => {
          bumpIndexRevision(mutationDirectory)
          // The index moved under the fetched diff text; drop it so the next
          // click builds its patch from the refreshed one.
          setRevisionNonce((nonce) => nonce + 1)
          void fetchStatus(mutationDirectory, git, { silent: true })
        },
        onMutationError: ({ direction }, error) => {
          const fallback = direction === "stage" ? t("diffView.hunk.stageFailed") : t("diffView.hunk.unstageFailed")
          toast.error(error instanceof Error ? error.message : fallback)
        },
        onPathsComplete: () => {
          stagingRef.current = false
          setStagingHunkIndex(null)
        },
        scheduleFlush,
      }),
    [bumpIndexRevision, fetchStatus, filePath, git, scheduleFlush, t],
  )

  React.useEffect(() => {
    flushQueueRef.current = gitIndexMutationQueue.flush
    return () => {
      flushQueueRef.current = null
    }
  }, [gitIndexMutationQueue])

  React.useEffect(() => () => gitIndexMutationQueue.clear(), [gitIndexMutationQueue])

  React.useEffect(() => {
    let cancelled = false
    fileDiffTextRef.current = null
    setGitHunks(null)

    if (!directory || !filePath || binary || conflicted || !canStageHunks || !hasDiff) {
      return
    }

    // Context 4 matches the diff library the hunk rows are parsed with
    // (@pierre/diffs computes them with jsdiff's default context of 4), so a
    // row's new-side start line identifies the git hunk that starts there. For
    // unstaged files this diff is index↔worktree: the patch `git apply --cached`
    // needs. For staged files it is HEAD↔index, matching the view's sides.
    void git
      .getGitDiff(directory, { path: filePath, staged, contextLines: 4 })
      .then((response) => {
        if (cancelled) return
        const text = typeof response?.diff === "string" ? response.diff : ""
        fileDiffTextRef.current = text
        setGitHunks(parseFileDiffHunks(text))
      })
      .catch(() => {
        // No git text means no per-hunk actions; the view itself still renders.
        if (!cancelled) setGitHunks([])
      })

    return () => {
      cancelled = true
    }
    // The diff's *contents* are the dependency, not its object identity: a
    // caller that rebuilds the diff object every render would otherwise restart
    // this fetch (and its setState) forever.
  }, [
    binary,
    canStageHunks,
    conflicted,
    diff?.modified,
    diff?.original,
    directory,
    filePath,
    git,
    hasDiff,
    indexRevision,
    revisionNonce,
    staged,
  ])

  const handleStageHunk = React.useCallback(
    (gitHunkIndex: number) => {
      if (!directory || stagingRef.current) return
      const patch = buildHunkPatch(fileDiffTextRef.current ?? "", gitHunkIndex)
      if (!patch) {
        toast.error(t("diffView.hunk.stageUnsupported"))
        return
      }

      stagingRef.current = true
      setStagingHunkIndex(gitHunkIndex)
      gitIndexMutationQueue.enqueue({
        directory,
        direction: staged ? "unstage" : "stage",
        paths: new Set([patch]),
      })
      scheduleFlush()
    },
    [directory, gitIndexMutationQueue, scheduleFlush, staged, t],
  )

  return { gitHunks, stagingHunkIndex, handleStageHunk }
}
