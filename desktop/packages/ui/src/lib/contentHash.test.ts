import { describe, expect, test } from "vitest"
import { contentHash53 } from "./contentHash"

describe("content hash compatibility", () => {
  // Captured from both existing consumers before extraction; review marks must survive the refactor.
  test.each([
    ["", "bdcb81aee8d83"],
    ["abc", "11f9f91ac18c8d"],
    ["中文", "7c5ba38c2932a"],
    ["😀", "10ca036ef9b4ae"],
    ["a\nb", "1de594bc8e1ca1"],
    ["\ud800", "1fb54e0827e5c5"],
  ])("keeps the existing UTF-16 hash for %j", (input, expected) => {
    expect(contentHash53(input)).toBe(expected)
  })
})
