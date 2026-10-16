import { describe, expect, test } from "vitest"

import { buildUpdateReleaseUrl, normalizeReleaseNotesForMarkdown, parseChangelog } from "./updateReleaseNotes"

describe("normalizeReleaseNotesForMarkdown", () => {
  test("converts HTML release notes to readable markdown text", () => {
    const html =
      "<h2>[1.1.3] - 2026-06-14</h2><ul><li>UI: fixed provider loading.</li><li>CI: retried installs.</li></ul>"

    expect(normalizeReleaseNotesForMarkdown(html)).toBe(
      "## [1.1.3] - 2026-06-14\n\n- UI: fixed provider loading.\n- CI: retried installs.",
    )
  })

  test("keeps markdown release notes unchanged", () => {
    const markdown = "## [1.1.3] - 2026-06-14\n\n- UI: fixed provider loading."

    expect(normalizeReleaseNotesForMarkdown(markdown)).toBe(markdown)
  })

  test("decodes common HTML entities", () => {
    expect(normalizeReleaseNotesForMarkdown("<p>Fix A &amp; B &#35;42</p>")).toBe("Fix A & B #42")
  })

  test("drops script and style blocks before converting HTML", () => {
    expect(
      normalizeReleaseNotesForMarkdown(
        "<h2>Safe</h2><script>alert(1)</script><style>body{}</style>&lt;script&gt;alert(2)&lt;/script&gt;<p>Done</p>",
      ),
    ).toBe("## Safe\n\nDone")
  })

  test("preserves trailing text after an unterminated tag-like fragment", () => {
    expect(normalizeReleaseNotesForMarkdown("<p>Fixed comparisons like a < b and trailing <note")).toBe(
      "Fixed comparisons like a < b and trailing <note",
    )
  })

  test("preserves literal less-than comparisons inside HTML text", () => {
    expect(normalizeReleaseNotesForMarkdown("<p>Use a < b before closing.</p>")).toBe("Use a < b before closing.")
  })

  test("searches a raw-text block without a folded copy whose offsets can drift", () => {
    // `İ` lowercases to two code units, so the offsets found in the lowercased copy did not line up with the string
    // they were sliced from: <script> blocks were only partly removed and the text around them shifted.
    const result = normalizeReleaseNotesForMarkdown("İ<p>x</p><script>evil()</script>y")

    expect(result).toBe("İx\n\ny")
  })

  test("leaves an out-of-range numeric entity as written instead of throwing", () => {
    // `Number.isFinite` accepted these, and `String.fromCodePoint` threw a RangeError while the update
    // dialog was rendering, so the notes — and the buttons with them — never appeared.
    expect(normalizeReleaseNotesForMarkdown("<p>Ship it &#x110000; anyway</p>")).toBe("Ship it &#x110000; anyway")
    expect(normalizeReleaseNotesForMarkdown("<p>Ship it &#99999999; anyway</p>")).toBe("Ship it &#99999999; anyway")
    expect(() => normalizeReleaseNotesForMarkdown("<p>x &#xffffffff; y</p>")).not.toThrow()
  })
})

describe("buildUpdateReleaseUrl", () => {
  test("links bare versions to package release tags", () => {
    expect(buildUpdateReleaseUrl("6.7.19")).toBe("https://github.com/defai-digital/ax-code/releases/tag/v6.7.19")
  })

  test("preserves versions that already include a release tag prefix", () => {
    expect(buildUpdateReleaseUrl("desktop-v6.7.19")).toBe(
      "https://github.com/defai-digital/ax-code/releases/tag/desktop-v6.7.19",
    )
    expect(buildUpdateReleaseUrl("v6.7.19")).toBe("https://github.com/defai-digital/ax-code/releases/tag/v6.7.19")
  })

  test("falls back to the release list when no version is available", () => {
    expect(buildUpdateReleaseUrl(undefined)).toBe("https://github.com/defai-digital/ax-code/releases")
  })
})

describe("parseChangelog", () => {
  test("renders an empty version section as empty", () => {
    // The section content fell back to the whole body when its own text was empty, so a version whose section
    // carries nothing printed every other version's notes under it.
    const parsed = parseChangelog("## [1.2.0] - 2026-01-01\n\n## [1.1.0] - 2025-12-01\n- fix A", "Changelog")

    expect(parsed.kind).toBe("sections")
    if (parsed.kind !== "sections") throw new Error("expected sections")
    expect(parsed.sections.map((section) => section.version)).toEqual(["1.2.0", "1.1.0"])
    expect(parsed.sections[0]?.content).toBe("")
    expect(parsed.sections[1]?.content).toBe("- fix A")
  })

  test("keeps the whole body when it carries no version headings", () => {
    const parsed = parseChangelog("Just a note for 1.2.0", "Changelog")

    expect(parsed).toEqual({ kind: "raw", title: "Changelog", content: "Just a note for 1.2.0" })
  })
})
