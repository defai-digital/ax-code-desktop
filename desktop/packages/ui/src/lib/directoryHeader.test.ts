import { describe, expect, test } from "vitest"

import { encodeDirectoryHeader } from "./directoryHeader"

describe("encodeDirectoryHeader", () => {
  test("keeps a pure-ASCII path unchanged", () => {
    expect(encodeDirectoryHeader("/work/alpha")).toBe("/work/alpha")
  })

  test("encodes a CJK path and round-trips through decodeURIComponent", () => {
    const encoded = encodeDirectoryHeader("/Users/a/项目")
    expect(encoded).toBe(encodeURIComponent("/Users/a/项目"))
    expect(decodeURIComponent(encoded)).toBe("/Users/a/项目")
  })

  test("encodes a literal % so it survives decoding", () => {
    const encoded = encodeDirectoryHeader("/a/x%41y")
    expect(encoded).toBe(encodeURIComponent("/a/x%41y"))
    expect(decodeURIComponent(encoded)).toBe("/a/x%41y")
  })

  test("emits a value Headers accepts for a non-ASCII path", () => {
    const headers = new Headers({ "x-ax-code-directory": encodeDirectoryHeader("/Users/a/项目") })
    expect(headers.get("x-ax-code-directory")).toBe(encodeURIComponent("/Users/a/项目"))
  })
})
