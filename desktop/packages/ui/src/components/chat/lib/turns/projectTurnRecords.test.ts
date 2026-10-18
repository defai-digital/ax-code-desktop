import { describe, expect, test, vi } from "vitest"
import type { Message, Part } from "@defai-digital/ax-code-sdk/v2"
import * as activityProjection from "./projectTurnActivity"
import { projectTurnRecords } from "./projectTurnRecords"
import type { ChatMessageEntry } from "./types"

function createMessageEntry({
  id,
  role,
  parentID,
  createdAt,
}: {
  id: string
  role: "user" | "assistant" | "system"
  parentID?: string
  createdAt: number
}): ChatMessageEntry {
  return {
    info: {
      id,
      role,
      ...(parentID ? { parentID } : {}),
      time: { created: createdAt },
    } as Message,
    parts: [] as Part[],
  }
}

describe("projectTurnRecords", () => {
  test("groups assistant replies under their parent user turn", () => {
    const user = createMessageEntry({ id: "u1", role: "user", createdAt: 1 })
    const assistant = createMessageEntry({ id: "a1", role: "assistant", parentID: "u1", createdAt: 2 })

    const projection = projectTurnRecords([user, assistant])

    expect(projection.turns).toHaveLength(1)
    expect(projection.turns[0]?.turnId).toBe("u1")
    expect(projection.turns[0]?.assistantMessageIds).toEqual(["a1"])
    expect(projection.ungroupedMessageIds.size).toBe(0)
  })

  test("keeps out-of-order assistant replies attached to their parent user turn", () => {
    const user1 = createMessageEntry({ id: "u1", role: "user", createdAt: 1 })
    const assistant1 = createMessageEntry({ id: "a1", role: "assistant", parentID: "u1", createdAt: 2 })
    const assistant2 = createMessageEntry({ id: "a2", role: "assistant", parentID: "u2", createdAt: 4 })
    const user2 = createMessageEntry({ id: "u2", role: "user", createdAt: 3 })

    const projection = projectTurnRecords([user1, assistant1, assistant2, user2])

    expect(projection.turns).toHaveLength(2)
    expect(projection.turns[0]?.turnId).toBe("u1")
    expect(projection.turns[0]?.assistantMessageIds).toEqual(["a1"])
    expect(projection.turns[1]?.turnId).toBe("u2")
    expect(projection.turns[1]?.assistantMessageIds).toEqual(["a2"])
    expect(projection.ungroupedMessageIds.size).toBe(0)
  })

  test("does not render assistant replies while their parent user turn is missing", () => {
    const user1 = createMessageEntry({ id: "u1", role: "user", createdAt: 1 })
    const assistant1 = createMessageEntry({ id: "a1", role: "assistant", parentID: "u1", createdAt: 2 })
    const assistant2 = createMessageEntry({ id: "a2", role: "assistant", parentID: "u2", createdAt: 4 })

    const projection = projectTurnRecords([user1, assistant1, assistant2])

    expect(projection.turns).toHaveLength(1)
    expect(projection.turns[0]?.turnId).toBe("u1")
    expect(projection.turns[0]?.assistantMessageIds).toEqual(["a1"])
    expect(projection.ungroupedMessageIds.has("a2")).toBe(false)
    expect(projection.indexes.messageToTurnId.has("a2")).toBe(false)
  })

  test("does not render orphan assistant messages as standalone ungrouped entries", () => {
    const assistant = createMessageEntry({ id: "a1", role: "assistant", parentID: "missing-user", createdAt: 1 })

    const projection = projectTurnRecords([assistant])

    expect(projection.turns).toHaveLength(0)
    expect(projection.ungroupedMessageIds.has("a1")).toBe(false)
    expect(projection.indexes.messageToTurnId.has("a1")).toBe(false)
  })

  test("keeps non-assistant orphan messages available as ungrouped entries", () => {
    const system = createMessageEntry({ id: "s1", role: "system", createdAt: 1 })

    const projection = projectTurnRecords([system])

    expect(projection.turns).toHaveLength(0)
    expect(projection.ungroupedMessageIds.has("s1")).toBe(true)
  })

  test("reuses unchanged turn records from the previous projection", () => {
    const user1 = createMessageEntry({ id: "u1", role: "user", createdAt: 1 })
    const assistant1 = createMessageEntry({ id: "a1", role: "assistant", parentID: "u1", createdAt: 2 })
    const user2 = createMessageEntry({ id: "u2", role: "user", createdAt: 3 })
    const assistant2 = createMessageEntry({ id: "a2", role: "assistant", parentID: "u2", createdAt: 4 })
    const initial = projectTurnRecords([user1, assistant1, user2, assistant2])
    const updatedAssistant2 = {
      ...assistant2,
      parts: [{ type: "text", text: "stream update" } as Part],
    }

    const next = projectTurnRecords([user1, assistant1, user2, updatedAssistant2], {
      previousProjection: initial,
    })

    expect(next.turns[0]).toBe(initial.turns[0])
    expect(next.turns[1]).not.toBe(initial.turns[1])
    expect(next.indexes.messageToTurnId).toBe(initial.indexes.messageToTurnId)
    expect(next.indexes.messageMetaById).toBe(initial.indexes.messageMetaById)
    expect(next.lastTurnMessageIds).toBe(initial.lastTurnMessageIds)
  })

  test("reuses the whole turns array when every turn is unchanged", () => {
    const user = createMessageEntry({ id: "u1", role: "user", createdAt: 1 })
    const assistant = createMessageEntry({ id: "a1", role: "assistant", parentID: "u1", createdAt: 2 })
    const initial = projectTurnRecords([user, assistant])

    const next = projectTurnRecords([user, assistant], {
      previousProjection: initial,
    })

    expect(next.turns).toBe(initial.turns)
    expect(next.turns[0]).toBe(initial.turns[0])
  })
})

