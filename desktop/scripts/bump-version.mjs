#!/usr/bin/env node
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, "..")

// The workspace root is bumped too: `pnpm run check:release-contract` compares it with the three
// package manifests and fails the release when they disagree.
const PACKAGE_PATHS = [
  "../package.json",
  "packages/ui/package.json",
  "packages/web/package.json",
  "packages/electron/package.json",
]

export const bumpVersions = (newVersion, desktopRoot = DESKTOP_ROOT, log = () => {}) => {
  const updated = []
  for (const pkgPath of PACKAGE_PATHS) {
    const fullPath = path.join(desktopRoot, pkgPath)
    let raw
    try {
      raw = fs.readFileSync(fullPath, "utf8")
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error
      log(`  ${pkgPath}: not present, skipping`)
      continue
    }
    const pkg = JSON.parse(raw)
    const oldVersion = pkg.version
    pkg.version = newVersion
    fs.writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + "\n")
    updated.push({ path: pkgPath, from: oldVersion, to: newVersion })
    log(`  ${pkgPath}: ${oldVersion} -> ${newVersion}`)
  }
  return updated
}

const main = () => {
  const newVersion = process.argv[2]
  if (!newVersion || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(newVersion)) {
    console.error("Usage: node scripts/bump-version.mjs <version>")
    console.error("Example: node scripts/bump-version.mjs 0.2.0")
    console.error("Example: node scripts/bump-version.mjs 0.2.0-beta.1")
    process.exitCode = 1
    return
  }

  console.log(`Bumping version to ${newVersion}\n`)
  bumpVersions(newVersion, DESKTOP_ROOT, console.log)

  console.log(`\nVersion bumped to ${newVersion}`)
  console.log("\nNext steps:")
  console.log("  git add -A")
  console.log(`  git commit -m "release desktop v${newVersion}"`)
  // The release policy and the updater both use the bare "v" prefix.
  console.log(`  git tag v${newVersion}`)
  console.log("  git push origin main --tags")
}

const entry = process.argv[1]
if (entry && path.resolve(entry) === fileURLToPath(import.meta.url)) main()
