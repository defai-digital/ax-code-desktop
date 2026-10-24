import { afterEach, expect, test, vi } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runWebMcpChecker } from "./run-webmcp-checker.mjs"

const roots = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function fixture(source) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ax checker with spaces "))
  roots.push(root)
  const directory = path.join(root, "desktop/packages/electron/scripts")
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, "webmcp-check.mjs"), source)
  return root
}

test("runs without pnpm on PATH and preserves JSON, spaces and backslashes", async () => {
  const root = await fixture("process.stdout.write(JSON.stringify(process.argv.slice(2)))")
  vi.stubEnv("PATH", "")
  const args = ["--url", "http://localhost/a path", "--run", String.raw`echo={"text":"a \"quote\" and C:\\some path"}`]
  const result = await runWebMcpChecker(root, args)
  expect(result.code).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual(args)
  expect(result.stderr).toBe("")
})

test("retains checker failure status and diagnostics", async () => {
  const root = await fixture('process.stderr.write("checker failed"); process.exitCode = 7')
  await expect(runWebMcpChecker(root, [])).resolves.toEqual({ code: 7, stdout: "", stderr: "checker failed" })
})

test("rejects a child process launch failure", async () => {
  const root = await fixture("")
  await fs.rm(root, { recursive: true })
  await expect(runWebMcpChecker(root, [])).rejects.toMatchObject({ code: "ENOENT" })
})

test("decodes UTF-8 characters split across output chunks", async () => {
  const root = await fixture(`
    process.stdout.write(Buffer.from([0xe4]))
    process.stderr.write(Buffer.from([0xe4]))
    setTimeout(() => {
      process.stdout.write(Buffer.from([0xb8, 0xad]))
      process.stderr.write(Buffer.from([0xb8, 0xad]))
    }, 40)
  `)
  await expect(runWebMcpChecker(root, [])).resolves.toEqual({ code: 0, stdout: "\u4e2d", stderr: "\u4e2d" })
})
