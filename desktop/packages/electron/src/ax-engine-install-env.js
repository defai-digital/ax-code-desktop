"use strict"

const pin = require("../../../../config/ax-engine-runtime.json")
const identity = require("../../../../config/desktop-identity.json")

const INSTALL_KEYS = [
  "AX_ENGINE_INSTALL_URL",
  "AX_ENGINE_INSTALL_VERSION",
  "AX_ENGINE_INSTALL_SHA256",
  "AX_ENGINE_INSTALL_TEAM_ID",
]

function validateAxEnginePin(value) {
  const artifact = value?.artifact
  const filename = `ax-engine-v${value?.version}-macos-arm64.tar.gz`
  if (
    value?.schema !== "ax-code-desktop.ax-engine-runtime.v1" ||
    !/^\d+\.\d+\.\d+$/.test(value.version) ||
    value.repository !== "defai-digital/ax-engine" ||
    value.releaseTag !== `v${value.version}` ||
    value.platform !== "darwin" ||
    value.arch !== "arm64" ||
    artifact?.filename !== filename ||
    artifact.url !== `https://github.com/${value.repository}/releases/download/${value.releaseTag}/${filename}` ||
    !Number.isSafeInteger(artifact.size) || artifact.size <= 0 ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
    !Number.isSafeInteger(artifact.signatureSize) || artifact.signatureSize <= 0 ||
    !/^[a-f0-9]{64}$/.test(artifact.signatureSha256) ||
    value.appleTeamId !== identity.signing.appleTeamId
  ) {
    throw new Error("Invalid AX Engine runtime pin")
  }
  return value
}

validateAxEnginePin(pin)

function applyAxEngineInstallEnv(env, { enabled, platform = process.platform, arch = process.arch } = {}) {
  const result = { ...env }
  if (!enabled || platform !== "darwin" || arch !== "arm64") return result
  // The official runtime still owns installation, eligibility, update decisions and execution (ADR-021).
  // Treat explicit installer settings as one override; mixing another release's hash would break verification.
  if (INSTALL_KEYS.some((key) => Object.hasOwn(result, key))) return result
  return {
    ...result,
    AX_ENGINE_INSTALL_URL: pin.artifact.url,
    AX_ENGINE_INSTALL_VERSION: pin.version,
    AX_ENGINE_INSTALL_SHA256: pin.artifact.sha256,
    AX_ENGINE_INSTALL_TEAM_ID: pin.appleTeamId,
  }
}

module.exports = { applyAxEngineInstallEnv, validateAxEnginePin }
