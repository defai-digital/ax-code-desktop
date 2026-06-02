import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"

import { classifyTestFiles, collectTestFiles, parseArgs } from "./run-tests.mjs"

describe("run-tests", () => {
  test("classifies Bun and Vitest test files by their imports", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "openchamber-tests-"))
    const packageDir = path.join(tempRoot, "packages", "web")
    await mkdir(packageDir, { recursive: true })

    const bunTest = path.join(packageDir, "bun-case.test.js")
    const vitestTest = path.join(packageDir, "vitest-case.test.ts")
    const ignoredDistTest = path.join(packageDir, "dist", "ignored.test.js")
    await mkdir(path.dirname(ignoredDistTest), { recursive: true })

    await writeFile(bunTest, 'import { test } from "bun:test"\n')
    await writeFile(vitestTest, "import { it } from 'vitest'\n")
    await writeFile(ignoredDistTest, 'import { test } from "bun:test"\n')

    const files = await collectTestFiles(tempRoot, ["packages"])
    const groups = await classifyTestFiles(files)

    expect(files).toEqual([bunTest, vitestTest])
    expect(groups.bun).toEqual([bunTest])
    expect(groups.vitest).toEqual([vitestTest])
    expect(groups.ambiguous).toEqual([])
    expect(groups.unclassified).toEqual([])
  })

  test("flags test files that do not declare a supported runner", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "openchamber-tests-"))
    const packageDir = path.join(tempRoot, "packages", "ui")
    await mkdir(packageDir, { recursive: true })

    const unclassified = path.join(packageDir, "missing-runner.test.ts")
    await writeFile(unclassified, "export const value = 1\n")

    const groups = await classifyTestFiles(await collectTestFiles(tempRoot, ["packages"]))

    expect(groups.unclassified).toEqual([unclassified])
  })

  test("parses runner selection and pass-through arguments", () => {
    expect(parseArgs(["--runner", "bun", "--", "--rerun-each=2"])).toEqual({
      runner: "bun",
      passThrough: ["--rerun-each=2"],
    })
    expect(parseArgs(["--runner", "bun", "--bail=1"])).toEqual({
      runner: "bun",
      passThrough: ["--bail=1"],
    })
    expect(parseArgs(["--runner=vitest"])).toEqual({
      runner: "vitest",
      passThrough: [],
    })
    expect(() => parseArgs(["--runner=unknown"])).toThrow("Unsupported runner")
  })
})
