import { readFile } from "node:fs/promises"
import path from "node:path"
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

// McpPage needs the whole settings shell to mount, so its editor wiring is asserted against the
// source, as neighbouring view contracts are.
describe("McpPage env editor remount", () => {
  test("keys both editors by the selected server and project", async () => {
    const source = await readFile(path.resolve(__dirname, "McpPage.tsx"), "utf8")
    const editors = source.match(/<EnvEditor\s[\s\S]*?\/>/g) ?? []

    // Switching servers reuses the same component instance, so revealed value rows carried over
    // and the next server's secret at the same index rendered in plain text.
    expect(editors).toHaveLength(2)
    for (const editor of editors) {
      expect(editor).toContain("key={selectedMcpLoadKey}")
    }
    expect(source).toContain("const selectedMcpLoadKey =")
    expect(source).toContain("selectedMcpNameKey}|${currentDirectory ?? \"\"}")
  })
})
