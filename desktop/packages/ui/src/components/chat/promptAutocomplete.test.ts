import { describe, expect, test } from "vitest"
import { resolvePromptAutocomplete } from "./promptAutocomplete"

describe("prompt autocomplete derivation", () => {
  test.each([
    ["/", 1, { kind: "command", query: "" }],
    ["/build", 3, { kind: "command", query: "build" }],
    ["/build\nnext", 6, { kind: "command", query: "build" }],
    ["/build\nnext", 7, { kind: "none" }],
    ["/build arguments", 3, { kind: "none" }],
    ["draft #", 7, { kind: "snippet", query: "" }],
    ["draft #daily", 12, { kind: "snippet", query: "daily" }],
    ["draft #daily suffix", 12, { kind: "snippet", query: "daily" }],
    ["draft @src/file.ts", 18, { kind: "mention", query: "src/file.ts" }],
    ["user@example.com", 16, { kind: "none" }],
    ["plain text", 10, { kind: "none" }],
    ["draft #daily ", 13, { kind: "none" }],
    ["/@agent", 7, { kind: "command", query: "@agent" }],
    ["#note@file", 10, { kind: "snippet", query: "note@file" }],
  ])("resolves %j at cursor %i", (value, cursor, expected) => {
    expect(resolvePromptAutocomplete(value, cursor)).toEqual(expected)
  })
})
