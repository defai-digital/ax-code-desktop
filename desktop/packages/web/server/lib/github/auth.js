import crypto from "crypto"
import fs from "fs"
import path from "path"
import { writePrivateFileSync } from "../private-file.js"
import { getDesktopDataDir } from "../../../../../shared/desktop-data-dir.mjs"

const STORAGE_DIR = getDesktopDataDir()
const STORAGE_FILE = path.join(STORAGE_DIR, "github-auth.json")
const SETTINGS_FILE = path.join(STORAGE_DIR, "settings.json")

const DEFAULT_GITHUB_CLIENT_ID = "Ov23lizomPOC3eFYo56r"
const DEFAULT_GITHUB_SCOPES = "repo read:org workflow read:user user:email"

// Thrown instead of reading an unreadable file as "no accounts": every write rewrites the whole list, so a
// sign-in would replace each stored account with the new one, and a logout would report success while the
// token stayed on disk.
export class GitHubAuthStorageError extends Error {}

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

function writeAuthList(list) {
  writePrivateFileSync(STORAGE_FILE, JSON.stringify(list, null, 2))
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
  if (!accessToken.trim()) return null
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

function readAuthList({ strict = false } = {}) {
  try {
    const raw = JSON.parse(fs.readFileSync(STORAGE_FILE, "utf8").trim())
    // Before multiple accounts, the file contained a single account object.
    const accounts = (Array.isArray(raw) ? raw : [raw]).map(normalizeAuthEntry)
    if (accounts.includes(null)) throw new GitHubAuthStorageError("Invalid account record")
    const current = accounts.find((entry) => entry.current) ?? accounts[0]
    for (const entry of accounts) entry.current = entry === current
    return accounts
  } catch (error) {
    if (error?.code === "ENOENT") return []
    // Parser messages can contain fragments of credentials.
    console.error("Failed to read GitHub auth file:", error?.code || "invalid account data")
    if (strict) throw new GitHubAuthStorageError("The GitHub auth file could not be read; it was left unchanged")
    return []
  }
}

export function getGitHubAuth(options) {
  return readAuthList(options).find((entry) => entry.current) ?? null
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
  if (typeof accessToken !== "string" || !accessToken.trim()) {
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

// Set by the Octokit request hook on every error it rethrows: the account and token the failing request used.
// A symbol key that is not enumerable, so the token never reaches a log line or a JSON body with the error.
export const GITHUB_REQUEST_CREDENTIAL = Symbol("ax-code-desktop.githubRequestCredential")

export function tagGitHubRequestError(error, credential) {
  if (error && typeof error === "object" && credential?.accessToken) {
    try {
      Object.defineProperty(error, GITHUB_REQUEST_CREDENTIAL, { value: credential, configurable: true })
    } catch {
      // A frozen error keeps the untagged fallback below.
    }
  }
  return error
}

/**
 * Forget the credential GitHub refused for this request. A 401 cleared whichever account was current when the
 * answer arrived: a poll that started with account A and was refused after the user switched to B deleted B and
 * made the revoked A current again. Only the entry the request used is removed, and only while it still holds the
 * refused token, so a re-login of the same account in the meantime survives too. An error without the tag (an
 * Octokit built elsewhere) keeps the previous behavior.
 */
export function clearRejectedGitHubAuth(error) {
  const credential = error?.[GITHUB_REQUEST_CREDENTIAL]
  if (!credential?.accessToken) return clearGitHubAuth()
  return removeGitHubAccount(
    (entry) => entry.accountId === credential.accountId && entry.accessToken === credential.accessToken,
  )
}

export function clearGitHubAuth() {
  return removeGitHubAccount((entry) => entry.current)
}

function removeGitHubAccount(matches) {
  try {
    const accounts = readAuthList({ strict: true })
    const index = accounts.findIndex(matches)
    if (index < 0) return true
    const [removed] = accounts.splice(index, 1)
    if (accounts.length === 0) {
      fs.rmSync(STORAGE_FILE, { force: true })
    } else {
      if (removed.current) accounts[0].current = true
      writeAuthList(accounts)
    }
    return true
  } catch (error) {
    console.error("Failed to clear GitHub auth file:", error?.code || "storage unavailable")
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
