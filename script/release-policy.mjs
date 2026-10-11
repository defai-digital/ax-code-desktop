import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
export const repositoryRoot = path.resolve(scriptDirectory, "..")
export const RELEASE_POLICY_PATH = "config/desktop-release-policy.json"

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Desktop release policy: ${message}`)
}

export function readReleasePolicy(root = repositoryRoot, fileSystem = fs) {
  const policy = JSON.parse(fileSystem.readFileSync(path.join(root, RELEASE_POLICY_PATH), "utf8"))
  assert(policy?.schema === "ax-coder.desktop-release-policy.v1", "unsupported schema")
  assert(["shadow-only", "cutover-approved"].includes(policy.stage), "unsupported stage")
  assert(typeof policy.publicRelease?.enabled === "boolean", "publicRelease.enabled must be boolean")
  assert(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(policy.publicRelease?.repository ?? ""),
    "publicRelease.repository must be owner/name",
  )
  assert(
    typeof policy.publicRelease?.tagPrefix === "string" && policy.publicRelease.tagPrefix.length > 0,
    "publicRelease.tagPrefix is required",
  )
  assert(policy.shadow?.workflow === "desktop-shadow.yml", "shadow.workflow must be desktop-shadow.yml")
  assert(policy.shadow?.artifactChannel === "github-actions", "shadow artifacts must use GitHub Actions")
  assert(
    Number.isSafeInteger(policy.shadow?.retentionDays) &&
      policy.shadow.retentionDays >= 1 &&
      policy.shadow.retentionDays <= 30,
    "shadow.retentionDays must be between 1 and 30",
  )
  assert(policy.shadow?.signingMode === "explicit-only", "shadow.signingMode must be explicit-only")
  if (policy.cutover) {
    assert(policy.cutover.repository === "defai-digital/ax-code-desktop", "independent cutover repository is invalid")
    assert(policy.cutover.tagPrefix === "v", "independent cutover tags must use v")
    assert(
      ["signed-shadow", "upgrade", "rollback", "data-and-credential-continuity", "human-approval"].every(
        (gate) => policy.cutover.requiredEvidence?.includes(gate),
      ),
      "cutover evidence gates are incomplete",
    )
  }
  if (policy.stage === "shadow-only") {
    assert(policy.publicRelease.enabled === false, "public release must remain disabled during shadow-only stage")
  } else {
    assert(policy.publicRelease.enabled === true, "cutover-approved stage requires public release enablement")
  }
  return policy
}

function publishValues(args) {
  const values = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index])
    if (arg === "--publish") {
      values.push(String(args[index + 1] ?? ""))
      index += 1
    } else if (arg.startsWith("--publish=")) {
      values.push(arg.slice("--publish=".length))
    } else if (arg === "-p") {
      values.push(String(args[index + 1] ?? ""))
      index += 1
    }
  }
  return values
}

export function assertPackagePublishingMode(args, policy = readReleasePolicy()) {
  if (policy.stage !== "shadow-only") return policy
  const values = publishValues(args)
  if (values.length !== 1 || values[0] !== "never") {
    throw new Error(
      "AX Coder is shadow-only: packaging requires exactly one --publish=never argument until the paired release cutover is approved",
    )
  }
  return policy
}

export function assertPublicReleaseAuthorized(policy = readReleasePolicy()) {
  if (policy.stage !== "cutover-approved" || policy.publicRelease.enabled !== true) {
    throw new Error(
      `AX Coder public Desktop release is disabled by ${RELEASE_POLICY_PATH}; use the non-public desktop-shadow workflow`,
    )
  }
  return policy
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const [command, ...args] = process.argv.slice(2)
  try {
    if (command === "check") {
      const policy = readReleasePolicy()
      console.log(`Desktop release policy check passed (${policy.stage}).`)
    } else if (command === "assert-package") {
      if (args[0] === "--") args.shift()
      assertPackagePublishingMode(args)
      console.log("Desktop shadow packaging policy passed.")
    } else if (command === "assert-public") {
      assertPublicReleaseAuthorized()
      console.log("Desktop public release policy passed.")
    } else {
      throw new Error("usage: release-policy.mjs check | assert-package [--] <builder args> | assert-public")
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
