import { parseDiffFromFile, processFile, type FileDiffMetadata } from "@pierre/diffs"
import type { DiffEngine, DiffPreview } from "@ax-code/diff-wasm"

import type { DiffParseRequest } from "./diffParseProtocol"

/**
 * Budget for one engine call. The kernel bounds its own work (a 20k-line rewrite measured about
 * 40 ms), so reaching this means the engine Worker is stuck, not that the input is large.
 */
export const ENGINE_TIMEOUT_MS = 5_000

export interface DiffParseOutcome {
  diff: FileDiffMetadata
  /** True when the engine ran out of work budget and returned a coarser, still exact-applying diff. */
  approximate: boolean
}

export type DiffEngineLoader = () => Promise<Pick<DiffEngine, "diff">>

/**
 * Renders engine hunks as the unified patch Pierre parses. The engine reports an empty range by the
 * one-based line it sits at; a unified header names the line before it. Lines already carry their
 * prefix, any carriage return and the "\ No newline at end of file" marker.
 */
export function previewToPatch(name: string, preview: DiffPreview): string {
  const range = (start: number, count: number) => `${count === 0 ? start - 1 : start},${count}`
  let patch = `--- ${name}\n+++ ${name}\n`
  for (const hunk of preview.hunks) {
    patch += `@@ -${range(hunk.oldStart, hunk.oldLines)} +${range(hunk.newStart, hunk.newLines)} @@\n`
    patch += `${hunk.lines.join("\n")}\n`
  }
  return patch
}

/**
 * Checks that the hunks align the two files: every line outside a change group is identical on both
 * sides, and the groups account for every line. The viewer hides unchanged lines and hunk revert
 * rebuilds the file from this metadata, so a diff that fails here must never be shown.
 */
export function isConsistentDiff(diff: FileDiffMetadata): boolean {
  const { additionLines, deletionLines } = diff
  let addition = 0
  let deletion = 0
  const unchanged = (count: number): boolean => {
    if (count < 0 || addition + count > additionLines.length || deletion + count > deletionLines.length) return false
    for (let offset = 0; offset < count; offset += 1) {
      if (additionLines[addition + offset] !== deletionLines[deletion + offset]) return false
    }
    addition += count
    deletion += count
    return true
  }
  for (const hunk of diff.hunks) {
    if (!unchanged(hunk.collapsedBefore)) return false
    for (const content of hunk.hunkContent) {
      if (content.type === "context") {
        if (content.additionLineIndex !== addition || content.deletionLineIndex !== deletion) return false
        if (!unchanged(content.lines)) return false
        continue
      }
      if (content.additions > 0 && content.additionLineIndex !== addition) return false
      if (content.deletions > 0 && content.deletionLineIndex !== deletion) return false
      addition += content.additions
      deletion += content.deletions
    }
  }
  return additionLines.length - addition === deletionLines.length - deletion && unchanged(additionLines.length - addition)
}

/** Thrown when the engine did not answer within `ENGINE_TIMEOUT_MS`; the caller stops using it. */
export class DiffEngineTimeoutError extends Error {
  constructor() {
    super("diff engine timed out")
    this.name = "DiffEngineTimeoutError"
  }
}

/**
 * Computes the diff with the canonical AX Code engine and projects it to Pierre metadata
 * (SPEC-2026-11-21-diff-wasm-engine-v1). Throws when the engine rejects the input or the result
 * does not align the two files; the caller then uses `parseWithPierre`.
 */
export async function parseWithEngine(
  engine: Pick<DiffEngine, "diff">,
  request: DiffParseRequest,
): Promise<DiffParseOutcome> {
  const started = performance.now()
  let preview: DiffPreview
  try {
    preview = await engine.diff(request.original, request.modified, { timeoutMs: ENGINE_TIMEOUT_MS })
  } catch (error) {
    if (performance.now() - started >= ENGINE_TIMEOUT_MS) throw new DiffEngineTimeoutError()
    throw error
  }
  const diff = processFile(previewToPatch(request.name, preview), {
    oldFile: { name: request.name, contents: request.original },
    newFile: { name: request.name, contents: request.modified },
    throwOnError: true,
  })
  if (!diff || !isConsistentDiff(diff)) throw new Error("diff engine result does not align the files")
  return { diff, approximate: preview.approximate === true }
}

export function parseWithPierre(request: DiffParseRequest): DiffParseOutcome {
  const diff = parseDiffFromFile(
    { name: request.name, contents: request.original },
    { name: request.name, contents: request.modified },
  )
  return { diff, approximate: false }
}

/**
 * One parse per request: the engine first, jsdiff when the engine is unavailable or refuses. A load
 * failure or a timeout turns the engine off for the lifetime of this Worker, so a broken engine
 * costs one attempt rather than one per diff.
 */
export function createDiffParser(loadEngine: DiffEngineLoader): (request: DiffParseRequest) => Promise<DiffParseOutcome> {
  let engine: Promise<Pick<DiffEngine, "diff">> | null = null
  let disabled = false

  return async (request) => {
    if (!disabled) {
      try {
        engine ??= loadEngine()
        return await parseWithEngine(await engine, request)
      } catch (error) {
        const loaded = await engine?.then(
          () => true,
          () => false,
        )
        if (!loaded || error instanceof DiffEngineTimeoutError) disabled = true
      }
    }
    return parseWithPierre(request)
  }
}
