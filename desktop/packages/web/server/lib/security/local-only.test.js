import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { isLoopbackHostname, normalizeLoopbackHostname } from "./local-only.js"

describe("loopback hostname normalization", () => {
  it.each([
    [" LOCALHOST. ", "localhost", true],
    ["localhost...", "localhost", true],
    ["127.0.0.1.", "127.0.0.1", true],
    ["[::1]", "::1", true],
    ["localhost.example.", "localhost.example", false],
    ["127.0.0.256", "127.0.0.256", false],
    ["...", "", false],
  ])("normalizes %s without changing the loopback decision", (input, expected, loopback) => {
    expect(normalizeLoopbackHostname(input)).toBe(expected)
    expect(isLoopbackHostname(input)).toBe(loopback)
  })

  it("rejects a long non-loopback hostname without blocking on repeated dots", () => {
    // A non-dot suffix makes an unanchored trailing-dot regex retry at every dot.
    // Bound the real implementation in a child so a regression cannot hang the suite.
    const moduleUrl = new URL("./local-only.js", import.meta.url).href
    const script = `
      import assert from "node:assert/strict";
      import { normalizeLoopbackHostname, isLoopbackHostname } from ${JSON.stringify(moduleUrl)};
      const hostname = ".".repeat(250_000) + "external";
      assert.equal(normalizeLoopbackHostname(hostname), hostname);
      assert.equal(isLoopbackHostname(hostname), false);
    `
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: fileURLToPath(new URL(".", import.meta.url)),
      encoding: "utf8",
      timeout: 2_000,
      killSignal: "SIGKILL",
    })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
  })
})
