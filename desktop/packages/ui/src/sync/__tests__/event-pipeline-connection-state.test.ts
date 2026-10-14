import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { EventPipelineInput } from "../event-pipeline"
import { createEventPipeline } from "../event-pipeline"
import { selectIsConnected, useConnectionStore } from "@/lib/event-stream/connection-state"
import {
  FakeWebSocket,
  installFakeWebSocket,
  restoreEnvironment,
  saveEnvironment,
  setNavigatorOnline,
  setVisibilityState,
  type SavedEnvironment,
} from "@/lib/event-stream/test-fakes"

// S4.7 wiring pin: the pipeline (owner of the app's event transport) is the
// single writer of the canonical connection phase. Driving the transport
// through connect/disconnect must move lib/event-stream/connection-state —
// with no involvement from useConfigStore.

const asPipelineSdk = (sdk: {
  global: { event(): Promise<{ stream: AsyncIterable<unknown> }> }
}): EventPipelineInput["sdk"] => sdk as unknown as EventPipelineInput["sdk"]

const idleSdk = asPipelineSdk({
  global: {
    event: async () => ({
      stream: {
        // WS mode never touches the SDK stream; keep it open and empty.
        [Symbol.asyncIterator]() {
          return {
            next: () => new Promise<IteratorResult<unknown>>(() => {}),
          }
        },
      },
    }),
  },
})

let saved: SavedEnvironment
let consoleErrorSpy: ReturnType<typeof vi.spyOn>
const cleanups: Array<() => void> = []

type SseOptions = {
  signal?: AbortSignal
  onSseEvent?: (event: { id?: string }) => void
  onSseError?: (error: unknown) => void
}

// Mirrors createSseClient when the fallback subscription cannot be established:
// the error is reported through onSseError and the stream then ends empty.
const failingSseSdk = asPipelineSdk({
  global: {
    event: async (_options?: SseOptions) => ({
      stream: {
        [Symbol.asyncIterator]() {
          let reported = false
          return {
            async next(): Promise<IteratorResult<unknown>> {
              if (!reported) {
                reported = true
                _options?.onSseError?.(new Error("fallback unavailable"))
              }
              return { done: true, value: undefined }
            },
          }
        },
      },
    }),
  },
})

const resetConnectionState = () => {
  useConnectionStore.setState({ phase: "connecting", hasEverConnected: false, lastDisconnectReason: null })
}

