import crypto from "crypto"
import fs from "fs"
import path from "path"
import os from "os"

const AX_CODE_DESKTOP_DATA_DIR = process.env.AX_CODE_DESKTOP_DATA_DIR
  ? path.resolve(process.env.AX_CODE_DESKTOP_DATA_DIR)
  : path.join(os.homedir(), ".config", "openchamber")

const STORAGE_DIR = AX_CODE_DESKTOP_DATA_DIR
const STORAGE_FILE = path.join(STORAGE_DIR, "github-auth.json")
const SETTINGS_FILE = path.join(AX_CODE_DESKTOP_DATA_DIR, "settings.json")

const DEFAULT_GITHUB_CLIENT_ID = "Ov23lizomPOC3eFYo56r"
const DEFAULT_GITHUB_SCOPES = "repo read:org workflow read:user user:email"

function ensureStorageDir() {
  // 0700 like the git identities store beside it: this directory holds the OAuth token.
  fs.mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o700 })
}

// Thrown instead of reading an unreadable file as "no accounts": every write rewrites the whole list, so a
// sign-in would replace each stored account with the new one, and a logout would report success while the
// token stayed on disk.
export class GitHubAuthStorageError extends Error {}

function readJsonFile({ strict = false } = {}) {
  ensureStorageDir()
  let raw
  try {
    raw = fs.readFileSync(STORAGE_FILE, "utf8")
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null
    }
    // The code only: the error object can carry file contents in other runtimes' messages.
    console.error("Failed to read GitHub auth file:", error?.code || "unknown error")
    if (strict) throw new GitHubAuthStorageError("The GitHub auth file could not be read; it was left unchanged")
    return null
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // The parse message quotes the text around the error, which here is token material.
    console.error("Failed to read GitHub auth file: invalid JSON")
    parsed = null
  }
  if (!parsed || typeof parsed !== "object") {
    if (strict) throw new GitHubAuthStorageError("The GitHub auth file is not valid; it was left unchanged")
    return null
  }
  return parsed
}

function readSettingsJsonFile() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8")
    const trimmed = raw.trim()
    if (!trimmed) {
      return null
    }
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== "object") {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeJsonFile(payload) {
  ensureStorageDir()

  // Atomic write so multiple OpenChamber instances can safely share the same file.
  const tmpFile = `${STORAGE_FILE}.${process.pid}.${Date.now()}.tmp`
  // Created 0600 rather than written and then chmod'd: this file holds the OAuth access token, the chmod is
  // best-effort (its failure was swallowed), and a 0644 window is readable by every other local user. The git
  // identities store beside it passes `mode` for the same reason.
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 })
    try {
      fs.chmodSync(tmpFile, 0o600)
    } catch {
      // best-effort
    }
    fs.renameSync(tmpFile, STORAGE_FILE)
  } catch (error) {
    // The temp file holds the tokens, and logout only removes STORAGE_FILE: a leftover copy would outlive it.
    try {
      fs.unlinkSync(tmpFile)
    } catch {
      // already gone
    }
    throw error
  }
  try {
    fs.chmodSync(STORAGE_FILE, 0o600)
  } catch {
    // best-effort
  }
}

function resolveAccountId({ user, accessToken, accountId }) {
  if (typeof accountId === "string" && accountId.trim()) {
    return accountId.trim()
  }
  if (user && typeof user.login === "string" && user.login.trim()) {
    return user.login.trim()
  }
  if (user && typeof user.id === "number") {
    return String(user.id)
  }
  if (typeof accessToken === "string" && accessToken.trim()) {
    // The fallback id must stay stable for the same token (it is the dedupe
    // key in setGitHubAuth) but must not embed raw token characters, since the
    // id is persisted and can reach the renderer via the accounts list.
    const digest = crypto.createHash("sha256").update(accessToken).digest("hex").slice(0, 12)
    return `token:${digest}`
  }
  return ""
}

function normalizeAuthEntry(entry) {
  if (!entry || typeof entry !== "object") return null
  const accessToken = typeof entry.accessToken === "string" ? entry.accessToken : ""
  if (!accessToken) return null
  const user =
    entry.user && typeof entry.user === "object"
      ? {
          login: typeof entry.user.login === "string" ? entry.user.login : null,
          avatarUrl: typeof entry.user.avatarUrl === "string" ? entry.user.avatarUrl : null,
          id: typeof entry.user.id === "number" ? entry.user.id : null,
          name: typeof entry.user.name === "string" ? entry.user.name : null,
          email: typeof entry.user.email === "string" ? entry.user.email : null,
        }
      : null

  const accountId = resolveAccountId({
    user,
    accessToken,
    accountId: typeof entry.accountId === "string" ? entry.accountId : "",
  })

  return {
    accessToken,
    scope: typeof entry.scope === "string" ? entry.scope : "",
    tokenType: typeof entry.tokenType === "string" ? entry.tokenType : "bearer",
    createdAt: typeof entry.createdAt === "number" ? entry.createdAt : null,
    user,
    current: Boolean(entry.current),
    accountId,
  }
}

