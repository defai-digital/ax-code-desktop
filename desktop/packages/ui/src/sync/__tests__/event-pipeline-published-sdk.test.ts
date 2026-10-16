// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest"
import { createAxCodeClient, type Part } from "@defai-digital/ax-code-sdk/v2/client"
import { createEventPipeline } from "../event-pipeline"
import { applyPartDeltaBatch } from "../part-delta-batch"
import { INITIAL_STATE, type State } from "../types"
import {
  installEventPipelineBrowserGlobals,
  restoreBrowserGlobals,
  saveBrowserGlobals,
} from "./event-pipeline-test-helpers"
import { PartMap } from "../part-map"

const saved = saveBrowserGlobals()
afterEach(() => restoreBrowserGlobals(saved))

describe("event pipeline with the published SDK", () => {
  it("applies fragmented Unicode deltas, routes unknown events, and resumes with the last SSE cursor", async () => {
    installEventPipelineBrowserGlobals()
    const directory = "/fixture/alpha space"
    const requests: { cursor: string | null; directory: string | null }[] = []
    let cancelled = false
    let state: State = {
      ...INITIAL_STATE,
      part: PartMap.from({ msg_probe: [{ id: "prt_probe", type: "text", text: "" } as Part] }),
    }
    const received: { directory: string; type: string }[] = []
    const envelopes = [
      ...["A😀", "B"].map((delta) => ({
        directory,
        payload: {
          type: "message.part.delta",
          properties: { sessionID: "ses_probe", messageID: "msg_probe", partID: "prt_probe", field: "text", delta },
        },
      })),
      { directory: "/fixture/beta", payload: { type: "future.integration.event", properties: { value: true } } },
    ]
    const bytes = new TextEncoder().encode(
      envelopes.map((event, index) => `id: cursor-${index + 1}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join(""),
    )
    const sdk = createAxCodeClient({
      baseUrl: "http://127.0.0.1:3000/api",
      directory,
      fetch: async (request, init) => {
        const headers = request instanceof Request ? request.headers : new Headers(init?.headers)
        requests.push({ cursor: headers.get("Last-Event-ID"), directory: headers.get("x-ax-code-directory") })
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              if (requests.length !== 1) return
              for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
              controller.close()
            },
            cancel() {
              cancelled = true
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        )
      },
    })
    const pipeline = createEventPipeline({
      sdk,
      transport: "sse",
      reconnectDelayMs: 1,
      heartbeatTimeoutMs: 60_000,
      onEvent(eventDirectory, event) {
        received.push({ directory: eventDirectory, type: event.type })
      },
      onDeltaBatch(eventDirectory, events) {
        expect(eventDirectory).toBe(directory)
        state =
          applyPartDeltaBatch(
            state,
            events,
            () => {},
            (_event, error) => {
              throw error
            },
          ) ?? state
      },
    })
    try {
      await vi.waitFor(() => {
        expect(requests).toHaveLength(2)
        expect((state.part.get("msg_probe")![0] as { text: string }).text).toBe("A😀B")
        expect(received).toContainEqual({ directory: "/fixture/beta", type: "future.integration.event" })
      })
      expect(requests[0]).toEqual({ cursor: null, directory })
      expect(requests[1]).toEqual({ cursor: "cursor-3", directory })
    } finally {
      pipeline.cleanup()
    }
    await vi.waitFor(() => expect(cancelled).toBe(true))
  })
})
