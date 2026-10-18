// @vitest-environment node
import { afterEach, describe, expect, test } from "vitest"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { createStreamlitProjectAction, isSupportedRecipeShell, readyProjectActionUrl } from "./streamlitProjectAction"

const paths: string[] = []
afterEach(() => {
  for (const dir of paths.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const input = { id: "streamlit", name: "Start Streamlit", interpreter: "python", entrypoint: "app.py", port: "8501" }

describe("Streamlit project action", () => {
  test.each(["/bin/sh", "/bin/bash", "/bin/zsh"].filter(existsSync))("round trips literal argv through %s", (shell) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ax-streamlit-argv-"))
    paths.push(dir)
    const interpreter = path.join(dir, "python ' ; $(touch INJECTED)")
    const entrypoint = "folder with spaces/app ' ; $(touch INJECTED) 雪.py"
    const output = path.join(dir, "argv")
    writeFileSync(interpreter, '#!/bin/sh\nprintf "%s\\0" "$@" > "$AX_ARGV_OUTPUT"\n', { mode: 0o700 })
    const action = createStreamlitProjectAction({ ...input, interpreter, entrypoint })!
    execFileSync(shell, ["-c", action.command], { cwd: dir, env: { ...process.env, AX_ARGV_OUTPUT: output } })
    expect(readFileSync(output, "utf8").split("\0").slice(0, -1)).toEqual([
      "-m",
      "streamlit",
      "run",
      entrypoint,
      "--server.address=127.0.0.1",
      "--server.port=8501",
      "--server.headless=true",
    ])
    expect(existsSync(path.join(dir, "INJECTED"))).toBe(false)
    expect(action.waitForUrl).toBe(true)
    expect(action.shell).toBe("posix")
  })

  test.each([
    { interpreter: "python\nrm -rf x" },
    { entrypoint: "app.py\rnext" },
    { entrypoint: "-flag.py" },
    { entrypoint: "" },
    { interpreter: "" },
    { entrypoint: "app.js" },
    { port: "0" },
    { port: "65536" },
    { port: "8501; cmd" },
    { port: "1.5" },
  ])("rejects invalid recipe fields: %j", (patch) => {
    expect(createStreamlitProjectAction({ ...input, ...patch })).toBeNull()
  })

  test("requires a known shell instead of guessing a quoting dialect", () => {
    for (const shell of ["/bin/bash", "/usr/bin/zsh", "sh"]) expect(isSupportedRecipeShell(shell)).toBe(true)
    for (const shell of ["", "cmd.exe", "pwsh", "/bin/fish", "/bin/sh -c", "evilsh"])
      expect(isSupportedRecipeShell(shell)).toBe(false)
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
