// Verify the generated multiline command through a real interactive POSIX PTY.
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"
import ts from "typescript"

const root = path.resolve(import.meta.dirname, "../../..")
const requireWeb = createRequire(path.join(root, "desktop/packages/web/package.json"))
const { spawn } = requireWeb("node-pty")
const source = path.join(root, "desktop/packages/ui/src/lib/streamlitRecipe.ts")
const exports = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(source, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports,
  require: (id) => id.endsWith(".py?raw") ? { default: fs.readFileSync(path.join(path.dirname(source), "streamlitRunner.py"), "utf8") } : {},
  URL, Response, TextEncoder, CompressionStream, btoa,
})
const receipts = []
for (const shell of ["/bin/bash", "/bin/zsh"]) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ax-streamlit-pty-"))
  fs.writeFileSync(path.join(cwd, "app.py"), "import streamlit as st\n")
  const terminal = spawn(shell, shell.endsWith("zsh") ? ["-f"] : ["--noprofile", "--norc"], {
    cwd, cols: 200, rows: 40, env: { ...process.env, PS1: "", PS2: "", TERM: "dumb" },
  })
  let output = ""
  const token = "pty-" + path.basename(shell)
  try {
    const command = await exports.streamlitRunCommand({ version: 1, entrypoint: "app.py" }, token) + "\r"
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("No setup response: " + output.slice(-3000))), 20000)
      terminal.onData((data) => {
        output += data
        if (exports.streamlitProgress(output, token).some((event) => event.stage === "setup-required")) {
          clearTimeout(timer)
          resolve()
        }
      })
      setTimeout(async () => { for (let offset = 0; offset < command.length; offset += 512) { terminal.write(command.slice(offset, offset + 512)); await new Promise(resolve => setTimeout(resolve, 10)) } }, 350)
    })
    if (fs.existsSync(path.join(cwd, ".venv"))) throw Error("Normal run created environment")
    receipts.push({ shell, commandDeliveredThroughPty: true, explicitSetupRequired: true })
  } finally {
    terminal.kill()
    fs.rmSync(cwd, { recursive: true, force: true })
  }
}
fs.writeFileSync(path.join(import.meta.dirname, "pty-receipt.json"), JSON.stringify(receipts, null, 2) + "\n")
console.log(JSON.stringify(receipts))
