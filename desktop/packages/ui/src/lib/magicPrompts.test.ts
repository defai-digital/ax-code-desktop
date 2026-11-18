import { afterEach, expect, test, vi } from "vitest"
import { API_ENDPOINTS, HTTP_DEFAULTS } from "./http"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

test("prompt rendering still reads stored legacy overrides after editor API retirement", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          overrides: {
            "git.commit.generate": "Custom visible {{branch}}\nCustom instructions {{branch}}",
          },
        }),
      ),
  )
  vi.stubGlobal("fetch", fetch)
  const { renderMagicPrompt } = await import("./magicPrompts")
  expect(await renderMagicPrompt("git.commit.generate.visible", { branch: "main" })).toBe("Custom visible main")
  expect(await renderMagicPrompt("git.commit.generate.instructions", { branch: "main" })).toBe(
    "Custom instructions main",
  )
  expect(fetch).toHaveBeenCalledExactlyOnceWith(API_ENDPOINTS.magicPrompts, {
    method: HTTP_DEFAULTS.method.get,
    headers: HTTP_DEFAULTS.headers.acceptJson,
  })
})

test("explicit split overrides win over the corresponding legacy key", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            overrides: {
              "git.commit.generate": "Legacy visible\nLegacy instructions",
              "git.commit.generate.visible": "Split visible",
            },
          }),
        ),
    ),
  )
  const { renderMagicPrompt } = await import("./magicPrompts")
  expect(await renderMagicPrompt("git.commit.generate.visible")).toBe("Split visible")
  expect(await renderMagicPrompt("git.commit.generate.instructions")).toBe("Legacy instructions")
})

test.each(["http", "network", "malformed"])(
  "unavailable %s overrides retain built-in prompt rendering",
  async (failure) => {
    const fetch = vi.fn(async () => {
      if (failure === "network") throw new Error("offline")
      return new Response(failure === "malformed" ? "null" : "{}", { status: failure === "http" ? 503 : 200 })
    })
    vi.stubGlobal("fetch", fetch)
    const { renderMagicPrompt } = await import("./magicPrompts")
    const visible = await renderMagicPrompt("git.commit.generate.visible")
    expect(visible.trim().length).toBeGreaterThan(0)
    expect(visible).not.toContain("undefined")
    expect(fetch).toHaveBeenCalledTimes(1)
  },
)
