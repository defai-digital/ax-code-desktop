import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
const require = createRequire(import.meta.url)
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ax-desktop-session-cors-"))
const env = { ...process.env, AX_SESSION_CORS_PROFILE_DIR: profile }
delete env.ELECTRON_RUN_AS_NODE
try {
  execFileSync(require("electron"), [path.join(import.meta.dirname, "smoke-session-cors.cjs")], {
    env,
    stdio: "inherit",
    timeout: 30000,
  })
} finally {
  // Windows retains Chromium profile locks until the owning process exits.
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
