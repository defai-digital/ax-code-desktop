import { describe, expect, test } from "vitest"
import { keyboardReorderTarget } from "./starterReorder"

const ids = ["a", "b", "c"]
const key = (
  k: string,
  extra: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {},
) => ({
  key: k,
  altKey: true,
  ...extra,
})

describe("starter keyboard reorder", () => {
  test("Alt with an arrow moves one place earlier or later", () => {
    expect(keyboardReorderTarget(ids, "b", key("ArrowLeft"))).toBe("a")
    expect(keyboardReorderTarget(ids, "b", key("ArrowUp"))).toBe("a")
    expect(keyboardReorderTarget(ids, "b", key("ArrowRight"))).toBe("c")
    expect(keyboardReorderTarget(ids, "b", key("ArrowDown"))).toBe("c")
  })

  test("nothing moves past either edge", () => {
    expect(keyboardReorderTarget(ids, "a", key("ArrowLeft"))).toBeNull()
    expect(keyboardReorderTarget(ids, "c", key("ArrowRight"))).toBeNull()
  })

  test("Enter, Space, plain arrows and other modifiers are not moves", () => {
    expect(keyboardReorderTarget(ids, "b", { key: "Enter", altKey: true })).toBeNull()
    expect(keyboardReorderTarget(ids, "b", { key: " ", altKey: true })).toBeNull()
    expect(keyboardReorderTarget(ids, "b", { key: "ArrowLeft", altKey: false })).toBeNull()
    expect(keyboardReorderTarget(ids, "b", key("ArrowLeft", { metaKey: true }))).toBeNull()
    expect(keyboardReorderTarget(ids, "b", key("ArrowLeft", { shiftKey: true }))).toBeNull()
    expect(keyboardReorderTarget(ids, "missing", key("ArrowLeft"))).toBeNull()
  })
})
