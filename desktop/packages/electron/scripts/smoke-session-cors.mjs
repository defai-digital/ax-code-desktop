import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
const require = createRequire(import.meta.url)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
execFileSync(require("electron"), [path.join(import.meta.dirname, "smoke-session-cors.cjs")], {
  env,
  stdio: "inherit",
  timeout: 30000,
})
