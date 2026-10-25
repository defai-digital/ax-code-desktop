import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildShadowReleaseEvidence, parseArgs } from "./shadow-release-evidence.mjs"

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function artifactDirectory(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ax-coder-shadow-evidence-"))
  temporaryDirectories.push(directory)
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), content)
  return directory
}

describe("shadow release evidence", () => {
  it("maps CLI artifact and cleanliness arguments to the evidence API", () => {
    expect(
      parseArgs([
        "--target",
        "darwin-arm64",
        "--signing-mode",
        "unsigned",
        "--signing-status",
        "not-requested",
        "--artifact-dir",
        "/artifacts",
        "--passed",
        "package",
        "--require-clean",
        "--out",
        "/evidence.json",
      ]),
    ).toEqual({
      target: "darwin-arm64",
      signingMode: "unsigned",
      signingStatus: "not-requested",
      artifactDirectory: "/artifacts",
      passedChecks: ["package"],
      requireClean: true,
      out: "/evidence.json",
    })
  })

  it("records immutable inputs without copying environment secrets", () => {
    const directory = artifactDirectory({ "AX-Code-7.10.2-mac-arm64.dmg": "candidate" })
    const evidence = buildShadowReleaseEvidence({
      target: "darwin-arm64",
      signingMode: "unsigned",
      signingStatus: "not-requested",
      passedChecks: [
        "frozen-install",
        "package",
        "artifact-audit",
        "runtime-integrity",
        "packaged-app-smoke",
        "asar-smoke",
      ],
      artifactDirectory: directory,
      environment: {
        GITHUB_REPOSITORY: "defai-digital/ax-coder",
        GITHUB_SHA: "f".repeat(40),
        GITHUB_RUN_ID: "42",
        AX_CODE_DESKTOP_MINISIGN_PASSWORD: "must-not-appear",
      },
      createdAt: "2026-09-02T00:00:00.000Z",
    })

    expect(evidence).toMatchObject({
      schema: "ax-coder.desktop-shadow-evidence.v1",
      source: { repository: "defai-digital/ax-coder", commit: "f".repeat(40) },
      target: "darwin-arm64",
      publication: { electronBuilderMode: "never", publicReleaseEnabled: false },
      versions: { desktop: "7.29.2", sdk: "2.6.51", runtime: "7.29.4" },
    })
    expect(JSON.stringify(evidence)).not.toContain("must-not-appear")
    expect(evidence.artifacts[0]).toMatchObject({
      name: "AX-Code-7.10.2-mac-arm64.dmg",
      size: 9,
    })
  })

  it("requires complete Minisign coverage in required mode", () => {
    const directory = artifactDirectory({ "AX-Code-7.10.2-linux-x64.AppImage": "candidate" })
    const options = {
      target: "linux-x64",
      signingMode: "required",
      signingStatus: "verified",
      passedChecks: ["frozen-install", "package", "artifact-audit", "runtime-integrity", "asar-smoke", "minisign"],
      artifactDirectory: directory,
      environment: { GITHUB_SHA: "e".repeat(40) },
    }
    expect(() => buildShadowReleaseEvidence(options)).toThrow("missing Minisign signature")
    fs.writeFileSync(path.join(directory, "AX-Code-7.10.2-linux-x64.AppImage.minisig"), "signature")
    expect(() => buildShadowReleaseEvidence(options)).not.toThrow()
  })

  it("records preflight without an artifact directory", () => {
    const evidence = buildShadowReleaseEvidence({
      target: "preflight",
      signingMode: "unsigned",
      signingStatus: "not-applicable",
      passedChecks: ["frozen-install", "boundaries", "release-contract", "typecheck", "lint", "tests", "build"],
      environment: { GITHUB_SHA: "d".repeat(40) },
    })
    expect(evidence.artifacts).toEqual([])
    expect(evidence.inputs.runtime.artifact).toBeNull()
  })
})
