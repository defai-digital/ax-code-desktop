import { describe, expect, it, vi } from "vitest"

import { createNotificationTemplateRuntime, withTimeout } from "./template-runtime.js"

const createRuntime = (settings = {}, overrides = {}) =>
  createNotificationTemplateRuntime({
    readSettingsFromDisk: async () => settings,
    persistSettings: vi.fn(async () => {}),
    buildAxCodeUrl: (path) => path,
    getAxCodeAuthHeaders: () => ({}),
    resolveGitBinaryForSpawn: () => "git",
    ...overrides,
  })

describe("notification template runtime zen models", () => {
  it("returns no selectable zen models after provider retirement", async () => {
    const runtime = createRuntime()
    const models = await runtime.fetchFreeZenModels()

    expect(models).toEqual([])
  })

  it("preserves stored zen model value for compatibility without validation", async () => {
    const runtime = createRuntime({ zenModel: "trinity-large-preview-free" })

    await expect(runtime.resolveZenModel()).resolves.toBe("trinity-large-preview-free")
  })

  it("trims zen model overrides and settings values", async () => {
    const runtime = createRuntime({ zenModel: " trinity-large-preview-free " })

    await expect(runtime.resolveZenModel()).resolves.toBe("trinity-large-preview-free")
    await expect(runtime.resolveZenModel(" gpt-5-mini ")).resolves.toBe("gpt-5-mini")
  })
})

describe("notification template text extraction", () => {
  it("extracts, joins, trims, and truncates text parts", () => {
    const runtime = createRuntime()

    expect(
      runtime.extractTextFromParts(
        [
          { type: "tool", text: "" },
          { type: "text", text: " First line " },
          { content: "Second line" },
          { type: "image", content: "" },
        ],
        20,
      ),
    ).toBe("First line \nSecond l")
  })

  it("falls back to legacy message content arrays", () => {
    const runtime = createRuntime()

    expect(
      runtime.extractLastMessageText(
        {
          properties: {
            info: {
              content: [{ type: "text", text: "Alpha" }, { type: "image" }, { text: "Beta" }],
            },
          },
        },
        100,
      ),
    ).toBe("Alpha\nBeta")
  })
})

describe("notification template variables", () => {
  it("requires non-empty last message text for last-message templates", () => {
    const runtime = createRuntime()

    expect(
      runtime.shouldApplyResolvedTemplateMessage("{last_message}", "Resolved", {
        last_message: "   ",
      }),
    ).toBe(false)
    expect(
      runtime.shouldApplyResolvedTemplateMessage("{last_message}", "Resolved", {
        last_message: " Done ",
      }),
    ).toBe(true)
  })

  it("formats agent and model labels from payload metadata", async () => {
    const runtime = createRuntime()

    await expect(
      runtime.buildTemplateVariables(
        {
          properties: {
            info: {
              agent: "debug-agent",
              modelID: "gpt-5-mini",
            },
          },
        },
        "ses_test",
      ),
    ).resolves.toMatchObject({
      agent_name: "Debug Agent",
      model_name: "Gpt 5 Mini",
      session_id: "ses_test",
    })
  })

  it("formats numeric model version pairs consistently", async () => {
    const runtime = createRuntime()

    await expect(
      runtime.buildTemplateVariables(
        {
          properties: {
            info: {
              modelID: "glm-5-1-air",
            },
          },
        },
        "ses_test",
      ),
    ).resolves.toMatchObject({
      model_name: "Glm 5.1 Air",
    })
  })

  it("falls back to default agent and model labels", async () => {
    const runtime = createRuntime()

    await expect(runtime.buildTemplateVariables({ properties: { info: {} } }, "")).resolves.toMatchObject({
      agent_name: "Agent",
      model_name: "Assistant",
    })
  })

  it("trims active project labels from settings", async () => {
    const runtime = createRuntime({
      activeProjectId: "project-one",
      projects: [{ id: "project-one", label: " Work App ", path: "" }],
    })

    await expect(runtime.buildTemplateVariables({ properties: { info: {} } }, "")).resolves.toMatchObject({
      project_name: "Work App",
    })
  })
})

describe("notification template git deadline", () => {
  it("resolves with the raced value and leaves no pending timer", async () => {
    vi.useFakeTimers()
    try {
      await expect(withTimeout(Promise.resolve("main"), 3000, "git timeout")).resolves.toBe("main")
      // A bare Promise.race keeps this timer alive for up to the deadline, which holds the event
      // loop open while the process is shutting down.
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("rejects at the deadline and clears its own timer", async () => {
    vi.useFakeTimers()
    try {
      const pending = withTimeout(new Promise(() => {}), 3000, "git timeout")
      const assertion = expect(pending).rejects.toThrow("git timeout")
      await vi.advanceTimersByTimeAsync(3000)
      await assertion
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("branch resolution", () => {
  it("kills a hung git child when its timeout fires instead of leaving a zombie", async () => {
    // The previous implementation raced a simple-git promise, so the child it spawned
    // kept running past the timeout; on a hung worktree mount every notification would
    // leak one git process.
    const fs = await import("node:fs")
    const os = await import("node:os")
    const path = await import("node:path")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-stub-"))
    const stub = path.join(dir, "git")
    const pidFile = path.join(dir, "pid")
    fs.writeFileSync(stub, `#!/bin/sh\necho $$ > ${pidFile}\nsleep 60\n`, { mode: 0o755 })

    const runtime = createRuntime({}, { resolveGitBinaryForSpawn: () => stub })
    const startedAt = Date.now()
    const variables = await runtime.buildTemplateVariables(
      { properties: { info: { path: { root: dir } } } },
      "ses_x",
    )

    expect(Date.now() - startedAt).toBeLessThan(30_000)
    expect(variables.branch).toBe("")

    // The point of the timeout: the child must be dead, not merely abandoned.
    const pid = Number(fs.readFileSync(pidFile, "utf8").trim())
    expect(Number.isFinite(pid)).toBe(true)
    expect(() => process.kill(pid, 0)).toThrow()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
