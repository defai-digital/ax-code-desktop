import { describe, expect, it } from "vitest"
import { patchTargetsDeclaredPath } from "./patch-validation.js"

const patch = (preImage, postImage) => `--- ${preImage}\n+++ ${postImage}\n@@ -1 +1 @@\n-old\n+new\n`

describe("single-file patch validation", () => {
  it.each([
    ["a/file.txt", "b/file.txt"],
    ["/dev/null", "b/file.txt"],
    ["a/file.txt", "/dev/null"],
  ])("accepts declared images %s -> %s", (preImage, postImage) => {
    expect(patchTargetsDeclaredPath(patch(preImage, postImage), "file.txt")).toBe(true)
  })

  it.each([
    ["a/other.txt", "b/file.txt"],
    ["a/file.txt", "b/other.txt"],
    ["/dev/null", "/dev/null"],
    ["a/other.txt", "/dev/null"],
  ])("rejects undeclared images %s -> %s", (preImage, postImage) => {
    expect(patchTargetsDeclaredPath(patch(preImage, postImage), "file.txt")).toBe(false)
  })

  it("preserves literal whitespace before the header's tab separator", () => {
    const text = patch("a/ file.txt \t", "b/ file.txt \t")
    expect(patchTargetsDeclaredPath(text, " file.txt ")).toBe(true)
    expect(patchTargetsDeclaredPath(text, " file.txt")).toBe(false)
  })

  it.each([
    ['"a/caf\\303\\251.txt"', '"b/caf\\303\\251.txt"', "café.txt"],
    ['"a/emoji😀\\n.txt"', '"b/emoji😀\\n.txt"', "emoji😀\n.txt"],
    ['"a/quote\\\"name.txt"', '"b/quote\\\"name.txt"', 'quote"name.txt'],
  ])("decodes Git-quoted image %s", (preImage, postImage, path) => {
    expect(patchTargetsDeclaredPath(patch(preImage, postImage), path)).toBe(true)
  })

  it.each([
    '"b/file.txt\\"',
    '"b/file.txt',
    '"b/file\\q.txt"',
    '"b/file\\377.txt"',
    '"b/file\\000.txt"',
    '"b/file\\777.txt"',
  ])("refuses malformed or non-Unicode header %s without throwing", (postImage) => {
    expect(patchTargetsDeclaredPath(patch("a/file.txt", postImage), "file.txt")).toBe(false)
  })

  it("does not equate invalid UTF-8 with a replacement-character filename", () => {
    expect(patchTargetsDeclaredPath(patch('"a/file\\377.txt"', '"b/file\\377.txt"'), "file�.txt")).toBe(false)
  })

  it("rejects another file's header-only section", () => {
    const text =
      patch("a/file.txt", "b/file.txt") +
      "diff --git a/other.txt b/moved.txt\nsimilarity index 100%\nrename from other.txt\nrename to moved.txt\n"
    expect(patchTargetsDeclaredPath(text, "file.txt")).toBe(false)
  })

  it("distinguishes header-like hunk content from another file section", () => {
    const text = "--- a/file.txt\n+++ b/file.txt\n@@ -1,2 +1,2 @@\n context\n--- old\n+++ new\n"
    expect(patchTargetsDeclaredPath(text, "file.txt")).toBe(true)
    expect(patchTargetsDeclaredPath(text + patch("a/other.txt", "b/other.txt"), "file.txt")).toBe(false)
  })
})
