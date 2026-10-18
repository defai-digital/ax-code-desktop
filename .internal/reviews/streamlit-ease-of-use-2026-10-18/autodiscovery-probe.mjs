// Execute the real detector's existing-action branch without starting a process or server.
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import ts from "typescript"

const root = path.resolve(import.meta.dirname, "../../..")
function load(relative) {
  const exports = {}
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(compiled, {
    exports,
    require: () => ({}),
    fetch: () => { throw new Error("Unexpected I/O outside the existing-action branch") },
  }, { filename: relative })
  return exports
}
const { createStreamlitProjectAction } = load("desktop/packages/ui/src/lib/streamlitProjectAction.ts")
const { detectDevServerCommand } = load("desktop/packages/ui/src/lib/detectDevServer.ts")
const action = createStreamlitProjectAction({
  id: "streamlit-review-fixture", name: "Start Streamlit", interpreter: ".venv/bin/python",
  entrypoint: "streamlit_app.py", port: "8501",
})
const detected = await detectDevServerCommand("/fixture/project", [action], null)
const preserved = ["id", "command", "shell", "waitForUrl", "openUrl"].every((key) => action[key] === detected.action?.[key])
if (!preserved || detected.previewUrlHint !== action.openUrl) throw new Error("Discovery lost the saved action contract")
const receipt = { method: "Real source functions; no shell or server", preserved, detected }
fs.writeFileSync(path.join(import.meta.dirname, "autodiscovery-fixed-receipt.json"), JSON.stringify(receipt, null, 2) + "\n")
console.log(JSON.stringify(receipt, null, 2))
