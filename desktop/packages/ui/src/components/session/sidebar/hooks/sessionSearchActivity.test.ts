import { describe, expect, test } from "vitest"
import { isSessionSearchActive } from "./sessionSearchActivity"

describe("isSessionSearchActive", () => {
  test("only filters while the field showing the query is open", () => {
    // The query outlives the field: with the field closed the list stayed filtered by text that
    // was no longer on screen, an empty state with no visible cause and no way to clear it.
    expect(isSessionSearchActive({ isSessionSearchOpen: false, normalizedQuery: "deploy" })).toBe(false)
    expect(isSessionSearchActive({ isSessionSearchOpen: true, normalizedQuery: "deploy" })).toBe(true)
    expect(isSessionSearchActive({ isSessionSearchOpen: true, normalizedQuery: "" })).toBe(false)
  })
})
