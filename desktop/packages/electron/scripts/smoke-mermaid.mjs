import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const require = createRequire(import.meta.url)
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ax-mermaid-smoke-"))
const env = { ...process.env, AX_MERMAID_SMOKE_PROFILE: profile }
delete env.ELECTRON_RUN_AS_NODE
try {
  execFileSync(require("electron"), [path.join(import.meta.dirname, "smoke-mermaid.cjs")], {
    env,
    stdio: "inherit",
    timeout: 120_000,
  })
} finally {
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
