import { describe, expect, test } from "vitest"

import { filterGitHubItemsByQuery, parseGitHubNumber } from "./githubPickerQuery"

describe("parseGitHubNumber", () => {
  test("parses an issue URL", () => {
    expect(parseGitHubNumber("https://github.com/acme/repo/issues/7", "issues")).toBe(7)
  })

  test("parses a pull request URL", () => {
    expect(parseGitHubNumber("https://github.com/acme/repo/pull/3", "pull")).toBe(3)
  })

  test("parses a hash-prefixed number", () => {
    expect(parseGitHubNumber("#7", "issues")).toBe(7)
  })

  test("parses a bare number", () => {
    expect(parseGitHubNumber("7", "issues")).toBe(7)
  })

  test("returns null for empty input", () => {
    expect(parseGitHubNumber("", "issues")).toBeNull()
  })

  test("returns null for non-numeric input", () => {
    expect(parseGitHubNumber("abc", "issues")).toBeNull()
  })

  test("returns null for zero", () => {
    expect(parseGitHubNumber("0", "issues")).toBeNull()
  })

  test("returns null for a URL of another kind", () => {
    expect(parseGitHubNumber("https://github.com/acme/repo/pull/3", "issues")).toBeNull()
    expect(parseGitHubNumber("https://github.com/acme/repo/issues/7", "pull")).toBeNull()
  })
})

describe("filterGitHubItemsByQuery", () => {
  const items = [
    { number: 7, title: "Fix project picker" },
    { number: 12, title: "Improve login flow" },
  ]

  test("returns the same array reference for an empty query", () => {
    expect(filterGitHubItemsByQuery(items, "")).toBe(items)
    expect(filterGitHubItemsByQuery(items, "   ")).toBe(items)
  })

  test("matches a number with and without a leading hash", () => {
    expect(filterGitHubItemsByQuery(items, "7")).toEqual([items[0]])
    expect(filterGitHubItemsByQuery(items, "#7")).toEqual([items[0]])
  })

  test("matches a title substring case-insensitively", () => {
    expect(filterGitHubItemsByQuery(items, "LOGIN")).toEqual([items[1]])
  })

  test("returns an empty array when nothing matches", () => {
    expect(filterGitHubItemsByQuery(items, "no-such-item")).toEqual([])
  })
})
