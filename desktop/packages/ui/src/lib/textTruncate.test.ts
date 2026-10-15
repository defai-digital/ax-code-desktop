import { describe, expect, test } from "vitest"
import { truncateToCodeUnits } from "./textTruncate"

describe("truncateToCodeUnits", () => {
  test("returns the value unchanged when it already fits the budget", () => {
    expect(truncateToCodeUnits("abcdef", 6)).toBe("abcdef")
    expect(truncateToCodeUnits("abc🚀", 5)).toBe("abc🚀")
  })

  test("counts the ellipsis against the budget", () => {
    expect(truncateToCodeUnits("abcdef", 4)).toBe("abc…")
    expect(truncateToCodeUnits("abc🚀", 4)).toBe("abc…")
    expect(truncateToCodeUnits("abc🚀", 3)).toBe("ab…")
  })

  test("never leaves a lone surrogate at the cut", () => {
    // A plain code-unit slice at 40 would keep the high surrogate of the emoji
    // alone and render "\ud83d" — a replacement character in the tray, corrupted
    // stored data for a scheduled task title.
    const value = `${"y".repeat(38)}🚀rest`
    const result = truncateToCodeUnits(value, 40)

    expect(result).toBe(`${"y".repeat(38)}…`)
    expect(value.slice(0, 39)).toMatch(/[\uD800-\uDBFF]$/)
    expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })

  test("keeps the whole pair when the cut lands past it", () => {
    expect(truncateToCodeUnits(`${"y".repeat(38)}🚀rest`, 41)).toBe(`${"y".repeat(38)}🚀…`)
  })

  test("stays within the budget without an ellipsis", () => {
    expect(truncateToCodeUnits(`${"z".repeat(4)}🚀`, 4, "")).toBe("z".repeat(4))
    expect(truncateToCodeUnits(`${"z".repeat(3)}🚀`, 5, "")).toBe(`${"z".repeat(3)}🚀`)
    // The pair straddles the budget, so nothing of it is kept.
    expect(truncateToCodeUnits(`${"z".repeat(3)}🚀`, 4, "")).toBe("z".repeat(3))
  })
})
