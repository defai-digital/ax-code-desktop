import { describe, expect, test } from "vitest"
import type { Message, Part } from "@defai-digital/ax-code-sdk/v2"
import { buildTurnWindowModel, updateTurnWindowModelIncremental, windowMessagesByTurn } from "./windowTurns"
import type { ChatMessageEntry } from "./types"

function message({
  id,
  role,
  parentID,
}: {
  id: string
  role: "user" | "assistant" | "system"
  parentID?: string
}): ChatMessageEntry {
  return {
    info: {
      id,
      role,
      ...(parentID ? { parentID } : {}),
      time: { created: 1 },
    } as Message,
    parts: [] as Part[],
  }
}

describe("windowTurns", () => {
  test("keeps a reply that is ordered before its prompt inside the turn window", () => {
    // Legacy id wrap could order a reply before its prompt; the single forward pass
    // never resolved such a parent, and the window slice started at the prompt's
    // index - so the reply was dropped from the window entirely.
    const u1 = message({ id: "u1", role: "user" })
    const a1 = message({ id: "a1", role: "assistant", parentID: "u1" })
    const a2 = message({ id: "a2", role: "assistant", parentID: "u2" })
    const u2 = message({ id: "u2", role: "user" })

    const model = buildTurnWindowModel([u1, a1, a2, u2])

    expect(model.messageToTurnId.get("a2")).toBe("u2")
    expect(model.messageToTurnIndex.get("a2")).toBe(1)
    // Turn 1 (u2) starts at a2, so windowing keeps the reply with its prompt.
    expect(model.turnMessageStartIndexes[1]).toBe(2)
    expect(windowMessagesByTurn([u1, a1, a2, u2], model, 1).map((entry) => entry.info.id)).toEqual(["a2", "u2"])
  })

  test("does not map assistant messages without a parent to the current turn", () => {
    const user = message({ id: "u1", role: "user" })
    const assistant = message({ id: "a1", role: "assistant" })

    const model = buildTurnWindowModel([user, assistant])

    expect(model.messageToTurnId.get("u1")).toBe("u1")
    expect(model.messageToTurnId.has("a1")).toBe(false)
  })

  test("incremental update does not map assistant messages without a parent to the current turn", () => {
    const user = message({ id: "u1", role: "user" })
    const assistant = message({ id: "a1", role: "assistant" })
    const base = buildTurnWindowModel([user])

    const next = updateTurnWindowModelIncremental(base, [user], [user, assistant])

    expect(next?.messageToTurnId.get("u1")).toBe("u1")
    expect(next?.messageToTurnId.has("a1")).toBe(false)
  })

  test("maps assistant messages to their parent user turn", () => {
    const user = message({ id: "u1", role: "user" })
    const assistant = message({ id: "a1", role: "assistant", parentID: "u1" })

    const model = buildTurnWindowModel([user, assistant])

    expect(model.messageToTurnId.get("a1")).toBe("u1")
  })

  test("refuses an append whose prompt has a reply ordered before it", () => {
    // `a2` lands before `u2` does, so the base model cannot map it (the same legacy id wrap the full build handles
    // above). The append of `u2` was taken as a plain append, giving the new turn a slice start at `u2` itself,
    // while the full build walks that slice back over `a2` — the window dropped the reply.
    const u1 = message({ id: "u1", role: "user" })
    const a1 = message({ id: "a1", role: "assistant", parentID: "u1" })
    const a2 = message({ id: "a2", role: "assistant", parentID: "u2" })
    const u2 = message({ id: "u2", role: "user" })

    const base = buildTurnWindowModel([u1, a1, a2])
    const next = updateTurnWindowModelIncremental(base, [u1, a1, a2], [u1, a1, a2, u2])

    // The caller rebuilds on null (`incrementalModel ?? buildTurnWindowModel(messages)`), which is what puts `a2`
    // back inside its prompt's turn.
    expect(next).toBeNull()
  })
})
