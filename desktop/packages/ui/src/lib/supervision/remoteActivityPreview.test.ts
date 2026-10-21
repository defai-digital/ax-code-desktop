import { describe, expect, test } from "vitest"
import { remoteActivityPreview } from "./remoteActivityPreview"

describe("remoteActivityPreview", () => {
  test("uses the latest assistant text with the existing line and length rules", () => {
    expect(
      remoteActivityPreview([
        { info: { id: "a", role: "assistant" }, parts: [{ type: "text", text: "older" }] },
        {
          info: { id: "b", role: "assistant" },
          parts: [
            { type: "text", text: `  ${"x".repeat(150)}\nsecond line` },
            { type: "text", text: "ignored", ignored: true },
            { type: "reasoning", text: "private reasoning" },
            { type: "tool", text: "tool output" },
          ],
        },
        { info: { id: "c", role: "user" }, parts: [{ type: "text", text: "user text" }] },
      ]),
    ).toEqual({ kind: "message", text: `${"x".repeat(139)}…` })
  })

  test("normalizes page and part ordering without changing the fetched page", () => {
    const page = [
      {
        info: { id: "b", role: "assistant" },
        parts: [
          { id: "p2", type: "text", text: "newest" },
          { id: "p1", type: "text", text: "older part" },
        ],
      },
      { info: { id: "a", role: "assistant" }, parts: [{ id: "p0", type: "text", text: "oldest" }] },
    ]
    expect(remoteActivityPreview(page)).toEqual({ kind: "message", text: "newest" })
    expect(page[0].info.id).toBe("b")
    expect(page[0].parts[0].id).toBe("p2")
  })

  test("reuses credential scrubbing including credentials after the first line", () => {
    expect(
      remoteActivityPreview([
        { info: { id: "a", role: "assistant" }, parts: [{ type: "text", text: "safe fallback" }] },
        {
          info: { id: "b", role: "assistant" },
          parts: [{ type: "text", text: "safe first line\ntoken=abcdefghijk12345" }],
        },
      ]),
    ).toEqual({ kind: "message", text: "safe fallback" })
  })

  test("returns null for empty pages and pages without safe assistant text", () => {
    expect(remoteActivityPreview([])).toBeNull()
    expect(remoteActivityPreview([{ info: { id: "a", role: "assistant" } }])).toBeNull()
    expect(
      remoteActivityPreview([{ info: { id: "a", role: "assistant" }, parts: [{ type: "tool", text: "todo output" }] }]),
    ).toBeNull()
  })
})
