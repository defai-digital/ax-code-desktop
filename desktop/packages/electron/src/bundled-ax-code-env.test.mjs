import { createRequire } from "node:module"
import path from "node:path"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const { applyBundledAxCodeEnv, buildBundledAxCodeEnv } = require("./bundled-ax-code-env.js")

const base = {
  platform: "darwin",
  isPackaged: true,
  resourcesPath: "/Applications/AX Code.app/Contents/Resources",
}

describe("bundled ax-code runtime env", () => {
  test("points at the bundled launcher when it is executable", () => {
    const env = buildBundledAxCodeEnv({ ...base, isExecutable: () => true })

    expect(env).toEqual({
      AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY: "/Applications/AX Code.app/Contents/Resources/ax-code/bin/ax-code",
    })
  })

  test("uses the .cmd launcher on Windows (existence-only, no exec bits)", () => {
    const env = buildBundledAxCodeEnv({
      ...base,
      platform: "win32",
      resourcesPath: "C:\\Program Files\\AX Code\\resources",
      exists: () => true,
      isExecutable: () => false,
    })

    // path.join uses host separators; compute the expectation the same way so
    // the assertion holds on POSIX dev machines and Windows CI alike.
    expect(env).toEqual({
      AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY: path.join(
        "C:\\Program Files\\AX Code\\resources",
        "ax-code",
        "bin",
        "ax-code.cmd",
      ),
    })
  })

  test("uses the unix launcher on Linux", () => {
    const env = buildBundledAxCodeEnv({
      ...base,
      platform: "linux",
      resourcesPath: "/opt/AX Code/resources",
      isExecutable: () => true,
    })

    expect(env).toEqual({
      AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY: "/opt/AX Code/resources/ax-code/bin/ax-code",
    })
  })

  test("leaves the env unchanged when the staged tree has only the placeholder", () => {
    expect(buildBundledAxCodeEnv({ ...base, isExecutable: () => false })).toEqual({})
  })

  test("rejects a staged launcher that exists but is not executable", () => {
    expect(buildBundledAxCodeEnv({ ...base, exists: () => true, isExecutable: () => false })).toEqual({})
  })

  test("passes through in development (unpackaged)", () => {
    expect(buildBundledAxCodeEnv({ ...base, isPackaged: false, isExecutable: () => true })).toEqual({})
  })
})

describe("applyBundledAxCodeEnv", () => {
  test("sets the bundled launcher when one was staged", () => {
    const env = applyBundledAxCodeEnv(
      { PATH: "/usr/bin" },
      { AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY: "/app/ax-code/bin/ax-code" },
      { platform: "linux", arch: "x64" },
    )

    expect(env).toEqual({
      PATH: "/usr/bin",
      AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY: "/app/ax-code/bin/ax-code",
    })
  })

  test("strips an inherited AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY when nothing was staged", () => {
    const env = applyBundledAxCodeEnv(
      { PATH: "/usr/bin", AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY: "/user/exported/ax-code" },
      {},
    )

    expect(env).toEqual({ PATH: "/usr/bin" })
    expect("AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY" in env).toBe(false)
  })

  test("leaves the env untouched when nothing was staged and nothing was inherited", () => {
    expect(applyBundledAxCodeEnv({ PATH: "/usr/bin" }, {})).toEqual({ PATH: "/usr/bin" })
  })

  test("selects the verified engine release for a packaged Apple Silicon runtime", () => {
    const pin = require("../../../../config/ax-engine-runtime.json")
    const original = { PATH: "/usr/bin" }
    const env = applyBundledAxCodeEnv(
      original,
      { AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY: "/app/ax-code/bin/ax-code" },
      { platform: "darwin", arch: "arm64" },
    )
    expect(env).toMatchObject({
      AX_ENGINE_INSTALL_VERSION: pin.version,
      AX_ENGINE_INSTALL_URL: pin.artifact.url,
      AX_ENGINE_INSTALL_SHA256: pin.artifact.sha256,
      AX_ENGINE_INSTALL_TEAM_ID: pin.appleTeamId,
    })
    expect(original).toEqual({ PATH: "/usr/bin" })
  })

  test("keeps an explicit installer override together without mixing release defaults", () => {
    const env = applyBundledAxCodeEnv(
      { AX_ENGINE_INSTALL_URL: "https://example.test/custom.tar.gz" },
      { AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY: "/app/ax-code/bin/ax-code" },
      { platform: "darwin", arch: "arm64" },
    )
    expect(env.AX_ENGINE_INSTALL_URL).toBe("https://example.test/custom.tar.gz")
    expect(env).not.toHaveProperty("AX_ENGINE_INSTALL_SHA256")
    expect(env).not.toHaveProperty("AX_ENGINE_INSTALL_VERSION")
  })
})
