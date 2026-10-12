import { describe, expect, it, vi } from "vitest"
import { configureNotaryProfile, resolveNotaryMode } from "./apple-notary-credentials.mjs"

const appleId = {
  APPLE_TEAM_ID: "N5ZUZDUJS6",
  APPLE_ID: "release@example.com",
  APPLE_APP_SPECIFIC_PASSWORD: "fixture-password",
}
const api = {
  APPLE_TEAM_ID: "N5ZUZDUJS6",
  APPLE_API_ISSUER: "fixture-issuer",
  APPLE_API_KEY_ID: "fixture-key",
  APPLE_API_KEY_B64: Buffer.from("-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----").toString("base64"),
}
const runner = { RUNNER_TEMP: "/tmp/runner", GITHUB_ENV: "/tmp/runner/env" }
function dependencies(status = 0) {
  return { run: vi.fn(() => ({ status })), write: vi.fn(), append: vi.fn(), remove: vi.fn() }
}
describe("Apple notarization credential selection", () => {
  it("accepts Apple ID credentials despite an incomplete legacy API configuration", () => {
    expect(resolveNotaryMode({ ...appleId, APPLE_API_ISSUER: "legacy-issuer" })).toBe("apple-id")
    expect(resolveNotaryMode(api)).toBe("api")
    expect(resolveNotaryMode({ ...appleId, ...api })).toBe("api")
  })
  it("rejects missing credentials, a different team, and multiline credentials", () => {
    for (const env of [
      { APPLE_TEAM_ID: "N5ZUZDUJS6" },
      { ...appleId, APPLE_TEAM_ID: "OTHER" },
      { ...appleId, APPLE_APP_SPECIFIC_PASSWORD: "fixture\ninjected" },
    ])
      expect(() => resolveNotaryMode(env)).toThrow()
  })
  it("validates Apple ID through stdin and exports only Keychain metadata", () => {
    const deps = dependencies()
    expect(configureNotaryProfile({ ...appleId, ...runner }, deps)).toBe("apple-id")
    const [command, args, options] = deps.run.mock.calls[0]
    expect(command).toBe("xcrun")
    expect(args).toContain("store-credentials")
    expect(args).not.toContain("--password")
    expect(args).not.toContain(appleId.APPLE_APP_SPECIFIC_PASSWORD)
    expect(options.input).toBe(`${appleId.APPLE_APP_SPECIFIC_PASSWORD}\n`)
    expect(deps.append.mock.calls[0][1]).toBe(
      "APPLE_KEYCHAIN_PROFILE=desktop-shadow-notary\nAPPLE_KEYCHAIN=/tmp/runner/electron-signing.keychain-db\n",
    )
    expect(deps.write).not.toHaveBeenCalled()
  })
  it("removes the temporary API key after validating the Keychain profile", () => {
    const deps = dependencies()
    configureNotaryProfile({ ...api, ...runner }, deps)
    expect(deps.write.mock.calls[0][2]).toEqual({ mode: 0o600 })
    expect(deps.remove).toHaveBeenCalledWith("/tmp/runner/desktop-notary-api-key.p8", { force: true })
  })
  it("fails closed without exporting metadata or secret diagnostics on validation failure", () => {
    const deps = dependencies(1)
    expect(() => configureNotaryProfile({ ...api, ...runner }, deps)).toThrow("credential validation failed")
    expect(deps.append).not.toHaveBeenCalled()
    expect(deps.remove).toHaveBeenCalledOnce()
  })
})
