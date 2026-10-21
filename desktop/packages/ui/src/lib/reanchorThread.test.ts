import { describe, expect, test } from "vitest"
import { reanchorThread } from "./reanchorThread"

describe("reanchorThread", () => {
  test("finds a moved multiline snippet instead of trusting the original line", () => {
    expect(reanchorThread("first()\nsecond()", "header\n\nfirst()\nsecond()\nfooter", 1)).toEqual({
      status: "anchored",
      startLine: 3,
      endLine: 4,
    })
  })
  test("accepts whitespace edits, including line wrapping, and maps back to current lines", () => {
    expect(reanchorThread("call(a, b)", "header\n  call(\n a,\n b)\n", 1)).toEqual({
      status: "anchored",
      startLine: 2,
      endLine: 4,
    })
  })
  test("prefers an exact match over whitespace-only alternatives", () => {
    expect(reanchorThread("a = 1", "a=1\na = 1", 1)).toEqual({ status: "anchored", startLine: 2, endLine: 2 })
  })
  test.each([
    ["edited", "value = 1", "value = 2"],
    ["duplicated at the original location", "value = 1", "value = 1\nvalue = 1"],
    ["duplicated after whitespace edits", "value = 1", "value=1\nvalue  =  1"],
    ["deleted", "value = 1", ""],
    ["empty", "", "content"],
    ["blank", " \n ", " \n "],
  ])("marks %s snippets outdated", (_name, snippet, content) => {
    expect(reanchorThread(snippet, content, 1)).toEqual({ status: "outdated", originalStartLine: 1 })
  })

  test("anchors an LF snippet in CRLF content exactly, even where whitespace-blind matching is ambiguous", () => {
    const lf = 'const a = "a b"\nconst b = 1\n\nconst a = "ab"\nconst b = 1\n'
    const crlf = lf.replace(/\n/g, "\r\n")
    const snippet = 'const a = "a b"\nconst b = 1'
    expect(reanchorThread(snippet, lf, 1)).toEqual({ status: "anchored", startLine: 1, endLine: 2 })
    expect(reanchorThread(snippet, crlf, 1)).toEqual({ status: "anchored", startLine: 1, endLine: 2 })
    expect(reanchorThread(snippet.replace(/\n/g, "\r\n"), lf, 1)).toEqual({ status: "anchored", startLine: 1, endLine: 2 })
  })
})
