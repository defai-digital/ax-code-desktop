import { describe, expect, test } from "vitest"

import { revealedRowsAfterRemoval } from "./envRowReveal"

describe("revealedRowsAfterRemoval", () => {
  test("keeps the revealed row revealed when one above it goes", () => {
    // The row the user revealed moves up with everything below the removed one; carrying its old
    // position over printed the row that moved into it instead.
    expect([...revealedRowsAfterRemoval(new Set([1]), 0)]).toEqual([0])
  })

  test("shifts every position below the removed row", () => {
    expect([...revealedRowsAfterRemoval(new Set([0, 2, 5]), 1)]).toEqual([0, 1, 4])
  })

  test("does not shift positions above the removed row", () => {
    expect([...revealedRowsAfterRemoval(new Set([0, 1]), 2)]).toEqual([0, 1])
  })

  test("drops the removed row's own position", () => {
    expect([...revealedRowsAfterRemoval(new Set([0, 1, 2]), 1)]).toEqual([0, 1])
    expect([...revealedRowsAfterRemoval(new Set([1]), 1)]).toEqual([])
  })

  test("does not mutate the set it was given", () => {
    const revealed = new Set([0, 1])
    revealedRowsAfterRemoval(revealed, 0)
    expect([...revealed]).toEqual([0, 1])
  })
})
