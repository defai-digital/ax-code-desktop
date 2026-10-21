import os from "node:os"

/** The spelling the app uses for a directory: forward slashes and an upper-case drive letter, as normalizeProjectPath does. */
export const uiPath = (directory) =>
  String(directory)
    .replace(/\\/g, "/")
    .replace(/^([a-z]):/, (_, letter) => `${letter.toUpperCase()}:`)

/** The spelling the app shows on screen: the home directory abbreviated to "~". */
export const displayPath = (directory) => {
  const home = uiPath(os.homedir())
  const value = uiPath(directory)
  const insideHome = process.platform === "win32" ? value.toLowerCase().startsWith(`${home.toLowerCase()}/`) : value.startsWith(`${home}/`)
  return insideHome ? `~${value.slice(home.length)}` : value
}

/** True when text names this directory in any spelling the app may use (raw, normalized or abbreviated). */
export const mentionsPath = (text, directory) =>
  typeof text === "string" && [String(directory), uiPath(directory), displayPath(directory)].some((form) => text.includes(form))

/** The forms a page-side check should accept for a directory attribute or URL parameter. */
export const pathForms = (directory) => [...new Set([String(directory), uiPath(directory)])]
