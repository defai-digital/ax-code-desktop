import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { EVIDENCE_TARGETS } from "./shadow-release-evidence.mjs"

export const RELEASE_TARGETS = EVIDENCE_TARGETS.filter((target) => target !== "preflight")

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid shadow release summary: ${message}`)
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

export function buildShadowReleaseSummary({ evidenceDirectory, fileSystem = fs }) {
  const evidence = RELEASE_TARGETS.map((target) => {
    const file = path.join(evidenceDirectory, `${target}.json`)
    assert(fileSystem.existsSync(file), `missing ${target} evidence`)
    const source = fileSystem.readFileSync(file, "utf8")
    const record = JSON.parse(source)
    assert(record?.schema === "ax-coder.desktop-shadow-evidence.v1", `${target} has an unsupported schema`)
    assert(record.target === target, `${target} evidence has target ${String(record.target)}`)
    assert(record.source?.workingTree === "clean", `${target} evidence was not generated from a clean worktree`)
    assert(record.publication?.publicReleaseEnabled === false, `${target} enabled public release`)
    assert(record.publication?.electronBuilderMode === "never", `${target} did not use publish=never`)
    assert(Array.isArray(record.artifacts) && record.artifacts.length > 0, `${target} has no artifacts`)
    return { file: `${target}.json`, sha256: digest(source), record }
  })

  const commits = new Set(evidence.map(({ record }) => record.source?.commit))
  const versions = new Set(evidence.map(({ record }) => record.versions?.desktop))
  const runtimeVersions = new Set(evidence.map(({ record }) => record.versions?.runtime))
  const sdkVersions = new Set(evidence.map(({ record }) => record.versions?.sdk))
  const signingModes = new Set(evidence.map(({ record }) => record.signing?.mode))
  assert(commits.size === 1 && !commits.has(undefined), "target commits do not match")
  assert(versions.size === 1 && !versions.has(undefined), "Desktop versions do not match")
  assert(runtimeVersions.size === 1 && !runtimeVersions.has(undefined), "runtime versions do not match")
  assert(sdkVersions.size === 1 && !sdkVersions.has(undefined), "SDK versions do not match")
  assert(signingModes.size === 1 && !signingModes.has(undefined), "signing modes do not match")

  const mode = [...signingModes][0]
  for (const { record } of evidence) {
    const expectedStatus = mode === "required" ? "verified" : "not-requested"
    assert(record.signing.status === expectedStatus, `${record.target} signing status is not ${expectedStatus}`)
  }

  const files = evidence.map(({ file, sha256 }) => ({ file, sha256 }))
  return {
    schema: "ax-coder.desktop-shadow-summary.v1",
    sourceCommit: [...commits][0],
    desktopVersion: [...versions][0],
    sdkVersion: [...sdkVersions][0],
    runtimeVersion: [...runtimeVersions][0],
    signingMode: mode,
    publicReleaseEnabled: false,
    targets: RELEASE_TARGETS,
    evidence: files,
    evidenceSetSha256: digest(files.map((item) => `${item.file}\0${item.sha256}\n`).join("")),
  }
}

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!["--evidence-dir", "--out"].includes(arg)) throw new Error(`unknown argument ${arg}`)
    const value = argv[++index]
    if (!value) throw new Error(`${arg} requires a value`)
    result[arg === "--out" ? "out" : "evidenceDirectory"] = value
  }
  return result
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2))
    assert(args.evidenceDirectory, "--evidence-dir is required")
    assert(args.out, "--out is required")
    const summary = buildShadowReleaseSummary({ evidenceDirectory: path.resolve(args.evidenceDirectory) })
    const output = path.resolve(args.out)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`)
    console.log(`Verified ${summary.targets.length} shadow targets and wrote ${output}.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
