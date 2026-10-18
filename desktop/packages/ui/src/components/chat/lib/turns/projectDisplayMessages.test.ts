import { describe, expect, test } from "vitest"
import type { Message, Part } from "@defai-digital/ax-code-sdk/v2"
import { createDisplayMessageProjector, projectDisplayMessages } from "./projectDisplayMessages"
import type { ChatMessageEntry } from "./types"

const entry = (id: string, role: string, parts: object[] = [], parentID?: string): ChatMessageEntry => ({
  info: { id, role, parentID } as Message,
  parts: parts as Part[],
})
const text = (value: string) => ({ type: "text", text: value })

describe("display message projection", () => {
  test("retains the normalized history when only an ordinary assistant tail changes", () => {
    const compact = entry("compact", "system", [{ type: "compaction" }])
    const summary = entry("summary", "system", [text("summary")], "compact")
    const user = entry("user", "user", [text("next")])
    const tail = entry("tail", "assistant", [text("a")], "user")
    const project = createDisplayMessageProjector()
    const before = project([compact, summary, user, tail])
    const changed = entry("tail", "assistant", [text("ab")], "user")
    const after = project([compact, summary, user, changed])
    expect(after).toEqual(projectDisplayMessages([compact, summary, user, changed]))
    expect((after[0].info as { clientRole?: string }).clientRole).toBe("user")
    expect((after[1].info as { clientRole?: string }).clientRole).toBe("assistant")
    expect(after[1]).toBe(before[1])
    expect(after[3]).toBe(changed)
    expect(project([compact, summary, user, changed])).toBe(after)
  })

  test("recomputes shell and task bridges, including a transition into a bridge", () => {
    for (const tool of ["bash", "task"]) {
      const user = entry(
        "user",
        "user",
        tool === "bash"
          ? [{ ...text("The following tool was executed by the user"), synthetic: true }]
          : [{ type: "subtask", prompt: "task", description: "task" }],
      )
      const tail = entry("tail", "assistant", [text("starting")], "user")
      const project = createDisplayMessageProjector()
      expect(project([user, tail])).toHaveLength(2)
      const bridge = (value: string) =>
        entry(
          "tail",
          "assistant",
          [
            {
              type: "tool",
              tool,
              state: { status: "completed", input: { command: "ls" }, output: value, metadata: { sessionID: value } },
            },
          ],
          "user",
        )
      for (const value of ["one", "two"]) {
        const messages = [user, bridge(value)]
        const result = project(messages)
        expect(result).toEqual(projectDisplayMessages(messages))
        expect(result).toHaveLength(1)
        if (tool === "task") expect(result[0].parts[0]).toHaveProperty("taskSessionID", value)
        else expect(result[0].parts[0]).toHaveProperty("shellAction.output", value)
      }
    }
  })

  test("preserves last-ID-wins deduplication and falls back on history edits, role changes and deletion", () => {
    const user = entry("user", "user", [text("question")])
    const first = entry("tail", "assistant", [text("first")], "user")
    const last = entry("tail", "assistant", [text("last")], "user")
    const system = entry("system", "system")
    const project = createDisplayMessageProjector()
    const duplicate = project([user, first, last])
    expect(duplicate.map((message) => message.info.id)).toEqual(["user", "tail"])
    expect(duplicate[1]).toBe(last)
    for (const messages of [
      [user, first, { ...last, parts: [text("update") as Part] }],
      [user, first],
      [system, user, first],
      [system, { ...user, parts: [text("edit") as Part] }, first],
      [system, user, entry("tail", "system", [text("role changed")], "user")],
      [first, user, system],
      [],
    ])
      expect(project(messages)).toEqual(projectDisplayMessages(messages))
  })
})
