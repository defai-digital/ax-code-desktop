import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sdkPin = JSON.parse(fs.readFileSync(path.join(root, "config", "ax-code-sdk.json"), "utf8"))
const expectedSdkDependency = sdkPin.specifier
const expectedSdkConsumers = new Set(["desktop/packages/ui/package.json", "desktop/packages/web/package.json"])
const sourceExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"])
const directFiles = ["package.json", "pnpm-workspace.yaml", "turbo.json", "desktop/vite-theme-plugin.ts", "desktop/vitest.config.ts"]
const directFilePaths = new Set(directFiles.map((file) => path.join(root, file)))
const scanRoots = ["desktop/packages", "desktop/scripts", "desktop/docs"]
const privateRuntimePattern = /^ax-code\/(?:session|provider|tool|storage|mcp|workflow|runtime|config)(?:\/|$)/

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

function isIdentifierStart(char) {
  return char !== undefined && /[A-Za-z_$]/.test(char)
}

function isIdentifierPart(char) {
  return char !== undefined && /[A-Za-z0-9_$]/.test(char)
}

function skipLineComment(source, index) {
  while (index < source.length && source[index] !== "\n") index += 1
  return index
}

function skipBlockComment(source, index) {
  index += 2
  while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1
  return Math.min(index + 2, source.length)
}

function skipString(source, index) {
  const quote = source[index]
  index += 1
  while (index < source.length) {
    const char = source[index]
    if (char === "\\") {
      index += 2
      continue
    }
    if (char === quote) return index + 1
    index += 1
  }
  return index
}

function skipTrivia(source, index) {
  while (index < source.length) {
    const char = source[index]
    if (/\s/.test(char)) {
      index += 1
    } else if (char === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index)
    } else if (char === "/" && source[index + 1] === "*") {
      index = skipBlockComment(source, index)
    } else {
      break
    }
  }
  return index
}

function readStringLiteral(source, index) {
  const quote = source[index]
  if (quote !== '"' && quote !== "'" && quote !== "`") return undefined
  let cursor = index + 1
  let value = ""
  while (cursor < source.length) {
    const char = source[cursor]
    if (char === "\\") {
      value += source[cursor + 1] ?? ""
      cursor += 2
      continue
    }
    if (char === quote) return { value, end: cursor + 1 }
    if (quote === "`" && char === "$" && source[cursor + 1] === "{") return undefined
    value += char
    cursor += 1
  }
  return undefined
}

function readCallSpecifier(source, index) {
  let cursor = skipTrivia(source, index)
  if (source[cursor] !== "(") return undefined
  cursor = skipTrivia(source, cursor + 1)
  if (source[cursor] === "(") {
    cursor = skipTrivia(source, cursor + 1)
    const literal = readStringLiteral(source, cursor)
    if (!literal) return undefined
    cursor = skipTrivia(source, literal.end)
    if (source[cursor] !== ")") return undefined
    cursor = skipTrivia(source, cursor + 1)
    if (source[cursor] !== ")") return undefined
    return literal
  }
  // The first argument is the specifier; import options and trailing arguments follow it.
  return readStringLiteral(source, cursor)
}

/**
 * Collect statically known module specifiers from `from`, `require(...)`, and `import(...)`.
 * Comments and ordinary strings are skipped, so documentation-like text cannot pass for an
 * import and a commented-out import cannot fail the gate.
 */
function moduleSpecifiers(source) {
  const specifiers = []
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index)
      continue
    }
    if (char === "/" && source[index + 1] === "*") {
      index = skipBlockComment(source, index)
      continue
    }
    if (char === '"' || char === "'" || char === "`") {
      index = skipString(source, index)
      continue
    }
    if (!isIdentifierStart(char)) {
      index += 1
      continue
    }

    const start = index
    index += 1
    while (isIdentifierPart(source[index])) index += 1
    const word = source.slice(start, index)

    if (word === "from") {
      const literal = readStringLiteral(source, skipTrivia(source, index))
      if (literal) {
        specifiers.push({ specifier: literal.value, index: start })
        index = literal.end
      }
    } else if (word === "require" || word === "import") {
      const literal = readCallSpecifier(source, index)
      if (literal) {
        specifiers.push({ specifier: literal.value, index: start })
        index = literal.end
        continue
      }
      // `import "side-effect-package"` has no call parentheses.
      if (word === "import") {
        const sideEffect = readStringLiteral(source, skipTrivia(source, index))
        if (sideEffect) {
          specifiers.push({ specifier: sideEffect.value, index: start })
          index = sideEffect.end
        }
      }
    }
  }
  return specifiers
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
  // Explicit direct files are scanned regardless of extension; the extension filter previously
  // skipped pnpm-workspace.yaml and turbo.json even though they are listed for review.
  if (
    !directFilePaths.has(file) &&
    path.basename(file) !== "package.json" &&
    !sourceExtensions.has(extension) &&
    !relative.endsWith(".md")
  ) {
    continue
  }
  if (relative === "desktop/CHANGELOG.md") continue

  const source = fs.readFileSync(file, "utf8")
  const checks = [
    [/@ax-code\/sdk(?:\/|\b)/g, "legacy private SDK package name"],
    [/packages\/sdk\/js\/(?:src|dist)(?:\/|\b)/g, "SDK source or dist path"],
  ]
  for (const [pattern, reason] of checks) {
    for (const match of source.matchAll(pattern)) {
      violations.push({ file: relative, line: lineNumber(source, match.index), reason })
    }
  }
  for (const { specifier, index } of moduleSpecifiers(source)) {
    if (privateRuntimePattern.test(specifier)) {
      violations.push({ file: relative, line: lineNumber(source, index), reason: "private AX Code runtime import" })
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
