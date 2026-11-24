import { describe, expect, test } from "vitest"
import { heldScrollTop } from "./holdAnchor"

describe("heldScrollTop", () => {
  test("keeps the reader on the same row when content above it grows", () => {
    expect(heldScrollTop(400, 280, 120)).toBe(560)
  })

  test("leaves the offset alone for sub-pixel drift", () => {
    expect(heldScrollTop(400, 120.4, 120)).toBe(400)
  })

  test("moves back up when a tile above the reader shrinks", () => {
    expect(heldScrollTop(800, 90, 140)).toBe(750)
  })
})
