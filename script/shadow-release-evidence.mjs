import crypto from "node:crypto"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { verifyDesktopReleaseContract, repositoryRoot } from "./desktop-release-contract.mjs"

export const EVIDENCE_TARGETS = ["preflight", "web", "darwin-arm64", "win32-x64", "linux-x64", "linux-arm64"]

const REQUIRED_CHECKS = {
  preflight: ["frozen-install", "boundaries", "release-contract", "typecheck", "lint", "tests", "build"],
  web: ["frozen-install", "package", "artifact-audit", "web-build", "web-pack"],
  "darwin-arm64": [
    "frozen-install",
    "package",
    "artifact-audit",
    "runtime-integrity",
    "packaged-app-smoke",
    "asar-smoke",
  ],
  "win32-x64": ["frozen-install", "package", "artifact-audit", "runtime-integrity", "asar-smoke"],
  "linux-x64": ["frozen-install", "package", "artifact-audit", "runtime-integrity", "asar-smoke"],
  "linux-arm64": ["frozen-install", "package", "artifact-audit", "runtime-integrity", "asar-smoke"],
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid shadow release evidence: ${message}`)
}

function sha256File(file, fileSystem = fs) {
  return crypto.createHash("sha256").update(fileSystem.readFileSync(file)).digest("hex")
}

function toolVersion(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" })
  return result.status === 0 ? String(result.stdout).trim() : "unavailable"
}

function gitCommit(root) {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
}

function workingTreeState(root) {
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()
  return status ? "dirty" : "clean"
}

function artifactRecords(directory, fileSystem = fs) {
  const records = []
  for (const name of fileSystem.readdirSync(directory).sort()) {
    const file = path.join(directory, name)
    const stat = fileSystem.lstatSync(file)
    assert(stat.isFile() && !stat.isSymbolicLink(), `${name} must be a regular file`)
    records.push({ name, size: stat.size, sha256: sha256File(file, fileSystem) })
  }
  return records
}

function verifySignatureCoverage(artifacts) {
  const names = new Set(artifacts.map((artifact) => artifact.name))
  const unsigned = artifacts.filter((artifact) => !artifact.name.endsWith(".minisig"))
  assert(unsigned.length > 0, "signed evidence has no release artifacts")
  for (const artifact of unsigned) {
    assert(names.has(`${artifact.name}.minisig`), `missing Minisign signature for ${artifact.name}`)
  }
}

export function buildShadowReleaseEvidence({
  target,
  signingMode,
  signingStatus,
  passedChecks,
  artifactDirectory,
  root = repositoryRoot,
  environment = process.env,
  fileSystem = fs,
  createdAt = new Date().toISOString(),
  requireClean = false,
}) {
  assert(EVIDENCE_TARGETS.includes(target), `unsupported target ${String(target)}`)
  assert(["unsigned", "required"].includes(signingMode), "signingMode must be unsigned or required")
  assert(Array.isArray(passedChecks) && passedChecks.length > 0, "at least one passed check is required")
  assert(new Set(passedChecks).size === passedChecks.length, "passed checks must be unique")
  const passed = new Set(passedChecks)
  for (const check of REQUIRED_CHECKS[target]) assert(passed.has(check), `${target} is missing required check ${check}`)

  const preflight = target === "preflight"
  const expectedSigningStatus = preflight ? "not-applicable" : signingMode === "required" ? "verified" : "not-requested"
  assert(signingStatus === expectedSigningStatus, `signingStatus must be ${expectedSigningStatus}`)
  if (!preflight && signingMode === "required") {
    assert(passed.has("minisign"), `${target} is missing required check minisign`)
    if (target === "darwin-arm64") {
      assert(passed.has("platform-signature"), "darwin-arm64 is missing required check platform-signature")
      assert(passed.has("notarization"), "darwin-arm64 is missing required check notarization")
    }
    if (target.startsWith("win32-"))
      assert(passed.has("authenticode"), `${target} is missing required check authenticode`)
  }

  const contract = verifyDesktopReleaseContract(root, fileSystem)
  const treeState = workingTreeState(root)
  if (requireClean) assert(treeState === "clean", "release evidence requires a clean Git worktree")
  const artifacts = preflight ? [] : artifactRecords(path.resolve(artifactDirectory), fileSystem)
  if (!preflight) assert(artifacts.length > 0, "artifact directory is empty")
  if (!preflight && signingMode === "required") verifySignatureCoverage(artifacts)
  if (!preflight && signingMode === "unsigned") {
    assert(!artifacts.some((artifact) => artifact.name.endsWith(".minisig")), "unsigned mode contains a signature")
  }

  const runtimeTarget =
    target === "darwin-arm64"
      ? "darwin-arm64"
      : target.startsWith("win32-") || target.startsWith("linux-")
        ? target
        : null
  const selectedRuntime = runtimeTarget ? contract.runtime.artifacts[runtimeTarget] : null
  const sourceMapping = path.join(root, contract.identity.sourceExtraction.mapping)
  const sourceCommit = environment.GITHUB_SHA || gitCommit(root)
  assert(/^[a-f0-9]{40}$/.test(sourceCommit), "source commit must be a full lowercase Git object ID")

  return {
    schema: "ax-coder.desktop-shadow-evidence.v1",
    createdAt,
    source: {
      repository: environment.GITHUB_REPOSITORY || "local",
      commit: sourceCommit,
      workingTree: treeState,
      extraction: {
        ...contract.identity.sourceExtraction,
        mappingSha256: sha256File(sourceMapping, fileSystem),
      },
    },
    workflow: {
      name: "desktop-shadow",
      runId: environment.GITHUB_RUN_ID || null,
      runAttempt: environment.GITHUB_RUN_ATTEMPT || null,
      ref: environment.GITHUB_REF || null,
      event: environment.GITHUB_EVENT_NAME || "local",
    },
    target,
    publication: {
      electronBuilderMode: "never",
      publicReleaseEnabled: false,
      channel: contract.policy.shadow.artifactChannel,
      retentionDays: contract.policy.shadow.retentionDays,
    },
    signing: {
      mode: signingMode,
      status: signingStatus,
      minisignKeyId: contract.runtime.minisign.keyId,
      appleTeamId: target === "darwin-arm64" ? contract.identity.signing.appleTeamId : null,
      windowsCertificateSha1: target.startsWith("win32-") ? contract.identity.signing.windowsCertificateSha1 : null,
    },
    versions: {
      desktop: contract.manifests.root.version,
      sdk: contract.sdk.version,
      runtime: contract.runtime.version,
    },
    inputs: {
      lockfileSha256: contract.lockfile.sha256,
      sdk: {
        specifier: contract.sdk.specifier,
        producerRepository: contract.sdk.producerRepository,
        producerCommit: contract.sdk.producerCommit,
      },
      runtime: {
        repository: contract.runtime.repository,
        releaseTag: contract.runtime.releaseTag,
        artifact: selectedRuntime,
      },
    },
    identity: {
      productName: contract.identity.productName,
      applicationId: contract.identity.applicationId,
      artifactName: contract.identity.artifactName,
      rendererOrigin: contract.identity.rendererOrigin,
      updater: contract.identity.updater,
      packages: contract.identity.packages,
    },
    toolchain: {
      node: process.version,
      pnpm: toolVersion("pnpm", ["--version"]),
    },
    passedChecks,
    artifacts,
  }
}

export function parseArgs(argv) {
  const result = { passedChecks: [], requireClean: false }
  const propertyByArgument = {
    "--target": "target",
    "--signing-mode": "signingMode",
    "--signing-status": "signingStatus",
    "--artifact-dir": "artifactDirectory",
    "--out": "out",
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--require-clean") {
      result.requireClean = true
      continue
    }
    const value = argv[++index]
    if (!value) throw new Error(`${arg} requires a value`)
    if (arg === "--passed") result.passedChecks.push(value)
    else if (propertyByArgument[arg]) result[propertyByArgument[arg]] = value
    else {
      throw new Error(`unknown argument ${arg}`)
    }
  }
  return result
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2))
    assert(args.out, "--out is required")
    const evidence = buildShadowReleaseEvidence(args)
    const output = path.resolve(args.out)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(`Wrote ${args.target} shadow evidence to ${output}.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
