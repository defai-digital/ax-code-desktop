import { describe, expect, test } from "vitest"
import type { Event, Message, Part } from "@defai-digital/ax-code-sdk/v2/client"
import { getSessionMaterializationStatus, materializeSessionSnapshots } from "../materialization"
import { applyDirectoryEvent } from "../event-reducer"
import { INITIAL_STATE, type State } from "../types"
import { PartMap } from "../part-map"

function message(id: string, sessionID = "ses_1"): Message {
  return { id, sessionID, role: "assistant", time: { created: 1 } } as Message
}

function userMessage(id: string, sessionID = "ses_1"): Message {
  return { id, sessionID, role: "user", time: { created: 1 } } as Message
}

function part(id: string, messageID: string, type = "text", text = id): Part {
  return { id, messageID, sessionID: "ses_1", type, text } as Part
}

describe("materializeSessionSnapshots", () => {
  test("materializes messages and parts together", () => {
    const result = materializeSessionSnapshots({ message: {}, part: PartMap.from({}) }, "ses_1", [
      { info: message("msg_1"), parts: [part("prt_1", "msg_1")] },
    ])

    expect(result.message.ses_1.map((item) => item.id)).toEqual(["msg_1"])
    expect(result.part.get("msg_1")!.map((item) => item.id)).toEqual(["prt_1"])
    expect(result.messagesChanged).toBe(true)
    expect(result.partsChanged).toBe(true)
  })

  test("updates an existing message whose info changed in the snapshot", () => {
    // Reconnect recovery: an assistant reply that completed server-side while
    // disconnected must overwrite the stale in-progress copy (same id).
    const inProgress = { id: "msg_1", sessionID: "ses_1", role: "assistant", time: { created: 1 } } as Message
    const completed = {
      id: "msg_1",
      sessionID: "ses_1",
      role: "assistant",
      time: { created: 1, completed: 9 },
      finish: "stop",
    } as unknown as Message
    const state = { message: { ses_1: [inProgress] }, part: PartMap.from({ msg_1: [part("prt_1", "msg_1")] }) }

    const result = materializeSessionSnapshots(state, "ses_1", [{ info: completed, parts: [part("prt_1", "msg_1")] }])

    expect(result.messagesChanged).toBe(true)
    const merged = result.message.ses_1.find((item) => item.id === "msg_1") as Message & {
      time?: { completed?: number }
    }
    expect(merged.time?.completed).toBe(9)
  })

  test("preserves unchanged references", () => {
    const existingMessage = message("msg_1")
    const existingPart = part("prt_1", "msg_1")
    const state = { message: { ses_1: [existingMessage] }, part: PartMap.from({ msg_1: [existingPart] }) }

    const result = materializeSessionSnapshots(state, "ses_1", [{ info: existingMessage, parts: [existingPart] }])

    expect(result.message).toBe(state.message)
    expect(result.part).toBe(state.part)
    expect(result.messagesChanged).toBe(false)
    expect(result.partsChanged).toBe(false)
  })

  test("skips non-rendered part types", () => {
    const result = materializeSessionSnapshots(
      { message: {}, part: PartMap.from({}) },
      "ses_1",
      [{ info: message("msg_1"), parts: [part("prt_patch", "msg_1", "patch"), part("prt_text", "msg_1")] }],
      { skipPartTypes: new Set(["patch"]) },
    )

    expect(result.part.get("msg_1")!.map((item) => item.id)).toEqual(["prt_text"])
  })

  test("stores a fetched-empty assistant snapshot as renderable instead of absent", () => {
    // An assistant message the server returned with zero parts (e.g. aborted before
    // any output) is authoritatively empty; recording it as absence made the session
    // permanently non-renderable and ensure-renderable callers refetched forever.
    const result = materializeSessionSnapshots({ message: {}, part: PartMap.from({}) }, "ses_1", [
      { info: message("msg_1"), parts: [] },
    ])

    expect(result.part.get("msg_1")).toEqual([])
    const status = getSessionMaterializationStatus({ message: result.message, part: result.part }, "ses_1")
    expect(status.renderable).toBe(true)
    expect(status.missingPartMessageIDs).toEqual([])
  })

  test("keeps an empty non-assistant snapshot absent", () => {
    const result = materializeSessionSnapshots({ message: {}, part: PartMap.from({}) }, "ses_1", [
      { info: userMessage("msg_u"), parts: [] },
    ])

    expect("msg_u" in result.part).toBe(false)
  })

  test("preserves newer live streaming text when a stale snapshot materializes", () => {
    const livePart = part("prt_1", "msg_1", "text", "First chunk ")
    const stalePart = part("prt_1", "msg_1", "text", "")
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: PartMap.from({ msg_1: [livePart] }),
    }

    const result = materializeSessionSnapshots(state, "ses_1", [{ info: message("msg_1"), parts: [stalePart] }])

    expect(result.part.get("msg_1")![0]).toBe(livePart)
    expect((result.part.get("msg_1")![0] as { text?: string })?.text).toBe("First chunk ")
  })

  test("keeps the delta dedupe marker when a stale snapshot merges into live text", () => {
    // The reducer marks a part when a snapshot's text extends the live text, so the next delta can
    // drop the overlap it re-sends. A materialization that keeps the live text must keep the mark:
    // it is about the next delta, not about the snapshot that set it.
    const livePart = {
      ...part("prt_1", "msg_1", "text", "Hello world"),
      __dedupeNextDeltaFields: ["text"],
    } as unknown as Part
    const staleSnapshot = part("prt_1", "msg_1", "text", "Hello ")
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: PartMap.from({ msg_1: [livePart] }),
    }

    const result = materializeSessionSnapshots(state, "ses_1", [{ info: message("msg_1"), parts: [staleSnapshot] }])

    const merged = result.part.get("msg_1")![0] as unknown as { text?: string; __dedupeNextDeltaFields?: string[] }
    expect(merged.text).toBe("Hello world")
    expect(merged.__dedupeNextDeltaFields).toEqual(["text"])
  })

  test("a materialized part still dedupes the next overlapping delta", () => {
    const livePart = {
      ...part("prt_1", "msg_1", "text", "Hello world"),
      __dedupeNextDeltaFields: ["text"],
    } as unknown as Part
    const state = {
      ...INITIAL_STATE,
      message: { ses_1: [message("msg_1")] },
      part: PartMap.from({ msg_1: [livePart] }),
      session_status: {},
    } as State

    const materialized = materializeSessionSnapshots(state, "ses_1", [
      { info: message("msg_1"), parts: [part("prt_1", "msg_1", "text", "Hello ")] },
    ])
    const mergedState: State = { ...state, message: materialized.message, part: materialized.part.fork() }

    // The runtime re-sends the tail it already delivered; it must not land twice in the transcript.
    applyDirectoryEvent(mergedState, {
      type: "message.part.delta",
      properties: { messageID: "msg_1", partID: "prt_1", field: "text", delta: "world!" },
    } as Event)

    expect((mergedState.part.get("msg_1")![0] as { text?: string }).text).toBe("Hello world!")
  })

  test("preserves live streaming text when a stale snapshot has an invalid end time", () => {
    const livePart = part("prt_1", "msg_1", "text", "First chunk ")
    const stalePart = { ...part("prt_1", "msg_1", "text", ""), time: { start: 20, end: 10 } } as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: PartMap.from({ msg_1: [livePart] }),
    }

    const result = materializeSessionSnapshots(state, "ses_1", [{ info: message("msg_1"), parts: [stalePart] }])

    expect((result.part.get("msg_1")![0] as { text?: string })?.text).toBe("First chunk ")
  })

  test("preserves live streaming parts omitted by a stale snapshot", () => {
    const livePart = part("prt_1", "msg_1", "text", "First chunk ")
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: PartMap.from({ msg_1: [livePart] }),
    }

    const result = materializeSessionSnapshots(state, "ses_1", [{ info: message("msg_1"), parts: [] }])

    expect(result.part.get("msg_1")![0]).toBe(livePart)
  })

  test("does not preserve omitted optimistic user text parts beside server snapshot parts", () => {
    const optimisticPart = { id: "prt_optimistic", messageID: "msg_1", type: "text", text: "Hello" } as Part
    const serverPart = part("prt_server", "msg_1", "text", "Hello")
    const state = {
      message: { ses_1: [userMessage("msg_1")] },
      part: PartMap.from({ msg_1: [optimisticPart] }),
    }

    const result = materializeSessionSnapshots(state, "ses_1", [{ info: userMessage("msg_1"), parts: [serverPart] }])

    expect(result.part.get("msg_1")).toEqual([serverPart])
  })
})

describe("getSessionMaterializationStatus", () => {
  test("requires assistant parts for renderable cached state", () => {
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: PartMap.from({}),
    }

    expect(getSessionMaterializationStatus(state, "ses_1")).toEqual({
      hasMessages: true,
      renderable: false,
      missingPartMessageIDs: ["msg_1"],
    })
  })

  test("treats user-only cached state as renderable", () => {
    const state = {
      message: { ses_1: [{ ...message("msg_1"), role: "user" } as Message] },
      part: PartMap.from({}),
    }

    expect(getSessionMaterializationStatus(state, "ses_1")).toEqual({
      hasMessages: true,
      renderable: true,
      missingPartMessageIDs: [],
    })
  })
})
