import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { verifyDesktopReleaseContract } from "./desktop-release-contract.mjs"

export const SIGNING_SECRETS = [
  "APPLE_API_ISSUER",
  "APPLE_API_KEY_B64",
  "APPLE_API_KEY_ID",
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_TEAM_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_TENANT_ID",
  "AX_CODE_DESKTOP_MINISIGN_PASSWORD",
  "AX_CODE_DESKTOP_MINISIGN_SECRET_KEY_B64",
]

// Readiness never grants release authority, changes repository visibility, or
// exports credentials. Platform signatures and migration evidence remain gates.
export function releaseReadiness({
  contract,
  commit,
  dirty,
  remoteTag,
  releases = [],
  secrets = [],
  runs = [],
  visibility,
  verifiedEvidence = [],
}) {
  const target = contract.policy.cutover ?? contract.policy.publicRelease
  const version = contract.manifests.root.version
  const tag = `${target.tagPrefix}${version}`
  const blockers = []
  const add = (code, detail) => blockers.push({ code, detail })
  const missingEvidence = [
    "signed-shadow",
    "upgrade",
    "rollback",
    "data-and-credential-continuity",
    "human-approval",
  ].filter((gate) => !verifiedEvidence.includes(gate))
  if (missingEvidence.length) add("missing-release-evidence", missingEvidence.join(", "))
  if (dirty) add("dirty-worktree", "Commit the candidate before release.")
  if (contract.manifests.electron.devDependencies.electron.includes("-"))
    add("prerelease-electron", "Public Desktop releases require stable Electron.")
  if (remoteTag) add("existing-tag", `${tag} already exists; use a new version instead of overwriting it.`)
  if (releases.some((release) => release.tagName === tag))
    add("existing-release", `${tag} is already published or drafted.`)
  const missing = SIGNING_SECRETS.filter((name) => !secrets.includes(name))
  if (missing.length) add("missing-signing-secrets", missing.join(", "))
  for (const workflow of ["Desktop CI", "CodeQL"])
    if (!runs.some((run) => run.headSha === commit && run.workflowName === workflow && run.conclusion === "success"))
      add("exact-source-ci", `${workflow} must pass on ${commit}.`)
  if (visibility !== "PUBLIC")
    add(
      "private-update-feed",
      "An unauthenticated installed app cannot read private GitHub releases; public distribution requires an approved public channel.",
    )
  if (contract.policy.stage !== "cutover-approved" || !contract.policy.publicRelease.enabled)
    add(
      "cutover-pending",
      "Signed shadow, upgrade, rollback, data/credential continuity, and human approval remain required.",
    )
  if (
    contract.identity.updater.repository !== target.repository ||
    contract.identity.updater.tagPrefix !== target.tagPrefix
  )
    add("updater-cutover-pending", "Switch the active updater only after continuity and rollback gates pass.")
  return {
    schema: "ax-coder.desktop-release-readiness.v1",
    repository: target.repository,
    version,
    tag,
    commit,
    runtimeVersion: contract.runtime.version,
    sdkVersion: contract.sdk.version,
    ready: blockers.length === 0,
    missingSigningSecrets: missing,
    blockers,
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const args = process.argv.slice(2).filter((arg) => arg !== "--")
    if (args.some((arg) => !["--offline", "--json"].includes(arg)))
      throw new Error("usage: desktop-release-preflight.mjs [--offline] [--json]")
    const contract = verifyDesktopReleaseContract()
    const repository = (contract.policy.cutover ?? contract.policy.publicRelease).repository
    const git = (...argv) => execFileSync("git", argv, { encoding: "utf8" }).trim()
    const gh = (...argv) =>
      JSON.parse(execFileSync("gh", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }))
    const commit = git("rev-parse", "HEAD")
    const online = !args.includes("--offline")
    const tag = `${(contract.policy.cutover ?? contract.policy.publicRelease).tagPrefix}${contract.manifests.root.version}`
    const report = releaseReadiness({
      contract,
      commit,
      dirty: Boolean(git("status", "--porcelain")),
      remoteTag: online ? git("ls-remote", `https://github.com/${repository}.git`, `refs/tags/${tag}`) : "",
      releases: online ? gh("release", "list", "--repo", repository, "--limit", "100", "--json", "tagName") : [],
      secrets: online ? gh("secret", "list", "--repo", repository, "--json", "name").map((item) => item.name) : [],
      runs: online
        ? gh(
            "run",
            "list",
            "--repo",
            repository,
            "--commit",
            commit,
            "--limit",
            "30",
            "--json",
            "headSha,workflowName,conclusion",
          )
        : [],
      visibility: online ? gh("repo", "view", repository, "--json", "visibility").visibility : undefined,
    })
    console.log(JSON.stringify({ ...report, inspection: online ? "live" : "offline-incomplete" }, null, 2))
    if (!report.ready) process.exitCode = 1
  } catch (error) {
    // Avoid printing subprocess environments or arbitrary response bodies.
    console.error(
      error.stderr ? "Release inspection failed; verify GitHub authentication and repository access." : error.message,
    )
    process.exitCode = 1
  }
}
