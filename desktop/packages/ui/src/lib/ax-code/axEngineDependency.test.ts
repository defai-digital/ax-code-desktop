import { describe, expect, test } from "vitest"
import { axEngineMissingDetails, canOfferAxEngineInstall, describeAxEngineDependency } from "./axEngineDependency"

const missingBlocker = [
  "AX_ENGINE_BINARY_MISSING: ax-engine was not found. It is only needed for local models; cloud providers work without it.",
  "Install it with `brew install defai-digital/tap/ax-engine`, `ax-code providers ax-engine install`,",
  "Check with `ax-code providers ax-engine status`.",
].join("\n")

describe("describeAxEngineDependency", () => {
  test("shows version and source for a managed install", () => {
    const view = describeAxEngineDependency({
      available: true,
      mode: "managed",
      binaryPath: "/Users/dev/.cache/ax-code/ax-engine/bin/7.7.0/ax-engine",
      version: "7.7.0",
      managedVersion: "7.7.0",
      installable: false,
      blockers: [],
      warnings: [],
    })
    expect(view.summary).toBe("v7.7.0 · Installed by AX Code")
    expect(view.path).toContain("/ax-engine/bin/7.7.0/")
    expect(view.warnings).toEqual([])
    expect(view.updateHint).toBeNull()
  })

  test("surfaces a PATH warning without the error code and says who updates it", () => {
    const view = describeAxEngineDependency({
      available: true,
      mode: "path",
      binaryPath: "/opt/homebrew/bin/ax-engine",
      version: "7.6.0",
      installable: false,
      blockers: [],
      warnings: ["AX_ENGINE_VERSION_UNSUPPORTED: PATH ax-engine 7.6.0 is older than the bundled 7.7.0 runtime"],
    })
    expect(view.summary).toBe("v7.6.0 · From PATH")
    expect(view.warnings).toEqual(["PATH ax-engine 7.6.0 is older than the bundled 7.7.0 runtime"])
    expect(view.updateHint).toContain("Update it the same way you installed it")
  })

  test("shows no update hint for a current PATH copy", () => {
    const view = describeAxEngineDependency({
      available: true,
      mode: "path",
      binaryPath: "/opt/homebrew/bin/ax-engine",
      version: "7.7.0",
      blockers: [],
    })
    expect(view.updateHint).toBeNull()
    expect(view.warnings).toEqual([])
  })

  test("explains a broken configured binary that blocks every other copy", () => {
    const view = describeAxEngineDependency({
      available: false,
      mode: "configured",
      binaryPath: "/custom/ax-engine",
      installable: false,
      blockers: ["AX_ENGINE_BINARY_MISSING: configured ax-engine binary is not executable"],
    })
    expect(view.summary).toBe("configured ax-engine binary is not executable · /custom/ax-engine")
    expect(view.updateHint).toContain("binaryPath or AX_ENGINE_BIN")
  })

  test("labels a legacy bundled engine", () => {
    expect(
      describeAxEngineDependency({ available: true, mode: "bundled", version: "7.5.7", blockers: [] }).summary,
    ).toBe("v7.5.7 · Legacy bundled")
  })

  test("uses the first line of the missing blocker and keeps the rest as details", () => {
    const dependency = { available: false, mode: "missing", installable: true, blockers: [missingBlocker] }
    expect(describeAxEngineDependency(dependency).summary).toBe(
      "ax-engine was not found. It is only needed for local models; cloud providers work without it.",
    )
    expect(axEngineMissingDetails(dependency)).toEqual([
      "Install it with `brew install defai-digital/tap/ax-engine`, `ax-code providers ax-engine install`,",
      "Check with `ax-code providers ax-engine status`.",
    ])
    expect(axEngineMissingDetails({ ...dependency, available: true })).toEqual([])
  })

  test("reports checking before data arrives", () => {
    expect(describeAxEngineDependency(null).summary).toBe("Checking")
  })
})

describe("canOfferAxEngineInstall", () => {
  const data = {
    dependency: { available: false, mode: "missing", installable: true, blockers: [missingBlocker] },
    eligibility: { supported: true, platform: "darwin", arch: "arm64", blockers: [], warnings: [] },
  }

  test("offers install only for a missing, installable engine on a supported host in local mode", () => {
    expect(canOfferAxEngineInstall(data, "managed")).toBe(true)
    expect(canOfferAxEngineInstall(data, undefined)).toBe(true)
    expect(canOfferAxEngineInstall(data, "attach")).toBe(false)
    expect(canOfferAxEngineInstall({ ...data, eligibility: { ...data.eligibility, supported: false } }, "managed")).toBe(
      false,
    )
    expect(
      canOfferAxEngineInstall({ ...data, dependency: { ...data.dependency, installable: false } }, "managed"),
    ).toBe(false)
    expect(
      canOfferAxEngineInstall(
        { ...data, dependency: { available: true, mode: "path", installable: false, blockers: [] } },
        "managed",
      ),
    ).toBe(false)
    expect(canOfferAxEngineInstall(null, "managed")).toBe(false)
  })
})
