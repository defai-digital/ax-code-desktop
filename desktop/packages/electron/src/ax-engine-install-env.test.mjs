import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const { applyAxEngineInstallEnv, validateAxEnginePin } = require("./ax-engine-install-env.js")
const pin = require("../../../../config/ax-engine-runtime.json")

describe("AX Engine managed installer selection", () => {
  test("leaves development and unsupported hosts unchanged", () => {
    for (const options of [
      { enabled: false, platform: "darwin", arch: "arm64" },
      { enabled: true, platform: "darwin", arch: "x64" },
      { enabled: true, platform: "linux", arch: "arm64" },
      { enabled: true, platform: "win32", arch: "x64" },
    ]) expect(applyAxEngineInstallEnv({ PATH: "/usr/bin" }, options)).toEqual({ PATH: "/usr/bin" })
  })

  test.each([
    "AX_ENGINE_INSTALL_URL", "AX_ENGINE_INSTALL_VERSION", "AX_ENGINE_INSTALL_SHA256", "AX_ENGINE_INSTALL_TEAM_ID",
  ])("preserves an explicit %s without filling unrelated installer values", (key) => {
    const env = { PATH: "/usr/bin", [key]: "" }
    expect(applyAxEngineInstallEnv(env, { enabled: true, platform: "darwin", arch: "arm64" })).toEqual(env)
  })

  test("keeps configured binary selection and unrelated environment entries", () => {
    const env = { AX_ENGINE_BIN: "/custom/ax-engine", PATH: "/usr/bin" }
    expect(applyAxEngineInstallEnv(env, { enabled: true, platform: "darwin", arch: "arm64" })).toMatchObject(env)
  })

  test.each([
    { ...pin, version: "latest" },
    { ...pin, releaseTag: "v8.0.0" },
    { ...pin, repository: "other/engine" },
    { ...pin, artifact: { ...pin.artifact, url: "https://example.test/engine.tar.gz" } },
    { ...pin, artifact: { ...pin.artifact, sha256: "invalid" } },
    { ...pin, artifact: { ...pin.artifact, signatureSize: 0 } },
    { ...pin, appleTeamId: "UNTRUSTED0" },
    { ...pin, artifact: null },
  ])("rejects an invalid release pin", (value) => {
    expect(() => validateAxEnginePin(value)).toThrow("Invalid AX Engine runtime pin")
  })
})
