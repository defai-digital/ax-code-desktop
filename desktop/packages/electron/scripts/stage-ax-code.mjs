/**
 * Testable helpers for scripts/stage-ax-code.sh.
 *
 * The bundled runtime is pinned by config/ax-code-runtime.json. Release builds
 * download the selected `ax-code-<platform>-<arch>.<ext>` asset, verify its
 * pinned size and SHA-256, then verify its Minisign signature before extracting
 * it into resources/ax-code.
 *
 * Also runnable as a CLI: `node stage-ax-code.mjs plan [electron-builder flags]`
 * prints shell-eval-able `key=value` lines consumed by stage-ax-code.sh.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import runtimeSymlinks from "./runtime-symlinks.cjs"
import runtimeManifest from "../../../../script/runtime-manifest.cjs"
import {
  readRuntimePin,
  runtimeArtifactForTarget,
  verifyPinnedFile,
  verifyRuntimePin,
} from "../../../../script/runtime-pin.mjs"

export const { removeUnsafeRuntimeSymlinks } = runtimeSymlinks
const { writeRuntimeManifest } = runtimeManifest

const defaultElectronDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function repositoryRootFromElectronDir(electronDir = defaultElectronDir) {
  return path.resolve(electronDir, "..", "..", "..")
}

export const RELEASE_REPO = "defai-digital/ax-code"

/** The bundled runtime version comes from AX Coder's reviewed runtime manifest. */
export function readPinnedAxCodeVersion(electronDir = defaultElectronDir, fsp = fs) {
  return readRuntimePin(repositoryRootFromElectronDir(electronDir), fsp).version
}

const PLATFORM_FLAGS = new Map([
  ["--mac", "darwin"],
  ["--win", "win32"],
  ["--windows", "win32"],
  ["--linux", "linux"],
])

/**
 * Derives the packaging target from the electron-builder CLI flags forwarded
 * by package.mjs (--mac/--win/--linux, --x64/--arm64). Explicit CLI flags win;
 * ELECTRON_BUILDER_ARCH (set by several release jobs) fills the arch; the host
 * platform/arch is the final fallback for local `package.mjs` runs.
 */
