import { describe, expect, test } from "vitest"
import type { Part } from "@defai-digital/ax-code-sdk/v2"

import { activityRowVisibleParts, countActivityRows, planActivityTrim, type ActivityRowOptions } from "./activityRows"

const merged: ActivityRowOptions = {
  showReasoningTraces: true,
  collapsibleThinkingBlocks: true,
  groupReasoningBlocks: true,
}

const text = (id: string, value: string): Part =>
  ({ id, type: "text", text: value, messageID: "m", sessionID: "s" }) as Part
const reasoning = (id: string): Part =>
  ({ id, type: "reasoning", text: "thinking", messageID: "m", sessionID: "s" }) as Part
const tool = (id: string, status: string): Part =>
  ({ id, type: "tool", tool: "read", callID: id, messageID: "m", sessionID: "s", state: { status } }) as Part
const compaction = (id: string): Part => ({ id, type: "compaction", messageID: "m", sessionID: "s" }) as Part

describe("planActivityTrim", () => {
  test("hides nothing while the rows fit", () => {
    expect(planActivityTrim([2, 3, 2], 7)).toEqual({ hiddenMessages: 0, skipRows: 0, hiddenRows: 0 })
  })

  test("hides whole earlier messages and cuts into the one at the edge", () => {
    // Last 7 rows: 1 of the second message, then 4 and 2.
    expect(planActivityTrim([3, 3, 4, 2], 7)).toEqual({ hiddenMessages: 1, skipRows: 2, hiddenRows: 5 })
  })

  test("hides a message whole when the budget ends right at it", () => {
    expect(planActivityTrim([3, 4, 3], 7)).toEqual({ hiddenMessages: 1, skipRows: 0, hiddenRows: 3 })
  })

  test("keeps the latest rows of one long message", () => {
    expect(planActivityTrim([12], 7)).toEqual({ hiddenMessages: 0, skipRows: 5, hiddenRows: 5 })
  })
})

describe("countActivityRows", () => {
  test("does not count a reasoning part that renders nothing", () => {
    // Regression: the row count included an empty reasoning part, so the collapsed
    // window showed six rows instead of seven and "+N more" overcounted.
    const empty = reasoning("empty")
    ;(empty as unknown as { text?: string }).text = ""

    expect(activityRowVisibleParts([empty, text("t", "Done")], merged).map((part) => part.id)).toEqual(["t"])
    expect(countActivityRows([empty, text("t", "Done")], merged)).toBe(1)
  })

  test("counts merged reasoning as one row and keeps every reasoning part visible", () => {
    const parts = [reasoning("a"), reasoning("b"), text("t", "Done"), reasoning("c")]
    expect(activityRowVisibleParts(parts, merged).map((part) => part.id)).toEqual(["a", "b", "t", "c"])
    expect(countActivityRows(parts, merged)).toBe(2)
  })

  test("counts one row per reasoning part when thinking blocks are not collapsible", () => {
    const parts = [reasoning("a"), reasoning("b"), reasoning("c")]
    expect(
      countActivityRows(parts, {
        showReasoningTraces: true,
        collapsibleThinkingBlocks: false,
        groupReasoningBlocks: true,
      }),
    ).toBe(3)
  })

  test("counts one row per reasoning part when grouping is off", () => {
    const parts = [reasoning("a"), text("t", "Done"), reasoning("b")]
    expect(
      countActivityRows(parts, {
        showReasoningTraces: true,
        collapsibleThinkingBlocks: true,
        groupReasoningBlocks: false,
      }),
    ).toBe(3)
  })

  test("hides reasoning rows when traces are off", () => {
    const parts = [reasoning("a"), reasoning("b"), text("t", "Done")]
    expect(countActivityRows(parts, { ...merged, showReasoningTraces: false })).toBe(1)
    expect(activityRowVisibleParts(parts, { ...merged, showReasoningTraces: false }).map((part) => part.id)).toEqual([
      "t",
    ])
  })

  test("drops empty text parts", () => {
    const parts = [text("blank", "  "), text("empty", ""), text("t", "Done")]
    expect(activityRowVisibleParts(parts, merged).map((part) => part.id)).toEqual(["t"])
    expect(countActivityRows(parts, merged)).toBe(1)
  })

  test("drops compaction parts", () => {
    const parts = [compaction("c"), text("t", "Done")]
    expect(activityRowVisibleParts(parts, merged).map((part) => part.id)).toEqual(["t"])
    expect(countActivityRows(parts, merged)).toBe(1)
  })

  test("counts active, finalized, and pending tools, and skips a tool that is neither", () => {
    const parts = [
      tool("pending", "pending"),
      tool("running", "running"),
      tool("done", "completed"),
      tool("failed", "error"),
      tool("queued", "queued"),
    ]
    expect(activityRowVisibleParts(parts, merged).map((part) => part.id)).toEqual([
      "pending",
      "running",
      "done",
      "failed",
      "queued",
    ])
    expect(countActivityRows(parts, merged)).toBe(4)
  })
})
