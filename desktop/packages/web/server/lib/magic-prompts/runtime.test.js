import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createMagicPromptRuntime } from "./runtime.js"

describe("magic prompt runtime", () => {
  let tempDir

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ax-code-magic-prompts-"))
  })

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  const createRuntime = (fsPromises = fs) =>
    createMagicPromptRuntime({
      fsPromises,
      filePath: path.join(tempDir, "magic-prompts.json"),
    })

  const stateFile = () => path.join(tempDir, "magic-prompts.json")

  it.each(['{ "overrides": { "a.visible": "keep me" ', '["original"]', '{"overrides":["original"]}'])(
    "preserves a damaged state file on ordinary edits",
    async (unfinished) => {
      const runtime = createRuntime()
      await fs.writeFile(stateFile(), unfinished, "utf8")
      await expect(runtime.setOverride("assistant.visible", "x")).rejects.toThrow(/corrupted/i)
      expect(await fs.readFile(stateFile(), "utf8")).toBe(unfinished)
    },
  )

  it("keeps the stored overrides when a write is interrupted", async () => {
    // The state file was written in place, so an interrupted write (a killed process, a full disk) left partial
    // JSON that every later read refused as corrupted — and the only in-app recovery from there drops every
    // override. The write goes to a temp file and is renamed into place.
    const runtime = createRuntime()
    await runtime.setOverride("assistant.visible", "keep me")

    const failing = createRuntime({
      ...fs,
      async open(...args) {
        const file = await fs.open(...args)
        return {
          async writeFile() {
            await file.writeFile("{")
            throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" })
          },
          close: () => file.close(),
        }
      },
    })
    await expect(failing.setOverride("assistant.visible", "next")).rejects.toThrow(/ENOSPC/)

    expect(JSON.parse(await fs.readFile(stateFile(), "utf8"))).toMatchObject({
      overrides: { "assistant.visible": "keep me" },
    })
    // Nothing of the failed write is left next to the state file.
    expect(await fs.readdir(tempDir)).toEqual(["magic-prompts.json"])
  })

  it("clears a state file it cannot parse instead of refusing", async () => {
    // Reset-all is the one operation whose purpose is to replace the file, so the read that refuses a
    // corrupt one must not block it: otherwise a truncated file left the app with no way to recover.
    const runtime = createRuntime()
    await fs.writeFile(stateFile(), '{ "overrides": { "a.visible": ', "utf8")

    await expect(runtime.resetAllOverrides()).resolves.toMatchObject({ overrides: {} })

    const written = JSON.parse(await fs.readFile(stateFile(), "utf8"))
    expect(written).toMatchObject({ version: 1, overrides: {} })
  })

  it("normalizes prompt ids consistently when setting and resetting overrides", async () => {
    const runtime = createRuntime()

    await runtime.setOverride(" assistant.visible ", "Use concise replies")
    expect(await runtime.readPromptState()).toMatchObject({
      overrides: {
        "assistant.visible": "Use concise replies",
      },
    })

    await runtime.resetOverride(" assistant.visible ")
    expect(await runtime.readPromptState()).toMatchObject({
      overrides: {},
    })
  })

  it("serializes override state as a plain object", async () => {
    const runtime = createRuntime()

    await runtime.setOverride("assistant.visible", "Use concise replies")

    const stored = JSON.parse(await fs.readFile(stateFile(), "utf8"))
    expect(stored).toEqual({
      version: 1,
      overrides: {
        "assistant.visible": "Use concise replies",
      },
    })
    await expect(runtime.readPromptState()).resolves.toEqual(stored)
  })

  it("preserves concurrent override updates", async () => {
    const runtime = createRuntime()

    await Promise.all([
      runtime.setOverride("assistant.visible", "Use concise replies"),
      runtime.setOverride("review.visible", "Review for regressions"),
    ])

    await expect(runtime.readPromptState()).resolves.toEqual({
      version: 1,
      overrides: {
        "assistant.visible": "Use concise replies",
        "review.visible": "Review for regressions",
      },
    })
  })
})
