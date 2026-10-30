"use strict"

const path = require("path")

// macOS launch candidates for "Open in <app>", tried in order until one succeeds (see open-app-launcher.js).

const JETBRAINS_APP_IDS = new Set([
  "pycharm",
  "intellij",
  "webstorm",
  "phpstorm",
  "rider",
  "rustrover",
  "android-studio",
])

const CLI_BY_APP_ID = {
  vscode: "code",
  cursor: "cursor",
  vscodium: "codium",
  windsurf: "windsurf",
  zed: "zed",
}

// Terminals open a folder: `open -a <app> <folder>` starts a shell there, and a file opens in its folder.
const TERMINAL_APP_IDS = new Set(["terminal", "iterm2", "ghostty", "akitty"])

const buildOpenProjectSpecs = ({ projectPath, appId, appName }) => {
  if (appId === "finder") return [{ program: "open", args: [projectPath] }]
  if (TERMINAL_APP_IDS.has(appId)) {
    return [{ program: "open", args: ["-a", appName, projectPath] }]
  }
  const specs = []
  const cli = CLI_BY_APP_ID[appId]
  if (cli) specs.push({ program: cli, args: ["-n", projectPath] })
  if (JETBRAINS_APP_IDS.has(appId)) specs.push({ program: "open", args: ["-na", appName, "--args", projectPath] })
  specs.push({ program: "open", args: ["-a", appName, projectPath] })
  return specs
}

const buildOpenFileSpecs = ({ filePath, appId, appName }) => {
  if (appId === "finder") return [{ program: "open", args: ["-R", filePath] }]
  if (TERMINAL_APP_IDS.has(appId)) {
    return buildOpenProjectSpecs({ projectPath: path.dirname(filePath), appId, appName })
  }
  const specs = []
  const cli = CLI_BY_APP_ID[appId]
  if (cli) specs.push({ program: cli, args: ["-n", filePath] })
  if (JETBRAINS_APP_IDS.has(appId)) specs.push({ program: "open", args: ["-na", appName, "--args", filePath] })
  specs.push({ program: "open", args: ["-a", appName, filePath] })
  return specs
}

module.exports = { TERMINAL_APP_IDS, buildOpenFileSpecs, buildOpenProjectSpecs }
