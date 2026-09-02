/**
 * Resolve the AX Code CLI for Desktop development without depending on an
 * AX Code source checkout.
 *
 * Preference order:
 *   1. Explicit AX_CODE_BINARY, when executable
 *   2. Installed ax-code command on PATH
 */
import fs from "node:fs"
import path from "node:path"

export const isExecutable = (filePath, accessSync = fs.accessSync, statSync = fs.statSync) => {
  try {
    accessSync(filePath, fs.constants.X_OK)
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

export const searchPathFor = (command, env = process.env, platform = process.platform, deps = {}) => {
  const pathValue = env.PATH || ""
  const delimiter = deps.delimiter ?? path.delimiter
  const join = deps.join ?? path.join
  const executable = deps.isExecutable ?? isExecutable
  for (const dir of pathValue.split(delimiter).filter(Boolean)) {
    const candidate = join(dir, command)
    if (executable(candidate)) return candidate
  }
  if (platform === "win32" && !path.extname(command)) return null
  return null
}

/**
 * @param {object} [options]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {NodeJS.Platform} [options.platform]
 * @param {typeof fs} [options.fs]
 * @param {(msg: string) => void} [options.warn]
 * @returns {string | null} Absolute path to an executable CLI entry, or null.
 */
export function resolveDevAxCodeBinary(options = {}) {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const fsp = options.fs ?? fs
  const warn = options.warn ?? ((message) => console.warn(message))
  const executable =
    options.isExecutable ?? ((file) => isExecutable(file, fsp.accessSync.bind(fsp), fsp.statSync.bind(fsp)))

  const explicit = typeof env.AX_CODE_BINARY === "string" ? env.AX_CODE_BINARY.trim() : ""
  if (explicit) {
    if (executable(explicit)) return explicit
    warn(`[electron-dev] AX_CODE_BINARY="${explicit}" is not executable; falling back to PATH`)
  }

  const pathLookup =
    searchPathFor(platform === "win32" ? "ax-code.cmd" : "ax-code", env, platform, {
      isExecutable: executable,
    }) || searchPathFor("ax-code", env, platform, { isExecutable: executable })
  if (pathLookup) return pathLookup

  warn("[electron-dev] ax-code was not found; set AX_CODE_BINARY or install a compatible AX Code runtime")
  return null
}
