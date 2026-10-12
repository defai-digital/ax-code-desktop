import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const SHADOW_TARGETS = ["darwin-arm64", "win32-x64", "linux-x64", "linux-arm64", "web"]

const targetRules = {
  "darwin-arm64": {
    latest: "latest-mac.yml",
    platformToken: "-mac-arm64.",
    requiredExtensions: [".dmg", ".zip"],
  },
  "win32-x64": {
    latest: "latest.yml",
    latestOutput: "latest-win-x64.yml",
    platformToken: "-win-x64.",
    requiredExtensions: [".exe", ".zip"],
  },
  "linux-x64": {
    latest: "latest-linux.yml",
    platformToken: "-linux-x64.",
    platformTokens: ["-linux-x64.", "-linux-x86_64.", "-linux-amd64."],
    requiredExtensions: [".AppImage", ".deb"],
  },
  "linux-arm64": {
    latest: "latest-linux-arm64.yml",
    platformToken: "-linux-arm64.",
    requiredExtensions: [".AppImage", ".deb"],
  },
}

function assert(condition, message) {
  if (!condition) throw new Error(`Shadow artifact collection failed: ${message}`)
}

function releaseExtension(name) {
  for (const extension of [".AppImage.blockmap", ".dmg.blockmap", ".exe.blockmap", ".zip.blockmap"]) {
    if (name.endsWith(extension)) return extension
  }
  return path.extname(name)
}

function copyFile(source, destination, fileSystem) {
  const stat = fileSystem.lstatSync(source)
  assert(stat.isFile() && !stat.isSymbolicLink(), `${source} must be a regular file`)
  fileSystem.copyFileSync(source, destination)
}

export function collectShadowArtifacts({ target, sourceDirectory, outputDirectory, version, fileSystem = fs }) {
  assert(SHADOW_TARGETS.includes(target), `unsupported target ${String(target)}`)
  assert(typeof version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version), "invalid version")
  assert(fileSystem.statSync(sourceDirectory).isDirectory(), `source directory is missing: ${sourceDirectory}`)
  if (fileSystem.existsSync(outputDirectory)) {
    assert(fileSystem.readdirSync(outputDirectory).length === 0, `output directory is not empty: ${outputDirectory}`)
  }
  fileSystem.mkdirSync(outputDirectory, { recursive: true })

  if (target === "web") {
    const tarballs = fileSystem
      .readdirSync(sourceDirectory)
      .filter((name) => name.endsWith(".tgz"))
      .sort()
    assert(tarballs.length === 1, `expected one web tarball, received ${tarballs.length}`)
    const outputName = `ax-code-web-${version}.tgz`
    copyFile(path.join(sourceDirectory, tarballs[0]), path.join(outputDirectory, outputName), fileSystem)
    return [outputName]
  }

  const rule = targetRules[target]
  const entries = fileSystem.readdirSync(sourceDirectory).sort()
  const copied = []
  const primaryExtensions = new Set()
  for (const name of entries) {
    const source = path.join(sourceDirectory, name)
    if (!fileSystem.lstatSync(source).isFile()) continue
    if (name === rule.latest) {
      const outputName = rule.latestOutput ?? name
      copyFile(source, path.join(outputDirectory, outputName), fileSystem)
      copied.push(outputName)
      continue
    }
    if (!name.startsWith(`AX-Code-${version}-`)) continue
    if (!(rule.platformTokens ?? [rule.platformToken]).some((token) => name.includes(token))) continue
    const extension = releaseExtension(name)
    if (
      ![
        ".dmg",
        ".zip",
        ".exe",
        ".AppImage",
        ".deb",
        ".AppImage.blockmap",
        ".dmg.blockmap",
        ".exe.blockmap",
        ".zip.blockmap",
      ].includes(extension)
    ) {
      continue
    }
    copyFile(source, path.join(outputDirectory, name), fileSystem)
    copied.push(name)
    if (rule.requiredExtensions.includes(extension)) primaryExtensions.add(extension)
  }

  assert(copied.includes(rule.latestOutput ?? rule.latest), `missing ${rule.latest}`)
  for (const extension of rule.requiredExtensions) {
    assert(primaryExtensions.has(extension), `missing ${target} ${extension} artifact`)
  }
  return copied.sort()
}

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!["--target", "--source", "--out", "--version"].includes(arg)) {
      throw new Error(`unknown argument ${arg}`)
    }
    const value = argv[++index]
    if (!value) throw new Error(`${arg} requires a value`)
    result[arg.slice(2)] = value
  }
  return result
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2))
    const copied = collectShadowArtifacts({
      target: args.target,
      sourceDirectory: path.resolve(args.source),
      outputDirectory: path.resolve(args.out),
      version: args.version,
    })
    console.log(`Collected ${copied.length} ${args.target} shadow artifact(s).`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
