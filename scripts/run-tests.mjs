import { spawn } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const TEST_FILE_RE = /\.(test|spec)\.(js|jsx|ts|tsx|mjs|cjs)$/
const BUN_TEST_IMPORT_RE = /^\s*import\b.*\bfrom\s+["']bun:test["']/m
const VITEST_IMPORT_RE = /^\s*import\b.*\bfrom\s+["']vitest["']/m
const IGNORED_DIRS = new Set([
  ".git",
  ".turbo",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
])

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

export async function collectTestFiles(root, roots = ["packages", "scripts"]) {
  const files = []

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue

      const target = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(target)
      } else if (TEST_FILE_RE.test(entry.name)) {
        files.push(target)
      }
    }
  }

  for (const rootName of roots) {
    await walk(path.join(root, rootName))
  }

  return files.sort((a, b) => a.localeCompare(b))
}

export async function classifyTestFiles(files) {
  const groups = {
    bun: [],
    vitest: [],
    ambiguous: [],
    unclassified: [],
  }

  for (const file of files) {
    const body = await readFile(file, "utf8")
    const usesBun = BUN_TEST_IMPORT_RE.test(body)
    const usesVitest = VITEST_IMPORT_RE.test(body)

    if (usesBun && usesVitest) groups.ambiguous.push(file)
    else if (usesBun) groups.bun.push(file)
    else if (usesVitest) groups.vitest.push(file)
    else groups.unclassified.push(file)
  }

  return groups
}

export function parseArgs(args) {
  const options = {
    runner: "all",
    passThrough: [],
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === "--") {
      options.passThrough = args.slice(index + 1)
      break
    }

    if (arg === "--runner") {
      options.runner = args[index + 1] ?? ""
      index += 1
      continue
    }

    if (arg.startsWith("--runner=")) {
      options.runner = arg.slice("--runner=".length)
      continue
    }

    options.passThrough = args.slice(index)
    break
  }

  if (!["all", "bun", "vitest"].includes(options.runner)) {
    throw new Error(`Unsupported runner: ${options.runner}`)
  }

  return options
}

function toRelative(files) {
  return files.map((file) => path.relative(repoRoot, file))
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
      ...options,
    })

    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} exited with ${signal ?? code}`))
    })
  })
}

async function runSelectedTests(groups, options) {
  const runners =
    options.runner === "all" ? ["bun", "vitest"] : [options.runner]

  for (const runner of runners) {
    const files = groups[runner]
    if (files.length === 0) {
      console.log(`No ${runner} tests found.`)
      continue
    }

    console.log(`Running ${files.length} ${runner} test files.`)
    if (runner === "bun") {
      await runCommand("bun", [
        "test",
        "--isolate",
        "--timeout=10000",
        ...toRelative(files),
        ...options.passThrough,
      ])
    } else {
      await runCommand("bun", [
        "run",
        "--cwd",
        "packages/web",
        "test",
        "--",
        ...files,
        ...options.passThrough,
      ])
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const files = await collectTestFiles(repoRoot)
  const groups = await classifyTestFiles(files)

  const invalid = [...groups.ambiguous, ...groups.unclassified]
  if (invalid.length > 0) {
    console.error("Every test file must import exactly one supported runner.")
    for (const file of groups.ambiguous) {
      console.error(`- ${path.relative(repoRoot, file)} imports both bun:test and vitest`)
    }
    for (const file of groups.unclassified) {
      console.error(`- ${path.relative(repoRoot, file)} does not import bun:test or vitest`)
    }
    process.exit(1)
  }

  console.log(`Discovered ${files.length} test files: ${groups.bun.length} bun, ${groups.vitest.length} vitest.`)
  await runSelectedTests(groups, options)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
