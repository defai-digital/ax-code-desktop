#!/usr/bin/env node
// Ratchet for tests that assert component source text instead of behavior
// (PRD-2026-10-19-competitive-quality-v1, requirement 6). A test is flagged when
// it reads a file with readFile/readFileSync and names a sibling source file
// (.ts, .tsx, .js, .jsx, .mjs or .css) that exists. Existing offenders are listed
// in the baseline; new ones fail, and entries that no longer match must be
// removed so the list only shrinks.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const baselinePath = path.join(desktopRoot, "scripts", "source-text-tests-baseline.json")
const SCAN_ROOTS = ["packages/ui/src", "packages/web/src", "packages/web/server", "packages/electron/src"]
const TEST_FILE_PATTERN = /\.test\.(?:[cm]?[jt]sx?)$/
const SOURCE_LITERAL_PATTERN = /["'`]([^"'`\n]+\.(?:tsx|ts|jsx|js|mjs|css))["'`]/g

const walk = (dir, files = []) => {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (TEST_FILE_PATTERN.test(entry.name)) files.push(full)
  }
  return files
}

const READ_CALL_PATTERN = /\breadFile(?:Sync)?\s*\(/g
const IDENTIFIER_PATTERN = /\b[A-Za-z_$][\w$]*\b/g

// The argument text of a call that starts at `openIndex` (the "(" position).
const callArguments = (text, openIndex) => {
  let depth = 0
  for (let index = openIndex; index < text.length && index < openIndex + 400; index += 1) {
    if (text[index] === "(") depth += 1
    else if (text[index] === ")") {
      depth -= 1
      if (depth === 0) return text.slice(openIndex + 1, index)
    }
  }
  return text.slice(openIndex + 1, openIndex + 400)
}

// Text that can name the file a read call opens: its arguments, plus the
// initializer of any identifier they use (`const file = path.join(...)`).
const readTargets = (text) => {
  const targets = []
  for (const match of text.matchAll(READ_CALL_PATTERN)) {
    const args = callArguments(text, match.index + match[0].length - 1)
    targets.push(args)
    for (const [identifier] of args.matchAll(IDENTIFIER_PATTERN)) {
      const declaration = new RegExp(`\\b(?:const|let|var)\\s+${identifier.replace(/\$/g, "\\$")}\\s*=([^;\\n]+)`)
      const found = text.match(declaration)
      if (found) targets.push(found[1])
    }
  }
  return targets
}

/** Absolute paths of the existing sibling sources a test reads, or an empty list. */
export const findReadSourceFiles = (testPath, text, exists = fs.existsSync) => {
  const found = new Set()
  for (const target of readTargets(text)) {
    for (const match of target.matchAll(SOURCE_LITERAL_PATTERN)) {
      const literal = match[1]
      if (path.isAbsolute(literal) || /^[a-z]+:\/\//i.test(literal) || TEST_FILE_PATTERN.test(literal)) continue
      const resolved = path.resolve(path.dirname(testPath), literal)
      if (resolved !== testPath && exists(resolved)) found.add(resolved)
    }
  }
  return [...found]
}

export const scanSourceTextTests = ({ root = desktopRoot } = {}) => {
  const flagged = []
  for (const scanRoot of SCAN_ROOTS) {
    for (const file of walk(path.join(root, scanRoot))) {
      const text = fs.readFileSync(file, "utf8")
      if (findReadSourceFiles(file, text).length > 0) flagged.push(path.relative(root, file).split(path.sep).join("/"))
    }
  }
  return flagged.sort()
}

export const compareWithBaseline = (flagged, baseline) => {
  const allowed = new Set(baseline)
  const current = new Set(flagged)
  return {
    added: flagged.filter((file) => !allowed.has(file)),
    stale: baseline.filter((file) => !current.has(file)),
  }
}

const main = () => {
  const flagged = scanSourceTextTests()
  if (process.argv.includes("--write-baseline")) {
    fs.writeFileSync(baselinePath, `${JSON.stringify(flagged, null, 2)}\n`)
    console.log(`Wrote ${flagged.length} entries to ${path.relative(desktopRoot, baselinePath)}`)
    return
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"))
  const { added, stale } = compareWithBaseline(flagged, baseline)
  for (const file of added) {
    console.error(`New source-text test: ${file}. Assert rendered behavior instead of reading component source.`)
  }
  for (const file of stale) {
    console.error(`Baseline entry no longer reads source; remove it: ${file}`)
  }
  if (added.length > 0 || stale.length > 0) process.exit(1)
  console.log(`Source-text test ratchet: ${flagged.length} baseline entries, no new ones`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
