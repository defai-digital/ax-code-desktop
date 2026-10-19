import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  assertPackagePublishingMode,
  assertPublicReleaseAuthorized,
  readReleasePolicy,
  repositoryRoot,
} from "./release-policy.mjs"

describe("Desktop release policy", () => {
  it("records authorized independent public cutover", () => {
    const policy = readReleasePolicy(repositoryRoot)
    expect(policy.stage).toBe("cutover-approved")
    expect(policy.publicRelease).toMatchObject({ enabled: true, repository: "defai-digital/ax-code-desktop" })
    expect(policy.shadow).toMatchObject({ artifactChannel: "github-actions", signingMode: "explicit-only" })
    expect(policy.cutover).toMatchObject({ repository: "defai-digital/ax-code-desktop", tagPrefix: "v" })
  })

  it("requires the recorded cutover block at cutover-approved stage", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-policy-"))
    try {
      const policy = JSON.parse(
        fs.readFileSync(path.join(repositoryRoot, "config/desktop-release-policy.json"), "utf8"),
      )
      delete policy.cutover
      fs.mkdirSync(path.join(directory, "config"), { recursive: true })
      fs.writeFileSync(path.join(directory, "config/desktop-release-policy.json"), JSON.stringify(policy))
      expect(() => readReleasePolicy(directory)).toThrow(
        "cutover-approved stage requires the recorded cutover block",
      )
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it("rejects a null cutover block and non-list evidence", () => {
    const readPolicyWith = (mutate) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-policy-"))
      try {
        const policy = JSON.parse(
          fs.readFileSync(path.join(repositoryRoot, "config/desktop-release-policy.json"), "utf8"),
        )
        mutate(policy)
        fs.mkdirSync(path.join(directory, "config"), { recursive: true })
        fs.writeFileSync(path.join(directory, "config/desktop-release-policy.json"), JSON.stringify(policy))
        return readReleasePolicy(directory)
      } finally {
        fs.rmSync(directory, { recursive: true, force: true })
      }
    }

    expect(() =>
      readPolicyWith((policy) => {
        policy.cutover = null
      }),
    ).toThrow("cutover-approved stage requires the recorded cutover block")
    expect(() =>
      readPolicyWith((policy) => {
        policy.cutover.requiredEvidence = "signed-shadow"
      }),
    ).toThrow("cutover.requiredEvidence must be a list")
  })

  it("requires an explicit publish-never argument while shadow-only", () => {
    const policy = { ...readReleasePolicy(repositoryRoot), stage: "shadow-only", publicRelease: { enabled: false } }
    expect(() => assertPackagePublishingMode(["--mac", "--arm64", "--publish=never"], policy)).not.toThrow()
    expect(() => assertPackagePublishingMode(["--linux", "--publish", "never"], policy)).not.toThrow()
    expect(() => assertPackagePublishingMode(["--mac"], policy)).toThrow("requires exactly one --publish=never")
    expect(() => assertPackagePublishingMode(["--publish=always"], policy)).toThrow("requires exactly one")
    expect(() => assertPackagePublishingMode(["-p", "onTagOrDraft"], policy)).toThrow("requires exactly one")
  })

  it("blocks the legacy public release entrypoint", () => {
    expect(() =>
      assertPublicReleaseAuthorized({
        ...readReleasePolicy(repositoryRoot),
        stage: "shadow-only",
        publicRelease: { enabled: false },
      }),
    ).toThrow("AX Code Desktop public release is disabled")
  })

  it("keeps the package wrapper and legacy publisher behind policy checks", () => {
    const packageWrapper = fs.readFileSync(
      path.join(repositoryRoot, "desktop/packages/electron/scripts/package.mjs"),
      "utf8",
    )
    const legacyPublisher = fs.readFileSync(
      path.join(repositoryRoot, "desktop/scripts/publish-github-release.sh"),
      "utf8",
    )
    expect(packageWrapper).toContain("assertPackagePublishingMode(args)")
    expect(legacyPublisher).toContain("script/release-policy.mjs assert-public")
  })
})
