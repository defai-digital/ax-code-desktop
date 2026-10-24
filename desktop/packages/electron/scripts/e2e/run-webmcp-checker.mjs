import path from "node:path"
import { spawn } from "node:child_process"

// Use Node directly: pnpm can be a standalone binary, and shell wrappers can
// rewrite JSON quotes on Windows. The checker already has its own CLI entry.
export function runWebMcpChecker(root, args) {
  return new Promise((resolve, reject) => {
    const entry = path.join(root, "desktop/packages/electron/scripts/webmcp-check.mjs")
    const child = spawn(process.execPath, [entry, ...args], { cwd: root })
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    let stdout = "", stderr = ""
    child.stdout.on("data", (data) => { stdout += data })
    child.stderr.on("data", (data) => { stderr += data })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
}
