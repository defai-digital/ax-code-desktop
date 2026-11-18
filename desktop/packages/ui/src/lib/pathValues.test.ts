import { describe, expect, test } from "vitest"
import { normalizeProjectPath, projectPathIsInsideRoot } from "./projectResolution"
import { expandHomePath, normalizePathSeparators, readDirectoryPath, readPathOutput } from "./pathValues"
import { createProjectIdFromPath } from "./projectId"

describe("literal path values", () => {
  test.each([
    ["/workspace/repo", "/workspace/repo"],
    ["/workspace/repo ", "/workspace/repo "],
    [" /workspace/repo", " /workspace/repo"],
    [" C:\\Repo\\ ", " C:\\Repo\\ "],
    ["/workspace/a\\b", "/workspace/a\\b"],
    ["c:\\Repo\\", "C:/Repo"],
    ["c:\\", "C:/"],
    ["\\\\server\\share\\repo ", "//server/share/repo "],
    ["/", "/"],
    ["///", "/"],
  ])("preserves canonical identity for %j", (input, expected) => {
    expect(normalizeProjectPath(input)).toBe(expected)
    expect(createProjectIdFromPath(input)).toBe(`path_${btoa(expected).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`)
  })
  test("keeps absence validation separate from literal names and Windows relative separators", () => {
    expect(readDirectoryPath("  ")).toBeNull()
    expect(readDirectoryPath("/repo ")).toBe("/repo ")
    expect(normalizePathSeparators("a\\b", "/repo")).toBe("a\\b")
    expect(normalizePathSeparators("a\\b", "C:/repo")).toBe("a/b")
    expect(expandHomePath("~/repo ", "/home/user ")).toBe("/home/user /repo ")
    expect(expandHomePath(" ~/repo ", "/home/user")).toBe(" ~/repo ")
    expect(expandHomePath("~\\sub\\file", "C:\\Users\\Bob")).toBe("C:/Users/Bob/sub/file")
    expect(projectPathIsInsideRoot("/repo /../repo/secret", "/repo ")).toBe(false)
    expect(projectPathIsInsideRoot("//server/share/../../outside", "//server/share")).toBe(true)
  })
  test("removes only output framing, retaining embedded LF and trailing POSIX CR", () => {
    expect(readPathOutput("/repo \n")).toBe("/repo ")
    expect(readPathOutput("/repo\nline\n")).toBe("/repo\nline")
    expect(readPathOutput("/repo\r\n", "linux")).toBe("/repo\r")
    expect(readPathOutput("C:/repo \r\n", "win32")).toBe("C:/repo ")
  })
})
