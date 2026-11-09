import { parseDiffFromFile } from "@pierre/diffs"
import { afterEach, describe, expect, test, vi } from "vitest"

import { isDiffParseResponse, type DiffParseRequest, type DiffParseResponse } from "./diffParseProtocol"

interface WorkerScope {
  onmessage: ((event: { data: DiffParseRequest }) => void) | null
  postMessage: (response: DiffParseResponse) => void
}

async function loadWorker() {
  const posted: DiffParseResponse[] = []
  const scope: WorkerScope = { onmessage: null, postMessage: (response) => posted.push(response) }
  vi.stubGlobal("self", scope)
  vi.resetModules()
  await import("./diffParse.worker")
  return { scope, posted }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("diff parse worker entry", () => {
  test("answers a request with the same metadata as a direct parse, after a structured clone", async () => {
    const { scope, posted } = await loadWorker()
    const original = "a\nb\nc\n"
    const modified = "a\nB\nc\nd\n"
    scope.onmessage?.({ data: { id: 7, name: "f.ts", original, modified } })

    expect(posted).toHaveLength(1)
    const response = structuredClone(posted[0])
    expect(isDiffParseResponse(response)).toBe(true)
    expect(response).toEqual({
      id: 7,
      diff: parseDiffFromFile({ name: "f.ts", contents: original }, { name: "f.ts", contents: modified }),
    })
  })

  test("reports a parse that throws as an error for that request", async () => {
    const { scope, posted } = await loadWorker()
    scope.onmessage?.({ data: { id: 3, name: "f.ts", original: null, modified: null } as unknown as DiffParseRequest })
    expect(posted).toEqual([{ id: 3, error: expect.any(String) }])
  })
})
