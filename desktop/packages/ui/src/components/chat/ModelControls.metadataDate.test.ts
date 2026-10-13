import { describe, expect, test } from "vitest"

// Set before the module is imported: `Intl.DateTimeFormat` reads the zone when it is constructed,
// and the formatters under test are module-level. West of UTC is where the bug showed.
process.env.TZ = "America/New_York"

const { formatDate, formatKnowledge } = await import("./modelMetadataDate")

describe("model metadata dates", () => {
  test("the process timezone is the negative-offset zone this test needs", () => {
    // Guards the assertion below: a runtime that ignored TZ would let the old implementation pass.
    expect(new Date("2026-01-01T00:00:00Z").getDate()).toBe(31)
  })

  test("renders a knowledge cutoff as its own month", () => {
    expect(formatKnowledge("2026-02")).toBe("Feb 2026")
    expect(formatKnowledge("2025-12")).toBe("Dec 2025")
  })

  test("renders a release date as its own calendar day", () => {
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026")
  })

  test("passes a knowledge cutoff through when it is not a YYYY-MM value", () => {
    expect(formatKnowledge("early 2026")).toBe("early 2026")
    expect(formatKnowledge(undefined)).toBe("—")
  })
})
