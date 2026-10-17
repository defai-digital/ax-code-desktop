"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { verifyRuntimeManifest, verifyRuntimeManifestAsync } = require("../../../../script/runtime-manifest.cjs")

const EMBEDDED_MANIFEST_NAME = "ax-code-runtime-manifest.json"
const PLACEHOLDER_SCHEMA = "ax-code.runtime-manifest.placeholder.v1"

// Shared preflight: resolves everything cheap and decides whether the runtime
// tree has to be hashed at all. Returns a final result, or the inputs to verify.
function inspectBundledAxCode({
  platform = process.platform,
  isPackaged,
  appPath,
  resourcesPath,
  exists = fs.existsSync,
  readFile = fs.readFileSync,
} = {}) {
  if (!isPackaged) return { result: { status: "skipped", reason: "unpackaged" } }
  if (!appPath || !resourcesPath) throw new Error("Packaged application and resources paths are required")

  const runtimeRoot = path.join(resourcesPath, "ax-code")
  const launcher = path.join(runtimeRoot, "bin", platform === "win32" ? "ax-code.cmd" : "ax-code")
  const runtimePackage = path.join(runtimeRoot, "package.json")
  const trustedManifestPath = path.join(appPath, "dist", EMBEDDED_MANIFEST_NAME)
  if (!exists(trustedManifestPath)) {
    throw new Error(`Packaged ax-code runtime has no trusted ASAR manifest: ${trustedManifestPath}`)
  }

  let trustedManifest
  try {
    trustedManifest = JSON.parse(readFile(trustedManifestPath, "utf8"))
  } catch (error) {
    throw new Error(
      `Packaged ax-code runtime has an invalid trusted ASAR manifest: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (trustedManifest?.schema === PLACEHOLDER_SCHEMA) {
    if (exists(launcher) || exists(runtimePackage)) {
      throw new Error("Packaged ax-code runtime is present but the trusted ASAR manifest authorizes only a placeholder")
    }
    return { result: { status: "skipped", reason: "runtime-not-staged", runtimeRoot } }
  }

  if (!exists(launcher) || !exists(runtimePackage)) {
    throw new Error(`Packaged ax-code runtime required by the trusted ASAR manifest is incomplete: ${runtimeRoot}`)
  }

  return { runtimeRoot, trustedManifest }
}

function verifyBundledAxCodeIntegrity(options = {}) {
  const inspected = inspectBundledAxCode(options)
  if (inspected.result) return inspected.result
  const { runtimeRoot, trustedManifest } = inspected
  const manifest = verifyRuntimeManifest(runtimeRoot, { manifest: trustedManifest })
  return { status: "verified", runtimeRoot, entries: manifest.files.length }
}

// Same checks and errors as verifyBundledAxCodeIntegrity without blocking the
// Electron main thread while the runtime tree is hashed.
async function verifyBundledAxCodeIntegrityAsync(options = {}) {
  const inspected = inspectBundledAxCode(options)
  if (inspected.result) return inspected.result
  const { runtimeRoot, trustedManifest } = inspected
  const manifest = await verifyRuntimeManifestAsync(runtimeRoot, { manifest: trustedManifest })
  return { status: "verified", runtimeRoot, entries: manifest.files.length }
}

module.exports = {
  EMBEDDED_MANIFEST_NAME,
  PLACEHOLDER_SCHEMA,
  verifyBundledAxCodeIntegrity,
  verifyBundledAxCodeIntegrityAsync,
}