describe("incremental turn derivation", () => {
  test("matches full projection across content updates and structural invalidations", () => {
    const user1 = createMessageEntry({ id: "u1", role: "user", createdAt: 1 })
    const reply1 = createMessageEntry({ id: "a1", role: "assistant", parentID: "u1", createdAt: 2 })
    const user2 = createMessageEntry({ id: "u2", role: "user", createdAt: 3 })
    const reply2 = createMessageEntry({ id: "a2", role: "assistant", parentID: "u2", createdAt: 4 })
    const system = createMessageEntry({ id: "s", role: "system", createdAt: 0 })
    const content = (message: ChatMessageEntry, text: string): ChatMessageEntry => ({
      ...message,
      parts: [{ id: "text", type: "text", text } as Part],
    })
    const sequences: ChatMessageEntry[][] = [
      [user1, reply1, user2, reply2],
      [content(user1, "updated user"), content(reply1, "old turn"), user2, content(reply2, "stream")],
      [user1, reply2, reply1, user2], // Out-of-order but still parented.
      [system, user1, reply1, user2, reply2], // Prepend.
      [system, user1, reply1, user2], // Delete.
      [system, user1, reply1, user2, reply2, reply2], // Duplicate ID.
      [system, user1, reply1, user2, reply2, content(reply2, "duplicate update")],
      [user1, reply1, user2, { ...reply2, info: { ...reply2.info, parentID: "u1" } as Message }],
      [user1, reply1, user2, { ...reply2, info: { ...reply2.info, clientRole: "system" } as unknown as Message }],
      [user1, reply1, user2, reply2],
    ]
    let previous = projectTurnRecords([])
    for (const messages of sequences) {
      const before = structuredClone(previous)
      const next = projectTurnRecords(messages, { previousProjection: previous })
      expect(next).toEqual(projectTurnRecords(messages))
      expect(previous).toEqual(before)
      previous = next
    }
  })

  test("ignores orphan content updates without invalidating grouping indexes", () => {
    const orphan = createMessageEntry({ id: "a", role: "assistant", parentID: "missing", createdAt: 1 })
    const before = projectTurnRecords([orphan])
    const updated = { ...orphan, parts: [{ type: "text", text: "orphan update" } as Part] }
    expect(projectTurnRecords([updated], { previousProjection: before })).toBe(before)
    const parent = createMessageEntry({ id: "missing", role: "user", createdAt: 0 })
    expect(projectTurnRecords([parent, updated], { previousProjection: before })).toEqual(
      projectTurnRecords([parent, updated]),
    )
  })

  test("derives only the changed turn and invalidates reuse when display policy changes", () => {
    const user1 = createMessageEntry({ id: "u1", role: "user", createdAt: 1 })
    const reply1 = createMessageEntry({ id: "a1", role: "assistant", parentID: "u1", createdAt: 2 })
    const user2 = createMessageEntry({ id: "u2", role: "user", createdAt: 3 })
    const reply2 = createMessageEntry({ id: "a2", role: "assistant", parentID: "u2", createdAt: 4 })
    const before = projectTurnRecords([user1, reply1, user2, reply2])
    const spy = vi.spyOn(activityProjection, "projectTurnActivity")
    try {
      const changed = { ...reply2, parts: [{ id: "text", type: "text", text: "new tail" } as Part] }
      const after = projectTurnRecords([user1, reply1, user2, changed], { previousProjection: before })
      expect(spy).toHaveBeenCalledTimes(1)
      expect(after.turns[0]).toBe(before.turns[0])
      expect(after.turns[1]).not.toBe(before.turns[1])
      expect(after).toEqual(projectTurnRecords([user1, reply1, user2, changed]))
      spy.mockClear()
      const policyChange = projectTurnRecords([user1, reply1, user2, changed], {
        previousProjection: after,
        showTextJustificationActivity: true,
      })
      expect(spy).toHaveBeenCalledTimes(2)
      expect(policyChange).toEqual(
        projectTurnRecords([user1, reply1, user2, changed], { showTextJustificationActivity: true }),
      )
    } finally {
      spy.mockRestore()
    }
  })

  test("refreshes message order when an ungrouped message shifts existing turns", () => {
    const user = createMessageEntry({ id: "u", role: "user", createdAt: 1 })
    const reply = createMessageEntry({ id: "a", role: "assistant", parentID: "u", createdAt: 2 })
    const before = projectTurnRecords([user, reply])
    const system = createMessageEntry({ id: "s", role: "system", createdAt: 0 })
    const after = projectTurnRecords([system, user, reply], { previousProjection: before })
    expect(after.turns[0]).not.toBe(before.turns[0])
    expect(after.turns[0].messages.map((message) => message.order)).toEqual([1, 2])
  })
})
