import os from "node:os"
import { afterEach, describe, expect, test, vi } from "vitest"
import { displayPath, mentionsPath, pathForms, uiPath } from "./paths.mjs"

afterEach(() => vi.restoreAllMocks())

describe("journey path matching", () => {
  test("a Windows temp directory matches the app's normalized and home-abbreviated spellings", () => {
    vi.spyOn(os, "homedir").mockReturnValue("C:\\Users\\runneradmin")
    const directory = "C:\\Users\\runneradmin\\AppData\\Local\\Temp\\ax-code-desktop-e2e-Q3avEZ\\project"
    expect(uiPath(directory)).toBe("C:/Users/runneradmin/AppData/Local/Temp/ax-code-desktop-e2e-Q3avEZ/project")
    expect(pathForms(directory)).toEqual([directory, uiPath(directory)])
    expect(mentionsPath(`Open — Shared project · ${uiPath(directory)} · Review the result`, directory)).toBe(true)
    expect(mentionsPath("~/AppData/Local/Temp/ax-code-desktop-e2e-Q3avEZ/project", directory)).toBe(
      displayPath(directory).startsWith("~/") || process.platform !== "win32",
    )
    expect(mentionsPath("~/AppData/Local/Temp/ax-code-desktop-e2e-Q3avEZ/other-project", directory)).toBe(false)
  })

  test("POSIX paths are unchanged", () => {
    expect(uiPath("/private/var/folders/x/project")).toBe("/private/var/folders/x/project")
    expect(pathForms("/tmp/project")).toEqual(["/tmp/project"])
    expect(mentionsPath("Open — /tmp/project", "/tmp/project")).toBe(true)
  })
})
