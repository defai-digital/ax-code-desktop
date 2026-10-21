import { useEffect } from "react"

import { publishReviewHunks, releaseReviewHunks, retainReviewHunks, useReviewHunkScope } from "@/lib/reviewHunkRegistry"
import { reviewHunkAnchors } from "@/lib/reviewHunkNavigation"

import { getFileHunks } from "./diffHunkRevert"

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
  useEffect(() => {
    if (!path || !scopeId) return
    retainReviewHunks(scopeId, directory, path)
    const anchors =
      original === null || modified === null ? [] : reviewHunkAnchors(getFileHunks(original, modified, path))
    publishReviewHunks(scopeId, directory, path, anchors)
    return () => releaseReviewHunks(scopeId, directory, path)
  }, [directory, modified, original, path, scopeId])
}
