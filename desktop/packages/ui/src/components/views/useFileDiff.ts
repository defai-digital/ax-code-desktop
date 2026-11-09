import React from "react"
import type { FileDiffMetadata } from "@pierre/diffs"

import { fileDiffCacheKey, loadFileDiff, peekFileDiff } from "./diffHunkRevert"
import { DiffParseError } from "./diffParseClient"

/** `diff` is null for a binary or too-large placeholder (null or two empty sides): there is nothing to parse. */
export type FileDiffState =
  | { status: "ready"; diff: FileDiffMetadata | null }
  | { status: "loading" }
  | { status: "too-large" }
  | { status: "error" }

const NO_DIFF: FileDiffState = { status: "ready", diff: null }
const LOADING: FileDiffState = { status: "loading" }
const TOO_LARGE: FileDiffState = { status: "too-large" }

/**
 * The shared parse for one file, computed in the diff Worker when it is large. A result is shown only
 * for the contents it was computed from, so a late answer for earlier contents never paints.
 */
export function useFileDiff(original: string | null, modified: string | null, fileName = ""): FileDiffState {
  const key = React.useMemo(
    () => (original === null || modified === null ? null : fileDiffCacheKey(fileName, original, modified)),
    [fileName, modified, original],
  )
  const snapshot = React.useMemo(
    () => (key === null || original === null || modified === null ? null : peekFileDiff(original, modified, fileName, key)),
    [fileName, key, modified, original],
  )
  const [settled, setSettled] = React.useState<{ key: string; state: FileDiffState } | null>(null)

  React.useEffect(() => {
    if (key === null || original === null || modified === null || snapshot?.status !== "pending") return
    const controller = new AbortController()
    loadFileDiff(original, modified, fileName, controller.signal).then(
      (diff) => {
        if (!controller.signal.aborted) setSettled({ key, state: { status: "ready", diff } })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        const reason = error instanceof DiffParseError ? error.reason : "error"
        setSettled({ key, state: reason === "too-large" ? TOO_LARGE : { status: "error" } })
      },
    )
    return () => {
      controller.abort()
      // Failures are not cached, so coming back to this key retries; show loading, not the old failure.
      setSettled((previous) => (previous?.key === key ? null : previous))
    }
  }, [fileName, key, modified, original, snapshot])

  if (snapshot === null) return NO_DIFF
  if (snapshot.status === "ready") return snapshot
  if (snapshot.status === "too-large") return TOO_LARGE
  return settled?.key === key ? settled.state : LOADING
}
