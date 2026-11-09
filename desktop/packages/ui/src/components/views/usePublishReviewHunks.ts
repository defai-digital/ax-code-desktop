import { useEffect } from "react"

import { publishReviewHunks, releaseReviewHunks, retainReviewHunks, useReviewHunkScope } from "@/lib/reviewHunkRegistry"
import { reviewHunkAnchors } from "@/lib/reviewHunkNavigation"

import { useFileDiff } from "./useFileDiff"

/**
 * Measure one file's hunk list from the same parse Pierre uses to draw it.
 * Pass null contents for a binary, image, or too-large file: those have no hunks and are not parsed.
 */
export function ReviewHunkMeasure(props: { path: string; original: string | null; modified: string | null }) {
  usePublishReviewHunks(props.path, props.original, props.modified)
  return null
}

/** Measure one file's rendered hunk list from the same parse Pierre uses to draw it. */
export function usePublishReviewHunks(
  path: string | null | undefined,
  original: string | null,
  modified: string | null,
): void {
  const scope = useReviewHunkScope()
  const scopeId = scope?.id
  const directory = scope?.directory ?? ""
  // Without a scope nothing is published, so skip the parse (and the Worker) entirely.
  const fileDiff = useFileDiff(scopeId && path ? original : null, scopeId && path ? modified : null, path ?? "")
  // A diff that is still computing, timed out or failed publishes no anchors rather than stale ones.
  const hunks = fileDiff.status === "ready" ? fileDiff.diff?.hunks : undefined
  useEffect(() => {
    if (!path || !scopeId) return
    retainReviewHunks(scopeId, directory, path)
    publishReviewHunks(scopeId, directory, path, hunks ? reviewHunkAnchors(hunks) : [])
    return () => releaseReviewHunks(scopeId, directory, path)
  }, [directory, hunks, path, scopeId])
}
