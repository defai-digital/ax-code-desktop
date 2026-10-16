import { describe, expect, test } from "vitest"

import {
  filesViewPathsEqual,
  getFilesViewDisplayPath,
  isFilesViewEntryName,
  isFilesViewPathWithinRoot,
  normalizeFilesViewPath,
} from "./filesViewPathUtils"

describe("filesViewPathUtils", () => {
  test("normalizes Windows separators and drive roots", () => {
    expect(normalizeFilesViewPath("C:\\Users\\Alice\\Project\\")).toBe("C:/Users/Alice/Project")
    expect(normalizeFilesViewPath("C:\\")).toBe("C:/")
  })

  test("matches Windows drive paths case-insensitively", () => {
    expect(isFilesViewPathWithinRoot("C:/Users/Alice/Project/src/app.ts", "c:/users/alice/project")).toBe(true)
  })

  test("compares Windows root keys case-insensitively", () => {
    expect(filesViewPathsEqual("C:/Users/Alice/Project", "c:/users/alice/project")).toBe(true)
  })

  test("keeps POSIX root checks case-sensitive", () => {
    expect(isFilesViewPathWithinRoot("/Users/Alice/Project/src/app.ts", "/users/alice/project")).toBe(false)
  })

  test("returns relative display paths for Windows roots with different case", () => {
    expect(getFilesViewDisplayPath("c:/users/alice/project", "C:/Users/Alice/Project/src/app.ts")).toBe("src/app.ts")
  })

  test("returns relative display paths under a Windows drive root", () => {
    expect(getFilesViewDisplayPath("C:/", "c:/Users/Alice/Project/src/app.ts")).toBe("Users/Alice/Project/src/app.ts")
  })

  test("returns dot for the root path itself", () => {
    expect(getFilesViewDisplayPath("C:/Users/Alice/Project", "c:/users/alice/project")).toBe(".")
  })

  test("slices relative paths by the original root length when lowercasing expands characters", () => {
    expect(getFilesViewDisplayPath("C:/DİJİTAL", "C:/DİJİTAL/readme.md")).toBe("readme.md")
  })
})

describe("isFilesViewEntryName", () => {
  test("accepts a single name", () => {
    expect(isFilesViewEntryName("notes.txt")).toBe(true)
    expect(isFilesViewEntryName("  spaced name.md  ")).toBe(true)
    expect(isFilesViewEntryName("测试.md")).toBe(true)
  })

  test("rejects a name that would move the operation out of the directory", () => {
    // The dialog joins the name onto the folder it is scoped to, so a separator or a `..` segment
    // wrote (or renamed) somewhere else — out of that folder, and with enough of them out of the
    // project, while every containment check here is a string-prefix matcher and still said "inside".
    expect(isFilesViewEntryName("../evil.txt")).toBe(false)
    expect(isFilesViewEntryName("a/b.txt")).toBe(false)
    expect(isFilesViewEntryName("a\\b.txt")).toBe(false)
    expect(isFilesViewEntryName("..")).toBe(false)
    expect(isFilesViewEntryName(".")).toBe(false)
    expect(isFilesViewEntryName("   ")).toBe(false)
  })
})
