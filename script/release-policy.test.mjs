import fs from "node:fs"
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
