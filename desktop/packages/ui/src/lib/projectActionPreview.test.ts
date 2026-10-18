import { describe, expect, test } from "vitest"
import { isSupportedPosixShell, readyProjectActionUrl } from "./projectActionPreview"

describe("generic project preview", () => {
  test("requires a known shell instead of guessing a quoting dialect", () => {
    for (const shell of ["/bin/bash", "/usr/bin/zsh", "sh"]) expect(isSupportedPosixShell(shell)).toBe(true)
    for (const shell of ["", "cmd.exe", "pwsh", "/bin/fish", "/bin/sh -c", "evilsh"])
      expect(isSupportedPosixShell(shell)).toBe(false)
  })

  test("only a startup line for the configured origin opens preview", () => {
    const expected = "http://127.0.0.1:8501/"
    expect(readyProjectActionUrl("  URL: http://127.0.0.1:8501\n", expected)).toBe(expected)
    expect(readyProjectActionUrl("\u001b[32m Local URL: http://127.0.0.1:8501/\u001b[0m\n", expected)).toBe(expected)
    expect(readyProjectActionUrl("python 'http://127.0.0.1:8501/app.py'", expected)).toBeNull()
    expect(readyProjectActionUrl("Port 8501 is already in use", expected)).toBeNull()
    expect(readyProjectActionUrl("URL: http://127.0.0.1:9999/", expected)).toBeNull()
    expect(readyProjectActionUrl("URL: http://user:secret@127.0.0.1:8501/", expected)).toBeNull()
  })
})