function normalizeAuthList(raw) {
  const list = (Array.isArray(raw) ? raw : [raw]).map((entry) => normalizeAuthEntry(entry)).filter(Boolean)

  if (!list.length) {
    return { list: [], changed: false }
  }

  let changed = false
  let currentFound = false
  list.forEach((entry) => {
    if (entry.current && !currentFound) {
      currentFound = true
    } else if (entry.current && currentFound) {
      entry.current = false
      changed = true
    }
  })

  if (!currentFound && list[0]) {
    list[0].current = true
    changed = true
  }

  list.forEach((entry) => {
    if (!entry.accountId) {
      entry.accountId = resolveAccountId(entry)
      changed = true
    }
  })

  return { list, changed }
}

function readAuthList({ strict = false } = {}) {
  const data = readJsonFile({ strict })
  if (!data) {
    return []
  }
  const { list, changed } = normalizeAuthList(data)
  if (changed) {
    writeJsonFile(list)
  }
  return list
}

function writeAuthList(list) {
  writeJsonFile(list)
}

export function getGitHubAuth() {
  const list = readAuthList()
  if (!list.length) {
    return null
  }
  const current = list.find((entry) => entry.current) || list[0]
  if (!current?.accessToken) {
    return null
  }
  return current
}

export function getGitHubAuthAccounts() {
  const list = readAuthList()
  return list
    .filter((entry) => entry?.user && entry.accountId)
    .map((entry) => ({
      id: entry.accountId,
      user: entry.user,
      scope: entry.scope || "",
      current: Boolean(entry.current),
    }))
}

export function setGitHubAuth({ accessToken, scope, tokenType, user, accountId }) {
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error("accessToken is required")
  }
  const normalizedUser =
    user && typeof user === "object"
      ? {
          login: typeof user.login === "string" ? user.login : undefined,
          avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : undefined,
          id: typeof user.id === "number" ? user.id : undefined,
          name: typeof user.name === "string" ? user.name : undefined,
          email: typeof user.email === "string" ? user.email : undefined,
        }
      : undefined

  const resolvedAccountId = resolveAccountId({
    user: normalizedUser,
    accessToken,
    accountId,
  })

  const list = readAuthList({ strict: true })
  const existingIndex = list.findIndex((entry) => entry.accountId === resolvedAccountId)
  const nextEntry = {
    accessToken,
    scope: typeof scope === "string" ? scope : "",
    tokenType: typeof tokenType === "string" ? tokenType : "bearer",
    createdAt: Date.now(),
    user: normalizedUser || null,
    current: true,
    accountId: resolvedAccountId,
  }

  if (existingIndex >= 0) {
    list[existingIndex] = nextEntry
  } else {
    list.push(nextEntry)
  }

  list.forEach((entry, index) => {
    entry.current = index === (existingIndex >= 0 ? existingIndex : list.length - 1)
  })
  writeAuthList(list)
  return nextEntry
}

export function activateGitHubAuth(accountId) {
  if (typeof accountId !== "string" || !accountId.trim()) {
    return false
  }
  const list = readAuthList({ strict: true })
  const index = list.findIndex((entry) => entry.accountId === accountId.trim())
  if (index === -1) {
    return false
  }
  list.forEach((entry, idx) => {
    entry.current = idx === index
  })
  writeAuthList(list)
  return true
}

export function clearGitHubAuth() {
  try {
    const list = readAuthList({ strict: true })
    if (!list.length) {
      return true
    }
    const remaining = list.filter((entry) => !entry.current)
    if (!remaining.length) {
      try {
        fs.unlinkSync(STORAGE_FILE)
      } catch (error) {
        if (!error || error.code !== "ENOENT") throw error
      }
      return true
    }
    remaining.forEach((entry, index) => {
      entry.current = index === 0
    })
    writeAuthList(remaining)
    return true
  } catch (error) {
    console.error("Failed to clear GitHub auth file:", error)
    return false
  }
}

export function getGitHubClientId() {
  const raw = process.env.AX_CODE_DESKTOP_GITHUB_CLIENT_ID
  const clientId = typeof raw === "string" ? raw.trim() : ""
  if (clientId) return clientId

  const parsed = readSettingsJsonFile()
  const stored = typeof parsed?.githubClientId === "string" ? parsed.githubClientId.trim() : ""
  if (stored) return stored

  return DEFAULT_GITHUB_CLIENT_ID
}

export function getGitHubScopes() {
  const raw = process.env.AX_CODE_DESKTOP_GITHUB_SCOPES
  const fromEnv = typeof raw === "string" ? raw.trim() : ""
  if (fromEnv) return fromEnv

  const parsed = readSettingsJsonFile()
  const stored = typeof parsed?.githubScopes === "string" ? parsed.githubScopes.trim() : ""
  if (stored) return stored

  return DEFAULT_GITHUB_SCOPES
}

export const GITHUB_AUTH_FILE = STORAGE_FILE
