import { describe, expect, test } from "vitest"

import { isQueueableMessage } from "./queuedMessageRouting"

describe("isQueueableMessage", () => {
  test("a command cannot be queued", () => {
    // Queued behind a busy session it would sit until the flush, where one dispatch path ran it and
    // the other sent it to the model as text.
    expect(isQueueableMessage("/compact")).toBe(false)
    expect(isQueueableMessage("  /summary of the last turn")).toBe(false)
  })

  test("plain text and a runtime command both queue", () => {
    expect(isQueueableMessage("hello")).toBe(true)
    // Not one of the composer's own commands: it is delivered as a command by both dispatch paths.
    expect(isQueueableMessage("/my-custom-command")).toBe(true)
  })

  test("shell input is not a composer command", () => {
    expect(isQueueableMessage("/ls -la", "shell")).toBe(true)
  })
})
