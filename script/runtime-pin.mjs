import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
export const repositoryRoot = path.resolve(scriptDir, "..")
export const RUNTIME_PIN_PATH = "config/ax-code-runtime.json"
export const REQUIRED_RUNTIME_TARGETS = ["darwin-arm64", "linux-arm64", "linux-x64", "win32-x64"]

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid AX Code runtime pin: ${message}`)
}

function isSafeRelativePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !path.isAbsolute(value) &&
    value.split(/[\\/]/).every((segment) => segment && segment !== "." && segment !== "..")
  )
}

function validateDigest(value, label) {
  assert(typeof value === "string" && SHA256_PATTERN.test(value), `${label} must be a lowercase SHA-256 digest`)
}

function validateSize(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, `${label} must be a positive safe integer`)
}

export function readRuntimePin(root = repositoryRoot, fileSystem = fs) {
  const pinPath = path.join(root, RUNTIME_PIN_PATH)
  const pin = JSON.parse(fileSystem.readFileSync(pinPath, "utf8"))

  assert(pin?.schema === "ax-coder.ax-code-runtime.v1", "unsupported schema")
  assert(typeof pin.version === "string" && SEMVER_PATTERN.test(pin.version), "version must be SemVer")
  assert(typeof pin.repository === "string" && REPOSITORY_PATTERN.test(pin.repository), "repository must be owner/name")
  assert(pin.releaseTag === `v${pin.version}`, "releaseTag must equal v<version>")
  assert(pin.minisign && typeof pin.minisign === "object", "minisign metadata is required")
  assert(isSafeRelativePath(pin.minisign.publicKey), "minisign.publicKey must be a safe repository-relative path")
  assert(/^[A-F0-9]{16}$/.test(pin.minisign.keyId), "minisign.keyId must be a 16-character uppercase key ID")
  validateSize(pin.minisign.size, "minisign.size")
  validateDigest(pin.minisign.sha256, "minisign.sha256")
  assert(pin.artifacts && typeof pin.artifacts === "object" && !Array.isArray(pin.artifacts), "artifacts are required")

  const artifactKeys = Object.keys(pin.artifacts).sort()
  assert(
    JSON.stringify(artifactKeys) === JSON.stringify([...REQUIRED_RUNTIME_TARGETS].sort()),
    `artifacts must contain exactly ${REQUIRED_RUNTIME_TARGETS.join(", ")}`,
  )

  for (const target of REQUIRED_RUNTIME_TARGETS) {
    const artifact = pin.artifacts[target]
    assert(artifact && typeof artifact === "object", `${target} metadata is required`)
    assert(
      typeof artifact.filename === "string" &&
        artifact.filename === path.basename(artifact.filename) &&
        /^ax-code-[a-z0-9-]+\.(?:zip|tar\.gz)$/.test(artifact.filename),
      `${target}.filename is invalid`,
    )
    validateSize(artifact.size, `${target}.size`)
    validateDigest(artifact.sha256, `${target}.sha256`)
    validateSize(artifact.signatureSize, `${target}.signatureSize`)
    validateDigest(artifact.signatureSha256, `${target}.signatureSha256`)
  }

  return pin
}

export function runtimeTargetKey(platform, arch) {
  const key = `${platform}-${arch}`
  return REQUIRED_RUNTIME_TARGETS.includes(key) ? key : null
}

export function runtimeArtifactForTarget(pin, target) {
  const key = runtimeTargetKey(target.platform, target.arch)
  return key ? pin.artifacts[key] : null
}

export function releaseAssetUrls(pin, artifact) {
  const base = `https://github.com/${pin.repository}/releases/download/${pin.releaseTag}`
  return {
    archiveUrl: `${base}/${artifact.filename}`,
    signatureUrl: `${base}/${artifact.filename}.minisig`,
  }
}

export function sha256File(file, fileSystem = fs) {
  return crypto.createHash("sha256").update(fileSystem.readFileSync(file)).digest("hex")
}

export function verifyPinnedFile(file, expected, label, fileSystem = fs) {
  const actualSize = fileSystem.statSync(file).size
  if (actualSize !== expected.size) {
    throw new Error(`${label} size mismatch: expected ${expected.size}, received ${actualSize}`)
  }
  const actualDigest = sha256File(file, fileSystem)
  if (actualDigest !== expected.sha256) {
    throw new Error(`${label} SHA-256 mismatch: expected ${expected.sha256}, received ${actualDigest}`)
  }
  return { size: actualSize, sha256: actualDigest }
}

export function verifyRuntimePin(root = repositoryRoot, fileSystem = fs) {
  const pin = readRuntimePin(root, fileSystem)
  const publicKeyPath = path.resolve(root, pin.minisign.publicKey)
  const relativeKeyPath = path.relative(root, publicKeyPath)
  assert(
    relativeKeyPath && relativeKeyPath !== ".." && !relativeKeyPath.startsWith(`..${path.sep}`),
    "minisign public key escapes the repository",
  )
  verifyPinnedFile(publicKeyPath, pin.minisign, "minisign public key", fileSystem)
  assert(fileSystem.readFileSync(publicKeyPath, "utf8").includes(pin.minisign.keyId), "public key ID mismatch")

  // Desktop versions are checked together by the Desktop release contract.
  // The separately signed producer runtime can remain pinned across UI releases.
  return pin
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const pin = verifyRuntimePin()
    console.log(`AX Code runtime pin check passed (${pin.version}, ${Object.keys(pin.artifacts).length} targets).`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
