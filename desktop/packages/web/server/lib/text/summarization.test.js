import { describe, expect, it } from "vitest"

import { sanitizeForNote, sanitizeForSummary, summarizeText } from "./summarization.js"

describe("text summarization stubs", () => {
  it("keeps a slash inside a word, and still drops a path", () => {
    // The path pattern matched any `/<word>`, so prose that uses a slash lost its second half.
    expect(sanitizeForSummary("either/or and TCP/IP and/or UDP")).toBe("either/or and TCP/IP and/or UDP")
    expect(sanitizeForSummary("see /usr/local/bin for details")).toBe("see for details")
    // A trailing separator goes with the path rather than being left behind.
    expect(sanitizeForSummary("in /usr/bin/ today")).toBe("in today")
    // A path attached to a label or a scheme is still a path. Stripping the punctuation glued it to the word before
    // it, where the whitespace-anchored pattern no longer saw a boundary.
    expect(sanitizeForSummary("see [docs](/etc/hosts) today")).toBe("see docs today")
    expect(sanitizeForSummary("see file:/etc/hosts today")).toBe("see file: today")
  })

  it("keeps ordinary parentheses and their punctuation", () => {
    // Replacing brackets with a space fixed the label above but injected a space before every comma and period that
    // followed a parenthesis.
    expect(sanitizeForSummary("Done (ok), then (maybe).")).toBe("Done ok, then maybe.")
    expect(sanitizeForSummary("Read a[0] here")).toBe("Read a0 here")
  })

  it("treats a non-http scheme URL as one link", () => {
    // The path pass accepts a colon before the slash, so `ssh://git@host/repo.git` lost `//git` and kept a
    // scheme-shaped remnant. Only the http(s) form was rewritten as a link.
    expect(sanitizeForSummary("clone ssh://git@host/repo.git now")).toBe("clone a link now")
    expect(sanitizeForSummary("open file:///tmp/report now")).toBe("open a link now")
    // A link followed by punctuation keeps that punctuation: the match stops before it.
    expect(sanitizeForSummary("see https://example.com, then")).toBe("see a link, then")
  })

  it("strips a scheme URL from note text too", () => {
    // Note mode only knew the http(s) form, so a clone URL survived there verbatim.
    expect(sanitizeForNote("clone ssh://git@host/repo.git now")).toBe("clone now")
    // A bracketed link keeps its brackets balanced: the match stops before them instead of consuming the closing
    // one. Note mode drops the link itself, so the pair stays empty.
    expect(sanitizeForNote("[https://example.com]")).toBe("[]")
  })

  it("masks a reverse-DNS scheme whole instead of leaving a remnant or a path", () => {
    // The bounded scheme used to match at the last dot, mask `xcode://…` and leave `com.`. The bound is wide
    // enough for the whole run now, so the link — including the absolute path after `///` — goes as one.
    expect(sanitizeForSummary("open com.apple.dt.xcode://host/path now")).toBe("open a link now")
    expect(sanitizeForSummary("open com.apple.dt.xcode:///Users/akira/secret/proj now")).toBe("open a link now")
    // There is no length bound now: the lookbehind makes an unbounded run linear (only its first character can
    // start a match), so even an absurd scheme is masked whole rather than leaking the path after it.
    const longScheme = "a".repeat(80)
    expect(sanitizeForSummary(`open ${longScheme}:///Users/me/x now`)).toBe("open a link now")
    // A scheme run may also start the string, follow a non-ASCII word, or begin with a digit: the last is not a
    // legal scheme but the path after `://` must still not reach the summary.
    expect(sanitizeForSummary("x-code:///Users/me/x")).toBe("a link")
    expect(sanitizeForSummary("café https://x/y 現在")).toBe("café a link 現在")
    expect(sanitizeForSummary("open 1abc:///Users/me/x now")).toBe("open a link now")
  })

  it("removes code from summary text before stripping markdown punctuation", () => {
    expect(sanitizeForSummary("Read `const value = 1` aloud")).toBe("Read aloud")
    expect(sanitizeForSummary("Before\n```js\nconst value = 1\n```\nAfter")).toBe("Before After")
  })

  it("does not call the retired zen provider", async () => {
    const result = await summarizeText({
      text: "The implementation now correctly loads notification templates before dispatching the notification. It also fetches the latest assistant message when the event payload does not include message parts. This should make completion notifications match user settings.",
      threshold: 0,
      maxLength: 80,
      zenModel: "gpt-5-nano",
      mode: "notification",
    })

    expect(result.summarized).toBe(false)
    expect(result.reason).toBe("Model summarization provider unavailable")
    expect(result.summary).toBe("The implementation now correctly loads notification templates before dispatchin…")
  })

  it("returns local note fallback while provider is unavailable", async () => {
    const result = await summarizeText({
      text: "First sentence. Second sentence with the useful insight.",
      threshold: 0,
      maxLength: 100,
      mode: "note",
    })

    expect(result).toMatchObject({
      summary: "First sentence.",
      summarized: false,
      reason: "Model summarization provider unavailable",
    })
  })
})
