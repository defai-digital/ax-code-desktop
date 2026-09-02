import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sdkPin = JSON.parse(fs.readFileSync(path.join(root, "config", "ax-code-sdk.json"), "utf8"))
const expectedSdkDependency = sdkPin.specifier
const expectedSdkConsumers = new Set(["desktop/packages/ui/package.json", "desktop/packages/web/package.json"])
const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"])
const directFiles = ["package.json", "pnpm-workspace.yaml", "turbo.json", "desktop/vite.config.ts"]
const scanRoots = ["desktop/packages", "desktop/scripts", "desktop/docs"]

function walk(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "out", "resources"].includes(entry.name)) continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(file))
    else if (entry.isFile()) files.push(file)
  }
  return files
}

function repositoryPath(file) {
  return path.relative(root, file).split(path.sep).join("/")
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length
}

function isWithinRoot(candidate) {
  const relative = path.relative(root, candidate)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

const violations = []
const sdkConsumers = new Set()
const files = [
  ...directFiles.map((file) => path.join(root, file)),
  ...scanRoots.flatMap((directory) => walk(path.join(root, directory))),
].filter((file, index, all) => all.indexOf(file) === index)

for (const file of files) {
  const relative = repositoryPath(file)
  const extension = path.extname(file)
  if (path.basename(file) !== "package.json" && !sourceExtensions.has(extension) && !relative.endsWith(".md")) continue
  if (relative === "desktop/CHANGELOG.md") continue

  const source = fs.readFileSync(file, "utf8")
  const checks = [
    [/@ax-code\/sdk(?:\/|\b)/g, "legacy private SDK package name"],
    [/packages\/sdk\/js\/(?:src|dist)(?:\/|\b)/g, "SDK source or dist path"],
    [
      /from\s+["']ax-code\/(?:session|provider|tool|storage|mcp|workflow|runtime|config)(?:\/|["'])/g,
      "private AX Code runtime import",
    ],
  ]
  for (const [pattern, reason] of checks) {
    for (const match of source.matchAll(pattern)) {
      violations.push({ file: relative, line: lineNumber(source, match.index), reason })
    }
  }

  const relativeAxCodeImport = /["']((?:\.\.\/)+ax-code(?:\/[^"']*)?)["']/g
  for (const match of source.matchAll(relativeAxCodeImport)) {
    const resolved = path.resolve(path.dirname(file), match[1])
    if (!isWithinRoot(resolved)) {
      violations.push({ file: relative, line: lineNumber(source, match.index), reason: "AX Code sibling path" })
    }
  }

  if (path.basename(file) === "package.json") {
    const manifest = JSON.parse(source)
    const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
    for (const field of fields) {
      const dependencies = manifest[field]
      if (!dependencies || typeof dependencies !== "object") continue
      if (Object.hasOwn(dependencies, "@defai-digital/ax-code-sdk")) {
        const actual = dependencies["@defai-digital/ax-code-sdk"]
        sdkConsumers.add(relative)
        if (actual !== expectedSdkDependency) {
          violations.push({
            file: relative,
            line: lineNumber(source, source.indexOf('"@defai-digital/ax-code-sdk"')),
            reason: `SDK dependency must be exactly ${expectedSdkDependency}, received ${String(actual)}`,
          })
        }
      }
      if (Object.hasOwn(dependencies, "ax-code") || Object.hasOwn(dependencies, "@ax-code/sdk")) {
        violations.push({ file: relative, line: 1, reason: `${field} declares a private AX Code workspace package` })
      }
    }
  }
}

for (const consumer of expectedSdkConsumers) {
  if (!sdkConsumers.has(consumer)) {
    violations.push({ file: consumer, line: 1, reason: `missing exact ${expectedSdkDependency} dependency` })
  }
}

if (violations.length > 0) {
  console.error(`AX Code sibling dependency check failed with ${violations.length} violation(s):`)
  for (const violation of violations) console.error(`- ${violation.file}:${violation.line}: ${violation.reason}`)
  process.exitCode = 1
} else {
  console.log(`AX Code sibling dependency check passed (${files.length} files inspected).`)
}
