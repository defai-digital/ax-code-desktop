import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildShadowReleaseSummary, RELEASE_TARGETS } from "./shadow-release-summary.mjs"

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function evidenceDirectory(overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ax-coder-shadow-summary-"))
  temporaryDirectories.push(directory)
  for (const target of RELEASE_TARGETS) {
    const record = {
      schema: "ax-coder.desktop-shadow-evidence.v1",
      target,
      source: { commit: "a".repeat(40), workingTree: "clean" },
      publication: { publicReleaseEnabled: false, electronBuilderMode: "never" },
      signing: { mode: "unsigned", status: "not-requested" },
      versions: { desktop: "7.10.2", sdk: "2.2.0", runtime: "7.10.2" },
      artifacts: [{ name: `${target}.zip`, size: 1, sha256: "b".repeat(64) }],
      ...(overrides[target] ?? {}),
    }
    fs.writeFileSync(path.join(directory, `${target}.json`), `${JSON.stringify(record, null, 2)}\n`)
  }
  return directory
}

describe("shadow release summary", () => {
  it("binds all release targets to one source and version set", () => {
    const summary = buildShadowReleaseSummary({ evidenceDirectory: evidenceDirectory() })
    expect(summary).toMatchObject({
      sourceCommit: "a".repeat(40),
      desktopVersion: "7.10.2",
      sdkVersion: "2.2.0",
      runtimeVersion: "7.10.2",
      signingMode: "unsigned",
      publicReleaseEnabled: false,
      targets: RELEASE_TARGETS,
    })
    expect(summary.evidenceSetSha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it("rejects target drift", () => {
    const directory = evidenceDirectory({
      "linux-arm64": { source: { commit: "c".repeat(40), workingTree: "clean" } },
    })
    expect(() => buildShadowReleaseSummary({ evidenceDirectory: directory })).toThrow("target commits do not match")
  })

  it("rejects a target that enables release publication", () => {
    const directory = evidenceDirectory({
      web: { publication: { publicReleaseEnabled: true, electronBuilderMode: "never" } },
    })
    expect(() => buildShadowReleaseSummary({ evidenceDirectory: directory })).toThrow("web enabled public release")
  })
})