export function resolveStageTarget({
  argv = [],
  env = process.env,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  let flagPlatform = null
  let flagArch = null
  for (const arg of argv) {
    const flag = typeof arg === "string" ? arg.trim().toLowerCase() : ""
    if (PLATFORM_FLAGS.has(flag)) {
      flagPlatform = PLATFORM_FLAGS.get(flag)
    } else if (flag === "--x64" || flag === "--arm64" || flag === "--armv7l" || flag === "--ia32") {
      flagArch = flag.slice(2)
    }
  }
  const envArch = typeof env.ELECTRON_BUILDER_ARCH === "string" ? env.ELECTRON_BUILDER_ARCH.trim() : ""
  return {
    platform: flagPlatform || platform,
    arch: flagArch || envArch || arch,
  }
}

/** CLI release asset name for a packaging target; null when unsupported. */
export function assetNameForTarget({ platform, arch }) {
  if (platform === "darwin" && arch === "arm64") return "ax-code-darwin-arm64.zip"
  if (platform === "win32" && (arch === "x64" || arch === "arm64")) return `ax-code-windows-${arch}.zip`
  if (platform === "linux" && (arch === "x64" || arch === "arm64")) return `ax-code-linux-${arch}.tar.gz`
  return null
}

export function releaseAssetUrls({ version, assetName, repo = RELEASE_REPO }) {
  // The canonical signed artifacts are mirrored publicly; the source GitHub
  // repository is private and a consumer's GITHUB_TOKEN cannot read it.
  const base =
    repo === RELEASE_REPO
      ? `https://download.ax-code.com/releases/download/v${version}`
      : `https://github.com/${repo}/releases/download/v${version}`
  return {
    archiveUrl: `${base}/${assetName}`,
    signatureUrl: `${base}/${assetName}.minisig`,
  }
}

/** Launcher path inside the staged tree, relative and POSIX-separated. */
export function bundledLauncherRelativePath(platform) {
  return platform === "win32" ? "bin/ax-code.cmd" : "bin/ax-code"
}

/** Release packaging fails closed; dev/OSS builds fall back to a placeholder. */
export function isStageRequired(env = process.env) {
  const value = typeof env.AX_CODE_STAGE_REQUIRED === "string" ? env.AX_CODE_STAGE_REQUIRED.trim().toLowerCase() : ""
  return value === "true" || value === "1" || value === "yes"
}

export function placeholderReadme(version) {
  return [
    "The ax-code agent runtime is not bundled in this build.",
    "",
    "Desktop release builds stage the pinned CLI release tree here via",
    "scripts/stage-ax-code.sh (downloaded from the v" + version + " GitHub release",
    "and minisign-verified). Set AX_CODE_DIST to a local CLI dist tree to bundle",
    "it, or run a release build with AX_CODE_STAGE_REQUIRED=true.",
    "",
    "Without a staged tree the app falls back to resolving ax-code from",
    "settings.axCodeBinary, AX_CODE_* environment variables, or PATH.",
    "",
  ].join("\n")
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const [command, ...rest] = process.argv.slice(2)
  if (command === "plan") {
    const target = resolveStageTarget({ argv: rest })
    const repositoryRoot = repositoryRootFromElectronDir()
    const pin = verifyRuntimePin(repositoryRoot)
    const artifact = runtimeArtifactForTarget(pin, target)
    if (!artifact) {
      console.error(`[stage-ax-code] unsupported packaging target: ${target.platform}/${target.arch}`)
      process.exit(1)
    }
    const urls = releaseAssetUrls({
      version: pin.version,
      assetName: artifact.filename,
      repo: pin.repository,
    })
    const plan = {
      version: pin.version,
      asset: artifact.filename,
      platform: target.platform,
      arch: target.arch,
      archive_url: urls.archiveUrl,
      signature_url: urls.signatureUrl,
      archive_size: artifact.size,
      archive_sha256: artifact.sha256,
      signature_size: artifact.signatureSize,
      signature_sha256: artifact.signatureSha256,
      public_key: pin.minisign.publicKey,
      public_key_id: pin.minisign.keyId,
      launcher: bundledLauncherRelativePath(target.platform),
      required: isStageRequired() ? "true" : "false",
    }
    for (const [key, value] of Object.entries(plan)) {
      console.log(`${key}=${value}`)
    }
  } else if (command === "placeholder") {
    process.stdout.write(placeholderReadme(readPinnedAxCodeVersion()))
  } else if (command === "sanitize-symlinks") {
    const runtimeRoot = rest[0] ? path.resolve(rest[0]) : path.join(defaultElectronDir, "resources", "ax-code")
    const removed = removeUnsafeRuntimeSymlinks(runtimeRoot)
    if (removed.length > 0) {
      console.log(`[stage-ax-code] removed ${removed.length} unsafe runtime symlink(s)`)
    }
  } else if (command === "verify-download") {
    const [file, size, sha256, label = "download"] = rest
    const expectedSize = Number(size)
    if (!file || !Number.isSafeInteger(expectedSize) || !sha256) {
      console.error("usage: node stage-ax-code.mjs verify-download <file> <size> <sha256> [label]")
      process.exit(2)
    }
    verifyPinnedFile(path.resolve(file), { size: expectedSize, sha256 }, label)
  } else if (command === "write-runtime-manifest") {
    const [runtimeRoot] = rest
    if (!runtimeRoot) {
      console.error("usage: node stage-ax-code.mjs write-runtime-manifest <runtime-root>")
      process.exit(2)
    }
    const manifest = writeRuntimeManifest(path.resolve(runtimeRoot))
    console.log(`[stage-ax-code] wrote runtime manifest with ${manifest.files.length} authenticated entries`)
  } else {
    console.error(
      "usage: node stage-ax-code.mjs plan [electron-builder flags] | placeholder | sanitize-symlinks [runtime-root] | verify-download <file> <size> <sha256> [label] | write-runtime-manifest <runtime-root>",
    )
    process.exit(2)
  }
}
