import { describe, expect, test } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sanitizeStreamlitRecipe, streamlitProgress, streamlitRunCommand } from "./streamlitRecipe"

describe("managed Streamlit execution", () => {
  test("invalid configuration emits an actionable error instead of leaving preparation stuck", async () => {
    const dir = mkdtempSync(join(tmpdir(), "streamlit-config-"))
    writeFileSync(join(dir, "app.py"), "import streamlit as st\n")
    mkdirSync(join(dir, ".streamlit"))
    writeFileSync(join(dir, ".streamlit/config.toml"), 'server = "invalid table"\n')
    try {
      const command = await streamlitRunCommand({ version: 1, entrypoint: "app.py" }, "invalid-config")
      let output = ""
      try {
        execFileSync("/bin/sh", ["-c", command], { cwd: dir, encoding: "utf8" })
      } catch (error) {
        output = (error as { stdout: string }).stdout
      }
      expect(streamlitProgress(output, "invalid-config")).toContainEqual(
        expect.objectContaining({ stage: "failed", code: "config" }),
      )
      expect(existsSync(join(dir, ".venv"))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  test("a missing environment requests setup without creating files or executing shell substitutions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "streamlit-run-"))
    const entrypoint = "app ' $(touch injected).py"
    writeFileSync(join(dir, entrypoint), "import streamlit as st\n")
    try {
      const command = await streamlitRunCommand({ version: 1, entrypoint }, "test-token")
      const output = execFileSync("/bin/sh", ["-c", command], { cwd: dir, encoding: "utf8", timeout: 15000 })
      expect(streamlitProgress(output, "test-token")).toContainEqual(
        expect.objectContaining({ stage: "setup-required", source: "simple" }),
      )
      expect(existsSync(join(dir, ".venv"))).toBe(false)
      expect(existsSync(join(dir, "injected"))).toBe(false)
      expect(Math.max(...command.split("\n").map((line) => line.length))).toBeLessThan(4096)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("rejects invalid paths and ports and ignores echoed, unrelated or nonlocal progress", () => {
    expect(sanitizeStreamlitRecipe({ version: 1, entrypoint: "../app.py" })).toBeUndefined()
    expect(sanitizeStreamlitRecipe({ version: 1, entrypoint: "app.py", port: 0 })).toBeUndefined()
    expect(sanitizeStreamlitRecipe({ version: 2, entrypoint: "app.py" })).toBeUndefined()
    const event = (token: string, url: string) =>
      `AX_CODE_STREAMLIT ${JSON.stringify({ token, stage: "launching", url })}\n`
    expect(streamlitProgress(`echo '${event("current", "http://127.0.0.1:9000/")}'`, "current")).toEqual([])
    expect(streamlitProgress(event("old", "http://127.0.0.1:9000/"), "current")).toEqual([])
    expect(streamlitProgress(event("current", "http://example.com:9000/"), "current")).toEqual([])
    expect(streamlitProgress(event("current", "http://127.0.0.1:9000/base/"), "current")).toHaveLength(1)
  })
})
