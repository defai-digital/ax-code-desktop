import fs from "fs"
import path from "path"
import os from "os"

import { readAuthFile } from "../../ax-code/auth.js"

const AX_CODE_CONFIG_DIR =
  process.env.AX_CODE_CONFIG_DIR ||
  // Same resolution as the sibling readers (`ax-code/shared.js` for config, `ax-code/auth.js` for data):
  // ax-code resolves both directories through xdg-basedir, so a hardcoded `~/.config` or `~/.local/share`
  // looks in a different place than the runtime writes whenever the user has customised the XDG paths.
  path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "ax-code")
const AX_CODE_DATA_DIR =
  process.env.AX_CODE_DATA_DIR ||
  path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "ax-code")

export const ANTIGRAVITY_ACCOUNTS_PATHS = [
  path.join(AX_CODE_CONFIG_DIR, "antigravity-accounts.json"),
  path.join(AX_CODE_DATA_DIR, "antigravity-accounts.json"),
]

export const readJsonFile = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, "utf8")
    const trimmed = raw.trim()
    if (!trimmed) return null
    return JSON.parse(trimmed)
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null
    }
    console.warn(`Failed to read JSON file: ${filePath}`, error)
    return null
  }
}

export const getAuthEntry = (auth, aliases) => {
  for (const alias of aliases) {
    if (auth[alias]) {
      return auth[alias]
    }
  }
  return null
}

export const normalizeAuthEntry = (entry) => {
  if (!entry) return null
  if (typeof entry === "string") {
    return { token: entry }
  }
  if (typeof entry === "object") {
    return entry
  }
  return null
}

/**
 * Read and normalize the stored auth entry for the first matching provider alias.
 * Centralized so every provider resolves stored credentials the same way instead
 * of repeating readAuthFile + getAuthEntry + normalizeAuthEntry. Returns null
 * when the config holds no entry for any alias.
 */
export const readProviderAuthEntry = (aliases) => {
  const auth = readAuthFile()
  return normalizeAuthEntry(getAuthEntry(auth, aliases))
}