const waitFor = async (condition: () => boolean, budgetMs = 2_000) => {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > budgetMs) {
      throw new Error("waitFor timed out")
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

beforeEach(() => {
  saved = saveEnvironment()
  setNavigatorOnline(true)
  setVisibilityState("visible")
  installFakeWebSocket()
  resetConnectionState()
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
  restoreEnvironment(saved)
  resetConnectionState()
  consoleErrorSpy.mockRestore()
})

describe("createEventPipeline — connection-state wiring (S4.7)", () => {
  it("marks the connection store connected on the WS ready acknowledgement", async () => {
    const pipeline = createEventPipeline({
      sdk: idleSdk,
      transport: "ws",
      heartbeatTimeoutMs: 60_000,
      onEvent: () => {},
    })
    cleanups.push(pipeline.cleanup)

    await waitFor(() => FakeWebSocket.instances.length > 0)
    const socket = FakeWebSocket.instances[0]
    socket.emitOpen()
    socket.emitMessage({ type: "ready", scope: "global" })

    await waitFor(() => selectIsConnected(useConnectionStore.getState()))
    expect(useConnectionStore.getState()).toEqual({
      phase: "connected",
      hasEverConnected: true,
      lastDisconnectReason: null,
    })
  })

  it("marks the connection store reconnecting with the reason when the stream drops", async () => {
    const pipeline = createEventPipeline({
      sdk: idleSdk,
      transport: "ws",
      heartbeatTimeoutMs: 60_000,
      onEvent: () => {},
    })
    cleanups.push(pipeline.cleanup)

    await waitFor(() => FakeWebSocket.instances.length > 0)
    const socket = FakeWebSocket.instances[0]
    socket.emitOpen()
    socket.emitMessage({ type: "ready", scope: "global" })
    await waitFor(() => selectIsConnected(useConnectionStore.getState()))

    socket.emitClose({ code: 1006 })

    await waitFor(() => useConnectionStore.getState().phase === "reconnecting")
    const state = useConnectionStore.getState()
    expect(state.hasEverConnected).toBe(true)
    expect(state.lastDisconnectReason).toBe("ws_closed:code=1006")
  })

  it("stays in connecting (not reconnecting) when the stream fails before the first connect", async () => {
    const pipeline = createEventPipeline({
      sdk: idleSdk,
      transport: "ws",
      heartbeatTimeoutMs: 60_000,
      onEvent: () => {},
    })
    cleanups.push(pipeline.cleanup)

    await waitFor(() => FakeWebSocket.instances.length > 0)
    FakeWebSocket.instances[0].emitClose({ code: 1006 })

    await waitFor(() => useConnectionStore.getState().lastDisconnectReason !== null)
    const state = useConnectionStore.getState()
    expect(state.phase).toBe("connecting")
    expect(state.hasEverConnected).toBe(false)
  })

  it("does not stay connected when the fallback driver fails after a transport switch", async () => {
    // Sequence: the WS stream drops for real (past the unstable-ready window, so the
    // close is not itself a fallback), the retry's WS attempt never acknowledges
    // (fallback-eligible ready timeout), and the SSE fallback fails as well. The
    // phase must report that outage instead of sitting at "connected" with the
    // failure swallowed by the disconnect latch the first drop set.
    const disconnects: string[] = []
    const pipeline = createEventPipeline({
      sdk: failingSseSdk,
      transport: "auto",
      heartbeatTimeoutMs: 60_000,
      wsReadyTimeoutMs: 50,
      onEvent: () => {},
      onDisconnect: (reason) => disconnects.push(reason),
    })
    cleanups.push(pipeline.cleanup)

    await waitFor(() => FakeWebSocket.instances.length > 0)
    FakeWebSocket.instances[0].emitOpen()
    FakeWebSocket.instances[0].emitMessage({ type: "ready", scope: "global" })
    await waitFor(() => selectIsConnected(useConnectionStore.getState()))
    await new Promise((resolve) => setTimeout(resolve, 2_200))
    FakeWebSocket.instances[0].emitClose({ code: 1006 })
    await waitFor(() => useConnectionStore.getState().phase === "reconnecting")

    // The retry's WS attempt opens but never acknowledges, so the client falls back.
    await waitFor(() => FakeWebSocket.instances.length > 1, 5_000)
    FakeWebSocket.instances[1].emitOpen()

    await waitFor(() => useConnectionStore.getState().lastDisconnectReason === "sse_error:fallback unavailable")
    expect(useConnectionStore.getState().phase).toBe("reconnecting")
    expect(disconnects.at(-1)).toBe("sse_error:fallback unavailable")
  })

  it("does not claim a connection when the very first attempt falls back and fails", async () => {
    const pipeline = createEventPipeline({
      sdk: failingSseSdk,
      transport: "auto",
      heartbeatTimeoutMs: 60_000,
      wsReadyTimeoutMs: 50,
      onEvent: () => {},
    })
    cleanups.push(pipeline.cleanup)

    await waitFor(() => FakeWebSocket.instances.length > 0)
    FakeWebSocket.instances[0].emitOpen()

    await waitFor(() => useConnectionStore.getState().lastDisconnectReason !== null)
    const state = useConnectionStore.getState()
    // A fallback that never acknowledged is not a connection: the phase stays in
    // the boot state instead of reporting a healthy stream.
    expect(state.phase).toBe("connecting")
    expect(state.hasEverConnected).toBe(false)
  })
})
