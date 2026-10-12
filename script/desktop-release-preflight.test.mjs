import { describe, it, expect } from "vitest"
import { releaseReadiness, SIGNING_SECRETS } from "./desktop-release-preflight.mjs"

const commit = "a".repeat(40)
const input = () => ({
  contract: {
    policy: {
      stage: "cutover-approved",
      publicRelease: { enabled: true },
      cutover: { repository: "defai-digital/ax-code-desktop", tagPrefix: "v" },
    },
    manifests: { root: { version: "7.24.5" }, electron: { devDependencies: { electron: "44.7.0" } } },
    identity: { updater: { repository: "defai-digital/ax-code-desktop", tagPrefix: "v" } },
    runtime: { version: "7.24.4" },
    sdk: { version: "2.6.7" },
  },
  commit,
  verifiedEvidence: ["signed-shadow", "upgrade", "rollback", "data-and-credential-continuity", "human-approval"],
  secrets: [...SIGNING_SECRETS],
  visibility: "PUBLIC",
  runs: ["Desktop CI", "CodeQL"].map((workflowName) => ({ workflowName, headSha: commit, conclusion: "success" })),
})

describe("Desktop release preflight", () => {
  it("keeps Desktop and signed runtime versions independent", () => {
    expect(releaseReadiness(input())).toMatchObject({ ready: true, tag: "v7.24.5", runtimeVersion: "7.24.4" })
  })
  it("rejects successes for other source commits", () => {
    const data = input()
    data.runs[0].headSha = "b".repeat(40)
    expect(releaseReadiness(data).blockers).toContainEqual(expect.objectContaining({ code: "exact-source-ci" }))
  })
  it("never treats an existing tag, private feed, or missing signatures as ready", () => {
    const data = input()
    data.remoteTag = commit
    data.visibility = "PRIVATE"
    data.secrets = []
    const report = releaseReadiness(data)
    expect(report.ready).toBe(false)
    expect(report.blockers.map((item) => item.code)).toEqual([
      "existing-tag",
      "unconfirmed-signing-secrets",
      "private-update-feed",
    ])
  })
  it("rejects an existing draft release", () => {
    const data = input()
    data.releases = [{ tagName: "v7.24.5", isDraft: true }]
    expect(releaseReadiness(data).blockers).toContainEqual(expect.objectContaining({ code: "existing-release" }))
  })
  it("preserves the active updater until release cutover", () => {
    const data = input()
    data.contract.policy.stage = "shadow-only"
    data.contract.policy.publicRelease.enabled = false
    data.contract.identity.updater.repository = "defai-digital/ax-code"
    expect(releaseReadiness(data).blockers.map((item) => item.code)).toEqual([
      "cutover-pending",
      "updater-cutover-pending",
    ])
  })

  it("does not infer signed or migration evidence from an enabled policy", () => {
    const data = input()
    data.verifiedEvidence = []
    expect(releaseReadiness(data)).toMatchObject({ ready: false })
    expect(releaseReadiness(data).blockers).toContainEqual(
      expect.objectContaining({ code: "missing-release-evidence" }),
    )
  })
})
