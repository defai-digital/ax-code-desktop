import { parseDiffFromFile } from "@pierre/diffs"

import type { DiffParseRequest, DiffParseResponse } from "./diffParseProtocol"

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<DiffParseRequest>) => void) | null
  postMessage: (response: DiffParseResponse) => void
}

// Runs jsdiff off the renderer thread (SPEC-2026-11-08-diff-parse-worker-v1). The result is
// plain FileDiffMetadata data, so it survives the structured clone back to the window.
scope.onmessage = ({ data }) => {
  try {
    const diff = parseDiffFromFile(
      { name: data.name, contents: data.original },
      { name: data.name, contents: data.modified },
    )
    scope.postMessage({ id: data.id, diff })
  } catch (error) {
    scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : "diff parse failed" })
  }
}
