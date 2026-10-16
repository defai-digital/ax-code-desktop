import { describe, expect, it, vi } from "vitest"

import { readRuntimeAgentNames } from "./runtime-agent-list.js"

const buildAxCodeUrl = (path, prefix = "") => `http://127.0.0.1:4096${prefix}${path}`

const respond = (payload, ok = true) => ({ ok, status: ok ? 200 : 401, json: async () => payload })

describe("readRuntimeAgentNames", () => {
  it("reads the names the runtime lists for a directory", async () => {
    const fetchImpl = vi.fn(async () => respond([{ name: "build" }, { id: "plan" }, { name: "" }]))

    const names = await readRuntimeAgentNames({
      directory: "/repo",
      buildAxCodeUrl,
      getAxCodeAuthHeaders: () => ({ authorization: "Basic t" }),
      fetchImpl,
    })

    expect([...names]).toEqual(["build", "plan"])
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe("http://127.0.0.1:4096/agent?directory=%2Frepo")
    expect(init.headers).toEqual({ authorization: "Basic t" })
  })

  it("accepts the wrapped payload shape", async () => {
    const fetchImpl = vi.fn(async () => respond({ data: [{ name: "build" }] }))

    await expect(readRuntimeAgentNames({ buildAxCodeUrl, fetchImpl })).resolves.toEqual(new Set(["build"]))
  })

  it("refuses to answer when the runtime does", async () => {
    // An unreachable runtime must not read as "no such agent": a real built-in agent would be
    // reported as not found.
    const fetchImpl = vi.fn(async () => respond({}, false))

    await expect(readRuntimeAgentNames({ buildAxCodeUrl, fetchImpl })).rejects.toThrow("The runtime answered 401")
  })

  it("refuses to answer when the request fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch failed")
    })

    await expect(readRuntimeAgentNames({ buildAxCodeUrl, fetchImpl })).rejects.toThrow("fetch failed")
  })
})
