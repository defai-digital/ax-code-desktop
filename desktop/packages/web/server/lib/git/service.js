import { simpleGit } from "simple-git"
import fs from "fs"
import path from "path"
import os from "os"
import { execFile, spawn } from "child_process"
import { promisify } from "util"
import { createHash, randomUUID } from "crypto"
const fsp = fs.promises
const execFileAsync = promisify(execFile)
// The null device `git diff --no-index` is asked to compare against. One of the three call sites selected it per
// platform and the other two hardcoded the POSIX path, which does not exist on Windows.
const NULL_DEVICE_PATH = process.platform === "win32" ? "NUL" : "/dev/null"
const gpgconfCandidates = ["gpgconf", "/opt/homebrew/bin/gpgconf", "/usr/local/bin/gpgconf"]
let resolvedGitBinary = null
const worktreeBootstrapState = new Map()
const remoteExistenceCache = new Map()
const SIMPLE_GIT_SAFE_BINARY_PATTERN = /^([a-z]:)?([a-z0-9/.\\_~-]+)$/i
const SIMPLE_GIT_UNSAFE_BINARY_WARNING =
  "Invalid value supplied for custom binary, restricted characters must be removed"
// simple-git 4 strips every GIT_* variable and a small set of editor/pager
// variables unless they are named in allowEnvironment. Identity, the user's
// own SSH command, and the fixed non-interactive editor stay available.
const SIMPLE_GIT_ALLOWED_ENV_KEYS = [
  "GIT_AUTHOR_DATE",
  "GIT_AUTHOR_EMAIL",
  "GIT_AUTHOR_NAME",
  "GIT_COMMITTER_DATE",
  "GIT_COMMITTER_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_EDITOR",
  "GIT_OPTIONAL_LOCKS",
  "GIT_SSH_COMMAND",
]
const SIMPLE_GIT_GUARDED_ENV_KEYS = new Set(["editor", "pager", "prefix", "ssh_askpass", "visual"])
const SIMPLE_GIT_ALLOWED_ENV_KEY_SET = new Set(SIMPLE_GIT_ALLOWED_ENV_KEYS.map((key) => key.toLowerCase()))
const REMOTE_EXISTENCE_CACHE_TTL_MS = 30_000
const gitIndexMutationQueues = new Map()

const WORKTREE_BOOTSTRAP_PENDING = "pending"
const WORKTREE_BOOTSTRAP_READY = "ready"
const WORKTREE_BOOTSTRAP_FAILED = "failed"

const toBootstrapStateKey = (directory) => {
  const normalized = normalizeDirectoryPath(directory)
  if (!normalized) {
    return ""
  }
  return path.resolve(normalized)
}

const setWorktreeBootstrapState = (directory, status, error = null) => {
  const key = toBootstrapStateKey(directory)
  if (!key) {
    return
  }
  worktreeBootstrapState.set(key, {
    status,
    error: typeof error === "string" && error.trim().length > 0 ? error.trim() : null,
    updatedAt: Date.now(),
  })
}

// Runtime bootstrap events (`worktree.ready` / `worktree.failed`) for directories this server has no
// state for yet. The runtime bootstraps right after `worktree.create` answers, so a fast failure can
// reach the event stream before the create response is handled here; the create applies such an event
// instead of overwriting it with "pending". Bounded, because agents create worktrees too.
const RECENT_WORKTREE_RUNTIME_EVENT_LIMIT = 64
const recentWorktreeRuntimeEvents = new Map()

const rememberRecentWorktreeRuntimeEvent = (key, entry) => {
  recentWorktreeRuntimeEvents.delete(key)
  recentWorktreeRuntimeEvents.set(key, entry)
  while (recentWorktreeRuntimeEvents.size > RECENT_WORKTREE_RUNTIME_EVENT_LIMIT) {
    const oldestKey = recentWorktreeRuntimeEvents.keys().next().value
    if (oldestKey === undefined) break
    recentWorktreeRuntimeEvents.delete(oldestKey)
  }
}

const clearWorktreeBootstrapState = (directory) => {
  const key = toBootstrapStateKey(directory)
  if (!key) {
    return
  }
  worktreeBootstrapState.delete(key)
  recentWorktreeRuntimeEvents.delete(key)
}

/**
 * Project a runtime global event onto the bootstrap status of the worktree it names.
 *
 * `event` is `{ directory, payload }`: the directory from the global event envelope and the
 * `{ type, properties }` payload. Only `worktree.ready` and `worktree.failed` are read; the answer says
 * whether a worktree created through this server was updated.
 */
export function recordWorktreeRuntimeEvent(event) {
  const payload = event?.payload
  const type = typeof payload?.type === "string" ? payload.type : ""
  const status =
    type === "worktree.ready" ? WORKTREE_BOOTSTRAP_READY : type === "worktree.failed" ? WORKTREE_BOOTSTRAP_FAILED : ""
  if (!status) {
    return false
  }
  const directory = typeof event?.directory === "string" ? event.directory.trim() : ""
  if (!directory || directory === "global") {
    return false
  }
  const key = toBootstrapStateKey(directory)
  if (!key) {
    return false
  }
  const message = typeof payload?.properties?.message === "string" ? payload.properties.message.trim() : ""
  const error = status === WORKTREE_BOOTSTRAP_FAILED ? message || "Worktree bootstrap failed" : null
  if (worktreeBootstrapState.has(key)) {
    setWorktreeBootstrapState(key, status, error)
    return true
  }
  rememberRecentWorktreeRuntimeEvent(key, { status, error, receivedAt: Date.now() })
  return false
}

// Called when a create answers: "pending" until the runtime reports, unless it already did after the
// create was sent.
const startWorktreeBootstrapState = (directory, requestedAt) => {
  const key = toBootstrapStateKey(directory)
  if (!key) {
    return
  }
  const early = recentWorktreeRuntimeEvents.get(key)
  recentWorktreeRuntimeEvents.delete(key)
  if (early && early.receivedAt >= requestedAt) {
    setWorktreeBootstrapState(key, early.status, early.error)
    return
  }
  setWorktreeBootstrapState(key, WORKTREE_BOOTSTRAP_PENDING)
}

const isExecutableFile = (candidate) => {
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    return false
  }
  try {
    const stat = fs.statSync(candidate)
    if (!stat.isFile()) {
      return false
    }
    if (process.platform === "win32") {
      const ext = path.extname(candidate).toLowerCase()
      return ext.length === 0 || ext === ".exe" || ext === ".cmd" || ext === ".bat" || ext === ".com"
    }
    fs.accessSync(candidate, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

const normalizeGitExecutableCandidate = (candidate) => {
  if (typeof candidate !== "string") {
    return null
  }
  const trimmed = candidate.trim()
  if (!trimmed) {
    return null
  }

  const ext = path.extname(trimmed).toLowerCase()
  if (ext === ".cmd" || ext === ".bat" || ext === ".com") {
    const exeCandidate = trimmed.slice(0, -ext.length) + ".exe"
    if (isExecutableFile(exeCandidate)) {
      return exeCandidate
    }
  }

  return trimmed
}

const isSafeSimpleGitBinary = (candidate) =>
  typeof candidate === "string" && SIMPLE_GIT_SAFE_BINARY_PATTERN.test(candidate)

const isGuardedSimpleGitEnvKey = (key) => {
  const normalized = String(key || "")
    .toLowerCase()
    .trim()
  if (!normalized || SIMPLE_GIT_ALLOWED_ENV_KEY_SET.has(normalized)) {
    return false
  }
  return normalized.startsWith("git_") || SIMPLE_GIT_GUARDED_ENV_KEYS.has(normalized)
}

const sanitizeSimpleGitEnv = (env) => {
  const sanitized = {}
  for (const [key, value] of Object.entries(env || {})) {
    if (typeof value !== "string" || isGuardedSimpleGitEnvKey(key)) {
      continue
    }
    sanitized[key] = value
  }
  return sanitized
}

const createSimpleGit = (options = {}) => {
  const { env, unsafe, ...rest } = options
  const clientOptions = {
    ...rest,
    allowEnvironment: SIMPLE_GIT_ALLOWED_ENV_KEYS,
    unsafe: {
      // This runtime writes core.sshCommand, credential.helper, and GIT_EDITOR=true.
      // Other guarded categories (includes, trailers, abbreviated options) stay blocked.
      allowUnsafeCredentialHelper: true,
      allowUnsafeEditor: true,
      allowUnsafeSshCommand: true,
      ...unsafe,
    },
  }

  const create = () => {
    const git = simpleGit(clientOptions)
    if (env) {
      git.env(sanitizeSimpleGitEnv(env))
    }
    return git
  }

  if (!unsafe?.allowUnsafeCustomBinary) {
    return create()
  }

  const originalWarn = console.warn
  console.warn = (...args) => {
    if (String(args[0] || "").includes(SIMPLE_GIT_UNSAFE_BINARY_WARNING)) {
      return
    }
    originalWarn("simple-git warning while creating custom binary client")
  }

  try {
    return create()
  } finally {
    console.warn = originalWarn
  }
}

const listPathExecutableCandidates = (binaryName) => {
  const currentPath = process.env.PATH || ""
  const seen = new Set()
  const matches = []
  for (const segment of currentPath.split(path.delimiter)) {
    const dir = typeof segment === "string" ? segment.trim() : ""
    if (!dir || seen.has(dir)) {
      continue
    }
    seen.add(dir)
    matches.push(path.join(dir, binaryName))
  }
  return matches
}

const listWindowsGitInstallCandidates = () => {
  const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LocalAppData]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)

  const candidates = []
  for (const root of roots) {
    candidates.push(path.join(root, "Git", "cmd", "git.exe"))
    candidates.push(path.join(root, "Git", "bin", "git.exe"))
    candidates.push(path.join(root, "Git", "mingw64", "bin", "git.exe"))
    candidates.push(path.join(root, "Programs", "Git", "cmd", "git.exe"))
    candidates.push(path.join(root, "Programs", "Git", "bin", "git.exe"))
  }
  return candidates
}

const resolveGitBinary = () => {
  if (process.platform !== "win32") {
    return "git"
  }
  if (resolvedGitBinary) {
    return resolvedGitBinary
  }

  const explicit = [process.env.GIT_BINARY, process.env.AX_CODE_DESKTOP_GIT_BINARY]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
  for (const candidate of explicit) {
    const normalized = normalizeGitExecutableCandidate(candidate)
    if (isExecutableFile(normalized)) {
      resolvedGitBinary = normalized
      return resolvedGitBinary
    }
  }

  const pathDiscovered = [...listPathExecutableCandidates("git.exe"), ...listPathExecutableCandidates("git")]
    .map(normalizeGitExecutableCandidate)
    .filter(Boolean)
    .filter((candidate) => isExecutableFile(candidate))
  if (pathDiscovered.length > 0) {
    resolvedGitBinary = "git"
    return resolvedGitBinary
  }

  const discovered = [...listWindowsGitInstallCandidates()]
    .map(normalizeGitExecutableCandidate)
    .filter(Boolean)
    .filter((candidate) => isExecutableFile(candidate))

  const preferredExe =
    discovered.find((candidate) => isSafeSimpleGitBinary(candidate) && candidate.toLowerCase().endsWith(".exe")) ||
    discovered.find((candidate) => candidate.toLowerCase().endsWith(".exe"))
  resolvedGitBinary = preferredExe || discovered[0] || "git.exe"
  return resolvedGitBinary
}

const getGitBinary = () => resolveGitBinary()

/**
 * Escape an SSH key path for use in core.sshCommand.
 * Handles Windows/Unix differences and prevents command injection.
 */
function escapeSshKeyPath(sshKeyPath) {
  const isWindows = process.platform === "win32"

  // Normalize path first on Windows (convert backslashes to forward slashes)
  let normalizedPath = sshKeyPath
  if (isWindows) {
    normalizedPath = sshKeyPath.replace(/\\/g, "/")
  }

  // Validate: reject paths with characters that could enable injection
  // Allow only alphanumeric, path separators, dots, dashes, underscores, spaces, and colons (for Windows drives)
  // Note: backslash is not in this list since we've already normalized Windows paths
  const dangerousChars = /[`$!"';&|<>(){}[\]*?#~]/
  if (dangerousChars.test(normalizedPath)) {
    throw new Error(`SSH key path contains invalid characters: ${sshKeyPath}`)
  }

  if (isWindows) {
    // On Windows, Git (via MSYS/MinGW) expects Unix-style paths
    // Convert "C:/path" to "/c/path" for MSYS compatibility
    let unixPath = normalizedPath
    const driveMatch = unixPath.match(/^([A-Za-z]):\//)
    if (driveMatch) {
      unixPath = `/${driveMatch[1].toLowerCase()}${unixPath.slice(2)}`
    }

    // Use single quotes for the path (prevents shell interpretation)
    return `'${unixPath}'`
  } else {
    // On Unix, use single quotes and escape any single quotes in the path
    // Single quotes prevent all shell interpretation except for single quotes themselves
    const escaped = normalizedPath.replace(/'/g, "'\\''")
    return `'${escaped}'`
  }
}

/**
 * Build the SSH command string for git config
 */
function buildSshCommand(sshKeyPath) {
  const escapedPath = escapeSshKeyPath(sshKeyPath)
  return `ssh -i ${escapedPath} -o IdentitiesOnly=yes`
}

const isSocketPath = async (candidate) => {
  if (!candidate || typeof candidate !== "string") {
    return false
  }
  try {
    const stat = await fsp.stat(candidate)
    return typeof stat.isSocket === "function" && stat.isSocket()
  } catch {
    return false
  }
}

const resolveSshAuthSock = async () => {
  const existing = (process.env.SSH_AUTH_SOCK || "").trim()
  if (existing) {
    return existing
  }

  if (process.platform === "win32") {
    return null
  }

  const gpgSock = path.join(os.homedir(), ".gnupg", "S.gpg-agent.ssh")
  if (await isSocketPath(gpgSock)) {
    return gpgSock
  }

  const runGpgconf = async (args) => {
    for (const candidate of gpgconfCandidates) {
      try {
        const { stdout } = await execFileAsync(candidate, args)
        return String(stdout || "")
      } catch {
        continue
      }
    }
    return ""
  }

  const candidate = (await runGpgconf(["--list-dirs", "agent-ssh-socket"])).trim()
  if (candidate && (await isSocketPath(candidate))) {
    return candidate
  }

  if (candidate) {
    await runGpgconf(["--launch", "gpg-agent"])
    const retried = (await runGpgconf(["--list-dirs", "agent-ssh-socket"])).trim()
    if (retried && (await isSocketPath(retried))) {
      return retried
    }
  }

  return null
}

const buildGitEnv = async () => {
  const env = { ...process.env }
  if (!env.SSH_AUTH_SOCK || !env.SSH_AUTH_SOCK.trim()) {
    const resolved = await resolveSshAuthSock()
    if (resolved) {
      env.SSH_AUTH_SOCK = resolved
    }
  }
  // Read-only commands refresh the index as an optional side effect of status and
  // diff. That refresh takes .git/index.lock for a moment, which makes a git
  // command the user runs in a terminal fail with "Unable to create
  // index.lock". Required locks are still taken, so mutations keep working.
  env.GIT_OPTIONAL_LOCKS = "0"
  // Server-side git must never block on a credential prompt: an HTTPS remote
  // without a helper (or an ssh askpass with no tty) would otherwise hang the
  // HTTP request and strand the git child forever. An explicit user setting
  // still wins.
  if (env.GIT_TERMINAL_PROMPT === undefined) {
    env.GIT_TERMINAL_PROMPT = "0"
  }
  return env
}

const createGit = async (directory) => {
  const env = await buildGitEnv()
  const spawnOptions = { windowsHide: true }
  const binary = getGitBinary()
  const hasCustomBinary = typeof binary === "string" && binary.trim() && binary !== "git" && binary !== "git.exe"
  const unsafe = hasCustomBinary ? { allowUnsafeCustomBinary: true } : undefined
  if (!directory) {
    return createSimpleGit({ env, spawnOptions, binary, unsafe })
  }
  return createSimpleGit({
    baseDir: normalizeDirectoryPath(directory),
    env,
    spawnOptions,
    binary,
    unsafe,
  })
}

const normalizeDirectoryPath = (value) => {
  if (typeof value !== "string") {
    return value
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return trimmed
  }

  if (trimmed === "~") {
    return os.homedir()
  }

  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2))
  }

  return trimmed
}

const getGitIndexMutationQueueKey = (directory) => {
  const normalized = normalizeDirectoryPath(directory)
  if (!normalized) {
    return ""
  }
  return path.resolve(normalized)
}

const withGitIndexMutationQueue = async (directory, task) => {
  let key = getGitIndexMutationQueueKey(directory)
  try {
    const directoryPath = normalizeDirectoryPath(directory)
    if (directoryPath) {
      const git = await createGit(directoryPath)
      key = await resolveGitRepositoryRoot(directoryPath, git)
    }
  } catch {
    // Fall back to the normalized directory key when the repo root is unavailable.
  }
  if (!key) {
    return task()
  }

  const previous = gitIndexMutationQueues.get(key) || Promise.resolve()
  const current = previous.catch(() => {}).then(task)
  const tail = current.catch(() => {})
  gitIndexMutationQueues.set(key, tail)

  try {
    return await current
  } finally {
    if (gitIndexMutationQueues.get(key) === tail) {
      gitIndexMutationQueues.delete(key)
    }
  }
}

const normalizeStringList = (values) =>
  Array.from(
    new Set((Array.isArray(values) ? values : [values]).map((value) => String(value || "").trim()).filter(Boolean)),
  )

// Paths are literal: `" foo"` is a real file name, and trimming it staged and
// committed `foo` instead (or dropped the entry from a commit-all).
const normalizeFilePathList = (paths) =>
  Array.from(
    new Set(
      (Array.isArray(paths) ? paths : [paths]).filter(
        (value) => typeof value === "string" && value.length > 0,
      ),
    ),
  )

// Only ".." itself or a leading "../" leaves the repository: a directory whose *name* starts with
// ".." (`..cache/file.txt`) is a normal path inside it, and rejecting it made those files
// unstageable. `fs/routes.js` isPathWithinRoot states the same rule.
export const leavesRepositoryRoot = (relative, pathTools = path) =>
  relative === ".." || relative.startsWith(`..${pathTools.sep}`) || pathTools.isAbsolute(relative)

export const validateRepositoryFilePaths = (directoryPath, filePaths, pathTools = path) => {
  const repoRoot = pathTools.resolve(directoryPath)

  for (const filePath of filePaths) {
    const absoluteTarget = pathTools.resolve(repoRoot, filePath)
    const relative = pathTools.relative(repoRoot, absoluteTarget)
    if (leavesRepositoryRoot(relative, pathTools)) {
      throw new Error(`Path is outside repository: ${filePath}`)
    }
  }
}

const toGitPath = (value) => value.replace(/\\/g, "/")

const isInsideOrSameDirectory = (root, target) => {
  const relative = path.relative(root, target)
  return relative === "" || !leavesRepositoryRoot(relative, path)
}

export const resolveRepositoryFilePath = (repoRoot, filePath) => {
  const absolutePath = path.resolve(repoRoot, filePath)
  if (!isInsideOrSameDirectory(repoRoot, absolutePath)) {
    throw new Error(`Path is outside repository: ${filePath}`)
  }
  return absolutePath
}

const resolveGitRepositoryRoot = async (directoryPath, git) => {
  const topLevel = await git.raw(["rev-parse", "--show-toplevel"])
  const normalizedTopLevel = topLevel.trim()
  return path.isAbsolute(normalizedTopLevel)
    ? path.resolve(normalizedTopLevel)
    : path.resolve(directoryPath, normalizedTopLevel)
}

const createRepositoryGitContext = async (directory) => {
  const directoryPath = normalizeDirectoryPath(directory)
  const directoryGit = await createGit(directoryPath)
  const repoRoot = await resolveGitRepositoryRoot(directoryPath, directoryGit)
  const git = path.resolve(directoryPath) === repoRoot ? directoryGit : await createGit(repoRoot)
  return { directoryPath, directoryGit, repoRoot, git }
}

const resolveGitInternalPath = async (repoRoot, git, gitPath) => {
  const resolved = await git.raw(["rev-parse", "--git-path", gitPath])
  const rawPath = resolved.trim()
  const absolutePath = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(repoRoot, rawPath)
  const gitDirRaw = await git.raw(["rev-parse", "--absolute-git-dir"]).catch(() => "")
  const gitDir = gitDirRaw.trim()
  if (!path.isAbsolute(gitDir)) throw new Error("Git did not return an absolute metadata directory")

  const relative = path.relative(gitDir, absolutePath)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Git internal path is outside git directory: ${gitPath}`)
  }
  // Git metadata can contain symlinks. Check the filesystem target as well as
  // the lexical path before reading state or removing operation directories.
  const canonicalGitDir = await fsp.realpath(gitDir)
  let canonicalPath
  try {
    canonicalPath = await fsp.realpath(absolutePath)
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
    // State files may not exist. Resolve the parent so a dangling final link
    // cannot redirect a later write or removal outside the metadata directory.
    const entry = await fsp.lstat(absolutePath).catch((failure) => {
      if (failure?.code !== "ENOENT") throw failure
      return null
    })
    if (entry?.isSymbolicLink()) throw new Error("Git state path is a dangling symlink")
    const parent = await fsp.realpath(path.dirname(absolutePath))
    canonicalPath = path.join(parent, path.basename(absolutePath))
  }
  const canonicalRelative = path.relative(canonicalGitDir, canonicalPath)
  if (canonicalRelative.startsWith("..") || path.isAbsolute(canonicalRelative)) {
    throw new Error(`Git state symlink is outside git directory: ${gitPath}`)
  }
  return canonicalPath
}

const readGitInternalText = async (repoRoot, git, gitPath) => {
  const resolvedPath = await resolveGitInternalPath(repoRoot, git, gitPath).catch(() => "")
  if (!resolvedPath) {
    return ""
  }
  return fsp.readFile(resolvedPath, "utf8").catch(() => "")
}

// Rebase state lives in .git/rebase-merge (merge backend) or .git/rebase-apply
// (apply backend and git am). head-name holds the branch being rebased and onto
// the base it is replayed on; REBASE_HEAD instead points at the commit being
// replayed, so it cannot describe the operation on its own.
const readRebaseInProgress = async (repoRoot, git) => {
  for (const stateDir of ["rebase-merge", "rebase-apply"]) {
    const stateDirPath = await resolveGitInternalPath(repoRoot, git, stateDir).catch(() => "")
    const active = stateDirPath
      ? await fsp
          .stat(stateDirPath)
          .then((stat) => stat.isDirectory())
          .catch(() => false)
      : false
    if (!active) {
      continue
    }

    const headName = (await readGitInternalText(repoRoot, git, `${stateDir}/head-name`)).trim()
    const onto = (await readGitInternalText(repoRoot, git, `${stateDir}/onto`)).trim()
    return {
      headName: headName.replace(/^refs\/heads\//, ""),
      onto: onto.slice(0, 7),
    }
  }

  return null
}

const resolveGitFileContext = async (directoryPath, git, filePath, repoRootOverride = null) => {
  const repoRoot = repoRootOverride || (await resolveGitRepositoryRoot(directoryPath, git))
  const candidates = Array.from(new Set([path.resolve(repoRoot, filePath), path.resolve(directoryPath, filePath)]))

  for (const absolutePath of candidates) {
    if (!isInsideOrSameDirectory(repoRoot, absolutePath)) {
      continue
    }

    const repoPath = toGitPath(path.relative(repoRoot, absolutePath))
    // The repository root is not a file. An empty pathspec (`:(literal)`) makes
    // restore/clean match every file, so a revert of "." would discard the
    // entire worktree.
    if (!repoPath) {
      continue
    }
    const existsInWorktree = await fsp
      .stat(absolutePath)
      .then((stat) => stat.isFile())
      .catch(() => false)
    const existsInIndex = await git
      .raw(["cat-file", "-e", `:${repoPath}`])
      .then(() => true)
      .catch(() => false)
    const existsInHead = await git
      .raw(["cat-file", "-e", `HEAD:${repoPath}`])
      .then(() => true)
      .catch(() => false)

    if (existsInWorktree || existsInIndex || existsInHead) {
      return {
        absolutePath,
        repoPath,
        repoRoot,
      }
    }
  }

  throw new Error("Invalid file path")
}

const cleanBranchName = (branch) => {
  if (!branch) {
    return branch
  }
  if (branch.startsWith("refs/heads/")) {
    return branch.substring("refs/heads/".length)
  }
  if (branch.startsWith("heads/")) {
    return branch.substring("heads/".length)
  }
  if (branch.startsWith("refs/")) {
    return branch.substring("refs/".length)
  }
  return branch
}

const getAxCodeDataPath = () => {
  const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")
  return path.join(xdgDataHome, "ax-code")
}

// The name the runtime derives from a requested worktree name (AX Code `Worktree.slug`).
const slugWorktreeName = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
}

const parseWorktreePorcelain = (raw) => {
  const lines = String(raw || "")
    .split("\n")
    .map((line) => line.trim())
  const entries = []
  let current = null

  for (const line of lines) {
    if (!line) {
      if (current?.worktree) {
        entries.push(current)
      }
      current = null
      continue
    }

    if (line.startsWith("worktree ")) {
      if (current?.worktree) {
        entries.push(current)
      }
      current = { worktree: line.substring("worktree ".length).trim() }
      continue
    }

    if (!current) {
      continue
    }

    if (line === "bare") {
      // A bare repository is listed as a worktree by `git worktree list`; it has no work tree to check
      // out, so the callers that offer worktrees must not treat it as one.
      current.bare = true
      continue
    }

    if (line.startsWith("HEAD ")) {
      current.head = line.substring("HEAD ".length).trim()
      continue
    }

    if (line.startsWith("branch ")) {
      const branchRef = line.substring("branch ".length).trim()
      current.branchRef = branchRef
      current.branch = cleanBranchName(branchRef)
    }
  }

  if (current?.worktree) {
    entries.push(current)
  }

  return entries
}

const canonicalPath = async (input) => {
  const absolutePath = path.resolve(input)
  const realPath = await fsp.realpath(absolutePath).catch(() => absolutePath)
  const normalized = path.normalize(realPath)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

const normalizeStartRef = (value) => {
  const trimmed = String(value || "").trim()
  if (!trimmed) {
    return "HEAD"
  }
  // The start ref is positional in `git worktree add <dir> <commit-ish>`: an
  // option-looking value ("--force", "--detach") is eaten by git's option
  // parser and the intended ref is silently dropped.
  if (trimmed.startsWith("-")) {
    throw new Error(`Invalid start ref: ${trimmed}`)
  }
  return trimmed
}

function isValidCommitHash(hash) {
  return typeof hash === "string" && /^[0-9a-fA-F]{7,40}$/.test(hash)
}

/** Reject values git's option parser would read as flags instead of positional args. */
/** A repo-relative path as a literal git pathspec: names containing [ * ? would
 * otherwise glob sibling files (restore/clean/add affect them too). */
const literalPathspec = (repoPath) => `:(literal)${repoPath}`

const rejectOptionLikeValue = (value, label) => {
  const text = String(value || "").trim()
  if (text.startsWith("-")) {
    throw new Error(`Invalid ${label}: ${text}`)
  }
  return text
}

const parseRemoteBranchRef = (value) => {
  const trimmed = String(value || "").trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith("refs/remotes/")) {
    const rest = trimmed.substring("refs/remotes/".length)
    const slashIndex = rest.indexOf("/")
    if (slashIndex <= 0 || slashIndex === rest.length - 1) {
      return null
    }
    return {
      remote: rest.slice(0, slashIndex),
      branch: rest.slice(slashIndex + 1),
      remoteRef: rest,
      fullRef: `refs/remotes/${rest}`,
    }
  }

  if (trimmed.startsWith("remotes/")) {
    return parseRemoteBranchRef(`refs/${trimmed}`)
  }

  const slashIndex = trimmed.indexOf("/")
  if (slashIndex <= 0 || slashIndex === trimmed.length - 1) {
    return null
  }

  return {
    remote: trimmed.slice(0, slashIndex),
    branch: trimmed.slice(slashIndex + 1),
    remoteRef: trimmed,
    fullRef: `refs/remotes/${trimmed}`,
  }
}

const resolveRemoteBranchRef = async (primaryWorktree, value) => {
  const raw = String(value || "").trim()
  const parsed = parseRemoteBranchRef(raw)
  if (!parsed) {
    return null
  }

  if (raw.startsWith("refs/remotes/") || raw.startsWith("remotes/")) {
    return parsed
  }

  const localRef = `refs/heads/${raw}`
  const localExists = await runGitCommand(primaryWorktree, ["show-ref", "--verify", "--quiet", localRef])
  if (localExists.success) {
    return null
  }

  return parsed
}

const normalizeUpstreamTarget = (remote, branch) => {
  const remoteName = String(remote || "").trim()
  const branchName = String(branch || "").trim()
  if (!remoteName || !branchName) {
    return null
  }
  return {
    remote: remoteName,
    branch: branchName,
    full: `${remoteName}/${branchName}`,
  }
}

const parseGitErrorText = (error) => {
  const stderr = typeof error?.stderr === "string" ? error.stderr : ""
  const stdout = typeof error?.stdout === "string" ? error.stdout : ""
  const message = typeof error?.message === "string" ? error.message : ""
  return [stderr, stdout, message]
    .map((chunk) => String(chunk || "").trim())
    .filter(Boolean)
    .join("\n")
    .trim()
}

const parseAheadBehindCounts = (value) => {
  const [aheadRaw, behindRaw] = String(value || "")
    .trim()
    .split(/\s+/)
  const ahead = parseInt(aheadRaw, 10)
  const behind = parseInt(behindRaw, 10)
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
    return null
  }
  return { ahead, behind }
}

const getRemoteExistenceCacheKey = (directory, remoteName) => {
  const normalizedDirectory = normalizeDirectoryPath(directory) || ""
  return `${path.resolve(normalizedDirectory)}\0${remoteName}`
}

const REMOTE_EXISTENCE_CACHE_MAX_ENTRIES = 500

const writeRemoteExistenceCache = (key, exists) => {
  // One entry per (directory, remote): bounded so long-lived servers do not
  // accumulate an entry for every directory they ever probed.
  if (remoteExistenceCache.size >= REMOTE_EXISTENCE_CACHE_MAX_ENTRIES && !remoteExistenceCache.has(key)) {
    const oldestKey = remoteExistenceCache.keys().next().value
    if (oldestKey !== undefined) remoteExistenceCache.delete(oldestKey)
  }
  remoteExistenceCache.set(key, { exists, checkedAt: Date.now() })
}

const hasRemote = async (git, directory, remoteName) => {
  const remote = String(remoteName || "").trim()
  if (!remote) {
    return false
  }

  const key = getRemoteExistenceCacheKey(directory, remote)
  const cached = remoteExistenceCache.get(key)
  if (cached && Date.now() - cached.checkedAt < REMOTE_EXISTENCE_CACHE_TTL_MS) {
    return cached.exists
  }

  const exists = await git
    .raw(["remote", "get-url", remote])
    .then((value) => String(value || "").trim().length > 0)
    .catch(() => false)

  writeRemoteExistenceCache(key, exists)
  return exists
}

const buildRawGitOptions = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value || "").trim()).filter(Boolean)
  }

  if (!raw || typeof raw !== "object") {
    return []
  }

  return Object.entries(raw).flatMap(([key, value]) => {
    const option = String(key || "").trim()
    if (!option || value === false) {
      return []
    }
    if (value === true || value == null) {
      return [option]
    }
    return [option, String(value)]
  })
}

const getRemoteBranchComparison = async (git, remoteName, branchName) => {
  const remote = String(remoteName || "").trim()
  const branch = String(branchName || "").trim()
  if (!remote || !branch) {
    return null
  }

  const remoteRef = `refs/remotes/${remote}/${branch}`
  const exists = await git
    .raw(["rev-parse", "--verify", remoteRef])
    .then((value) => String(value || "").trim())
    .catch(() => "")
  if (!exists) {
    return null
  }

  const countsRaw = await git
    .raw(["rev-list", "--left-right", "--count", `HEAD...${remoteRef}`])
    .then((value) => String(value || "").trim())
    .catch(() => "")
  const counts = parseAheadBehindCounts(countsRaw)
  if (!counts) {
    return null
  }

  return {
    remote,
    branch,
    ahead: counts.ahead,
    behind: counts.behind,
  }
}

const isNotGitRepositoryError = (error) => {
  const text = parseGitErrorText(error)
  return /not a git repository/i.test(text)
}

const runGitCommand = async (cwd, args, options = {}) => {
  try {
    const { stdout, stderr } = await execFileAsync(getGitBinary(), args, {
      cwd,
      env: { ...(await buildGitEnv()), ...(options.env || {}) },
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
      ...(options.timeout ? { timeout: options.timeout } : {}),
    })
    return {
      success: true,
      exitCode: 0,
      stdout: String(stdout || ""),
      stderr: String(stderr || ""),
    }
  } catch (error) {
    return {
      success: false,
      exitCode: typeof error?.code === "number" ? error.code : 1,
      stdout: String(error?.stdout || ""),
      stderr: String(error?.stderr || ""),
      message: parseGitErrorText(error),
    }
  }
}

const resolveGitCommitFilePath = async (repoRoot, hash, candidates) => {
  for (const candidate of candidates) {
    const [originalTreeResult, modifiedTreeResult] = await Promise.all([
      runGitCommand(repoRoot, ["ls-tree", "--name-only", `${hash}^`, "--", literalPathspec(candidate)]),
      runGitCommand(repoRoot, ["ls-tree", "--name-only", hash, "--", literalPathspec(candidate)]),
    ])

    if (
      (originalTreeResult.success && originalTreeResult.stdout.trim()) ||
      (modifiedTreeResult.success && modifiedTreeResult.stdout.trim())
    ) {
      return candidate
    }
  }

  throw new Error("Invalid file path")
}

/**
 * Run a rebase/merge step with an editor that never prompts.
 *
 * simple-git's own `rebase()` resolves even when git refuses the step — it answers the failure text as
 * its value — so the try/catch around it treated every unresolved conflict as a successful continue.
 */
const runSequencerStep = (cwd, args) => runGitCommand(cwd, args, { env: { GIT_EDITOR: "true" } })

const runGitCommandOrThrow = async (cwd, args, fallbackMessage, options = {}) => {
  const result = await runGitCommand(cwd, args, options)
  if (!result.success) {
    throw new Error(result.message || fallbackMessage || "Git command failed")
  }
  return result
}

// `git apply` reads its patch from stdin, and the promisified execFile cannot feed a stream, so
// this wraps spawn with the same result shape as runGitCommand.
const runGitCommandWithInput = async (cwd, args, input, options = {}) => {
  const env = { ...(await buildGitEnv()), ...(options.env || {}) }

  return await new Promise((resolve) => {
    let child
    try {
      child = spawn(getGitBinary(), args, { cwd, env, windowsHide: true })
    } catch (error) {
      resolve({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "",
        message: error instanceof Error ? error.message : String(error),
      })
      return
    }

    let stdout = ""
    let stderr = ""
    let settled = false
    let timer = null
    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }
    if (options.timeout) {
      timer = setTimeout(() => {
        child.kill("SIGKILL")
      }, options.timeout)
      if (typeof timer.unref === "function") timer.unref()
    }
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    // git may stop reading before the whole patch is written; an EPIPE here must not crash the server.
    child.stdin.on("error", () => {})
    child.stdin.end(input)

    child.on("error", (error) => {
      finish({ success: false, exitCode: 1, stdout, stderr, message: parseGitErrorText(error) })
    })
    child.on("close", (code) => {
      const exitCode = typeof code === "number" ? code : 1
      finish({
        success: exitCode === 0,
        exitCode,
        stdout,
        stderr,
        message:
          exitCode === 0 ? "" : parseGitErrorText({ stderr, stdout, message: `git exited with code ${exitCode}` }),
      })
    })
  })
}

const ensureAxCodeProjectId = async (primaryWorktree) => {
  const gitDir = path.join(primaryWorktree, ".git")
  const idFile = path.join(gitDir, "ax-code")
  const existing = await fsp
    .readFile(idFile, "utf8")
    .then((value) => value.trim())
    .catch(() => "")
  if (existing) {
    return existing
  }

  const rootsResult = await runGitCommandOrThrow(
    primaryWorktree,
    ["rev-list", "--max-parents=0", "--all"],
    "Failed to resolve repository roots",
  )

  const roots = rootsResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

  const projectId = roots[0] || ""
  if (!projectId) {
    throw new Error("Failed to derive AX Code project ID")
  }

  await fsp.mkdir(gitDir, { recursive: true }).catch(() => undefined)
  await fsp.writeFile(idFile, projectId, "utf8").catch(() => undefined)

  return projectId
}

const resolveWorktreeProjectContext = async (directory) => {
  const directoryPath = normalizeDirectoryPath(directory)
  if (!directoryPath) {
    throw new Error("Directory is required")
  }

  // A bare repository has no work tree, so `--show-toplevel` fails there — but the directory is still a
  // repository, and every worktree command runs from it. Refusing here left a bare checkout unable to
  // create, preview or validate a worktree at all.
  const topResult = await runGitCommand(directoryPath, ["rev-parse", "--show-toplevel"])
  const sandbox = topResult.success ? path.resolve(directoryPath, topResult.stdout.trim()) : directoryPath

  const commonResult = await runGitCommandOrThrow(
    sandbox,
    ["rev-parse", "--git-common-dir"],
    "Failed to resolve git common directory",
  )
  const commonDir = path.resolve(sandbox, commonResult.stdout.trim())
  // For a work tree the common directory is its `.git`, whose parent is the primary worktree; a bare
  // repository answers with itself, and its parent would hand the project to the wrong directory.
  const primaryWorktree = commonDir === sandbox ? sandbox : path.dirname(commonDir)
  const projectID = await ensureAxCodeProjectId(primaryWorktree)
  const worktreeRoot = path.join(getAxCodeDataPath(), "worktree", projectID)

  return {
    projectID,
    sandbox,
    primaryWorktree,
    worktreeRoot,
  }
}

const listWorktreeEntries = async (directory) => {
  const rawResult = await runGitCommandOrThrow(
    directory,
    ["worktree", "list", "--porcelain"],
    "Failed to list git worktrees",
  )
  return parseWorktreePorcelain(rawResult.stdout)
}

const resolveBranchForExistingMode = async (primaryWorktree, existingBranch, preferredBranchName) => {
  const requested = String(existingBranch || "").trim()
  if (!requested) {
    throw new Error("existingBranch is required in existing mode")
  }

  const normalizedLocal = cleanBranchName(requested)
  const localRef = `refs/heads/${normalizedLocal}`
  const localExists = await runGitCommand(primaryWorktree, ["show-ref", "--verify", "--quiet", localRef])
  if (localExists.success) {
    return {
      localBranch: normalizedLocal,
      checkoutRef: normalizedLocal,
      createLocalBranch: false,
      remoteRef: null,
    }
  }

  const remoteRef = parseRemoteBranchRef(requested)
  if (!remoteRef) {
    throw new Error(`Branch not found: ${requested}`)
  }

  const remoteExists = await runGitCommand(primaryWorktree, ["show-ref", "--verify", "--quiet", remoteRef.fullRef])
  if (!remoteExists.success) {
    // Best-effort fetch of the ref; remember the failure so a fetch error
    // (network/auth/unreachable remote) isn't masked as "branch not found".
    let fetchError = null
    await fetchRemoteBranchRef(primaryWorktree, remoteRef.remote, remoteRef.branch).catch((error) => {
      fetchError = error
    })
    const recheck = await runGitCommand(primaryWorktree, ["show-ref", "--verify", "--quiet", remoteRef.fullRef])
    if (!recheck.success) {
      if (fetchError) {
        const detail = fetchError instanceof Error ? fetchError.message : String(fetchError)
        throw new Error(`Failed to fetch remote branch "${requested}": ${detail}`)
      }
      throw new Error(`Remote branch not found: ${requested}`)
    }
  }

  const localBranch = cleanBranchName(preferredBranchName || remoteRef.branch || requested)
  if (!localBranch) {
    throw new Error("Failed to resolve local branch name for existing branch worktree")
  }

  return {
    localBranch,
    checkoutRef: remoteRef.remoteRef,
    createLocalBranch: true,
    remoteRef,
  }
}

const findBranchInUse = async (primaryWorktree, localBranchName) => {
  if (!localBranchName) {
    return null
  }
  const entries = await listWorktreeEntries(primaryWorktree)
  const targetRef = `refs/heads/${localBranchName}`
  const targetClean = cleanBranchName(targetRef)
  return (
    entries.find((entry) => {
      const entryRef = String(entry.branchRef || "").trim()
      const entryClean = cleanBranchName(entryRef || entry.branch || "")
      return entryRef === targetRef || entryClean === targetClean
    }) || null
  )
}

// ADR-020: the runtime creates and removes worktrees; this server reaches it through the SDK client
// the route layer hands in (`getWorktreeClient(directory)`), so tests can stub it.
const WORKTREE_RUNTIME_UNAVAILABLE = "The AX Code runtime is not available to manage worktrees"

const resolveWorktreeRuntimeClient = (deps, directory) => {
  const getWorktreeClient = deps?.getWorktreeClient
  if (typeof getWorktreeClient !== "function") {
    throw new Error(WORKTREE_RUNTIME_UNAVAILABLE)
  }
  const client = getWorktreeClient(directory)
  if (!client?.worktree) {
    throw new Error(WORKTREE_RUNTIME_UNAVAILABLE)
  }
  return client
}

const runtimeErrorMessage = (error) => {
  if (typeof error === "string") {
    return error.trim()
  }
  if (!error || typeof error !== "object") {
    return ""
  }
  const candidates = [error.message, error.data?.message, error.error?.message, error.error]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }
  return ""
}

// SDK calls answer `{ data }` or `{ error, response }` instead of throwing; an error result is the
// runtime's refusal, and its message is what the user needs to see.
const unwrapRuntimeResult = (result, fallbackMessage) => {
  if (result?.error !== undefined && result?.error !== null) {
    throw new Error(runtimeErrorMessage(result.error) || fallbackMessage)
  }
  if (result?.data === undefined || result?.data === null) {
    const status = result?.response?.status
    throw new Error(status ? `${fallbackMessage}: the runtime answered ${status}` : fallbackMessage)
  }
  return result.data
}

const ensureRemoteWithUrl = async (primaryWorktree, remoteName, remoteUrl) => {
  const name = String(remoteName || "").trim()
  const url = String(remoteUrl || "").trim()
  if (!name || !url) {
    return
  }

  const getUrl = await runGitCommand(primaryWorktree, ["remote", "get-url", name])
  if (getUrl.success) {
    const currentUrl = String(getUrl.stdout || "").trim()
    if (currentUrl !== url) {
      await runGitCommandOrThrow(primaryWorktree, ["remote", "set-url", name, url], "Failed to update git remote URL")
    }
    return
  }

  await runGitCommandOrThrow(primaryWorktree, ["remote", "add", name, url], "Failed to add git remote")
  // The remote did not exist a moment ago: a cached negative answer from that
  // window must not survive the add.
  remoteExistenceCache.delete(getRemoteExistenceCacheKey(primaryWorktree, name))
}

const fetchRemoteBranchRef = async (primaryWorktree, remoteName, branchName) => {
  const remote = String(remoteName || "").trim()
  const branch = String(branchName || "").trim()
  if (!remote || !branch) {
    return
  }

  const refspec = `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`
  await runGitCommandOrThrow(primaryWorktree, ["fetch", remote, refspec], `Failed to fetch ${remote}/${branch}`)
}

const checkRemoteBranchExists = async (primaryWorktree, remoteName, branchName, remoteUrl = "") => {
  const remote = String(remoteName || "").trim()
  const branch = String(branchName || "").trim()
  const url = String(remoteUrl || "").trim()
  if (!remote || !branch) {
    return { success: false, found: false }
  }

  const target = url || remote
  const lsRemote = await runGitCommand(primaryWorktree, ["ls-remote", "--heads", target, `refs/heads/${branch}`])
  if (!lsRemote.success) {
    return { success: false, found: false }
  }

  return {
    success: true,
    found: Boolean(String(lsRemote.stdout || "").trim()),
  }
}

const setBranchTrackingFallback = async (worktreeDirectory, localBranch, upstream) => {
  await runGitCommandOrThrow(
    worktreeDirectory,
    ["config", `branch.${localBranch}.remote`, upstream.remote],
    `Failed to set branch.${localBranch}.remote`,
  )
  await runGitCommandOrThrow(
    worktreeDirectory,
    ["config", `branch.${localBranch}.merge`, `refs/heads/${upstream.branch}`],
    `Failed to set branch.${localBranch}.merge`,
  )
}

const applyUpstreamConfiguration = async (args) => {
  const {
    primaryWorktree,
    worktreeDirectory,
    localBranch,
    setUpstream,
    upstreamRemote,
    upstreamBranch,
    ensureRemoteName,
    ensureRemoteUrl,
  } = args

  if (!setUpstream) {
    return
  }

  if (ensureRemoteName && ensureRemoteUrl) {
    await ensureRemoteWithUrl(primaryWorktree, ensureRemoteName, ensureRemoteUrl)
  }

  const upstream = normalizeUpstreamTarget(upstreamRemote, upstreamBranch)
  if (!upstream || !localBranch) {
    return
  }

  let fetched = true
  try {
    await fetchRemoteBranchRef(primaryWorktree, upstream.remote, upstream.branch)
  } catch {
    fetched = false
  }

  if (fetched) {
    await runGitCommandOrThrow(
      worktreeDirectory,
      ["branch", `--set-upstream-to=${upstream.full}`, localBranch],
      `Failed to set upstream to ${upstream.full}`,
    )
    return
  }

  await setBranchTrackingFallback(worktreeDirectory, localBranch, upstream)
}

/**
 * Whether a repository's top level is a directory we refuse to treat as a project.
 *
 * An accidental `git init` in the home directory, or a repository at a filesystem root, is never
 * the project the user meant: accepting it made the Git panel run `status` over the whole tree,
 * which takes minutes per refresh and cannot be aborted (the reads there have no timeout).
 */
export const isRefusedRepositoryRoot = (toplevelPath, homePath = os.homedir()) => {
  const resolvedTop = typeof toplevelPath === "string" ? toplevelPath.trim() : ""
  if (!resolvedTop) {
    return false
  }
  // Compare canonical paths: git reports a resolved top level, while the home directory itself
  // can be reached through a symlink (macOS `/var` → `/private/var`, and home symlinks).
  const canonical = (value) => {
    try {
      return fs.realpathSync(value)
    } catch {
      return path.resolve(value)
    }
  }
  const resolved = canonical(resolvedTop)
  if (resolved === path.resolve(path.parse(resolved).root)) {
    return true
  }
  const home = typeof homePath === "string" && homePath ? canonical(homePath) : ""
  return Boolean(home) && resolved === home
}

export async function isGitRepository(directory) {
  const directoryPath = normalizeDirectoryPath(directory)
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    return false
  }

  const result = await runGitCommand(directoryPath, ["rev-parse", "--git-dir"])
  if (!result.success) {
    return false
  }

  const toplevel = await runGitCommand(directoryPath, ["rev-parse", "--show-toplevel"]).catch(() => null)
  const toplevelPath = toplevel?.success ? String(toplevel.stdout ?? "").trim() : ""
  if (!toplevelPath) {
    // A bare repository has no working tree to compare; keep the previous answer for it.
    return true
  }

  return !isRefusedRepositoryRoot(toplevelPath)
}

export async function getGlobalIdentity() {
  const git = await createGit()

  try {
    const userName = await git.getConfig("user.name", "global").catch(() => null)
    const userEmail = await git.getConfig("user.email", "global").catch(() => null)
    const sshCommand = await git.getConfig("core.sshCommand", "global").catch(() => null)

    return {
      userName: userName?.value || null,
      userEmail: userEmail?.value || null,
      sshCommand: sshCommand?.value || null,
    }
  } catch (error) {
    console.error("Failed to get global Git identity:", error)
    return {
      userName: null,
      userEmail: null,
      sshCommand: null,
    }
  }
}

export async function getRemoteUrl(directory, remoteName = "origin") {
  const git = await createGit(directory)

  try {
    const url = await git.remote(["get-url", remoteName])
    return url?.trim() || null
  } catch {
    return null
  }
}

export async function getCurrentIdentity(directory) {
  const git = await createGit(directory)

  try {
    const userName = await git.getConfig("user.name", "local").catch(() => git.getConfig("user.name", "global"))

    const userEmail = await git.getConfig("user.email", "local").catch(() => git.getConfig("user.email", "global"))

    const sshCommand = await git
      .getConfig("core.sshCommand", "local")
      .catch(() => git.getConfig("core.sshCommand", "global"))

    return {
      userName: userName?.value || null,
      userEmail: userEmail?.value || null,
      sshCommand: sshCommand?.value || null,
    }
  } catch (error) {
    console.error("Failed to get current Git identity:", error)
    return {
      userName: null,
      userEmail: null,
      sshCommand: null,
    }
  }
}

export async function hasLocalIdentity(directory) {
  const git = await createGit(directory)

  try {
    const localName = await git.getConfig("user.name", "local").catch(() => null)
    const localEmail = await git.getConfig("user.email", "local").catch(() => null)
    return Boolean(localName?.value || localEmail?.value)
  } catch {
    return false
  }
}

export async function setLocalIdentity(directory, profile) {
  const git = await createGit(directory)

  try {
    await git.addConfig("user.name", profile.userName, false, "local")
    await git.addConfig("user.email", profile.userEmail, false, "local")

    const authType = profile.authType || "ssh"

    if (authType === "ssh" && profile.sshKey) {
      await git.addConfig("core.sshCommand", buildSshCommand(profile.sshKey), false, "local")
      await git.raw(["config", "--local", "--unset", "credential.helper"]).catch(() => {})
    } else if (authType === "token" && profile.host) {
      await git.addConfig("credential.helper", "store", false, "local")
      await git.raw(["config", "--local", "--unset", "core.sshCommand"]).catch(() => {})
    }

    return true
  } catch (error) {
    console.error("Failed to set Git identity:", error)
    throw error
  }
}

// Content identities are blob ids, never file bytes. The file cap and the byte cap match the
// existing new-file stat budget so one status cannot hash an unbounded working tree.
export const GIT_STATUS_CONTENT_ID_MAX_FILES = 200
export const GIT_STATUS_CONTENT_ID_MAX_BYTES = 1024 * 1024
export const GIT_STATUS_CONTENT_ID_TIMEOUT_MS = 10_000
const GIT_BLOB_ID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i

const boundedIdentityOption = (value, fallback) => {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : fallback
}

const gitStatusColumn = (value) => String(value ?? "").trim()

const isSafeGitStatusPath = (repoPath) => {
  if (typeof repoPath !== "string" || repoPath.length === 0 || repoPath.includes("\0")) return false
  if (repoPath === ".." || repoPath.startsWith("../") || repoPath.startsWith("..\\")) return false
  return !leavesRepositoryRoot(repoPath)
}

const normalizeGitBlobId = (value) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim().toLowerCase()
  return GIT_BLOB_ID_PATTERN.test(trimmed) ? trimmed : null
}

const worktreeFileRemoved = (file) => {
  const working = gitStatusColumn(file?.working_dir)
  const index = gitStatusColumn(file?.index)
  return working === "D" || (index === "D" && working === "")
}

const parseGitStageRecords = (raw) => {
  const entries = new Map()
  for (const record of String(raw || "").split("\0")) {
    if (!record) continue
    const tabIndex = record.indexOf("\t")
    if (tabIndex < 0) continue
    const [mode, objectId, stage] = record.slice(0, tabIndex).split(" ")
    const recordPath = record.slice(tabIndex + 1)
    if (stage !== "0" || !mode || !normalizeGitBlobId(objectId) || !recordPath) continue
    entries.set(recordPath, { id: normalizeGitBlobId(objectId), mode })
  }
  return entries
}

const parseGitTreeRecords = (raw) => {
  const entries = new Map()
  for (const record of String(raw || "").split("\0")) {
    if (!record) continue
    const tabIndex = record.indexOf("\t")
    if (tabIndex < 0) continue
    const meta = record.slice(0, tabIndex).split(" ")
    const objectId = meta[2]
    const recordPath = record.slice(tabIndex + 1)
    if (!normalizeGitBlobId(objectId) || !recordPath) continue
    entries.set(recordPath, normalizeGitBlobId(objectId))
  }
  return entries
}

const readIndexBlobIds = async (repoRoot, repoPaths, timeout) => {
  if (repoPaths.length === 0) return new Map()
  const result = await runGitCommand(
    repoRoot,
    ["ls-files", "-s", "-z", "--end-of-options", "--", ...repoPaths.map(literalPathspec)],
    { timeout },
  )
  if (!result.success) return new Map()
  return parseGitStageRecords(result.stdout)
}

const readTreeBlobIds = async (repoRoot, treeish, repoPaths, timeout) => {
  if (repoPaths.length === 0) return new Map()
  if (!normalizeGitBlobId(treeish) && treeish !== "HEAD") return new Map()
  const result = await runGitCommand(
    repoRoot,
    ["ls-tree", "-z", "--end-of-options", treeish, "--", ...repoPaths.map(literalPathspec)],
    { timeout },
  )
  if (!result.success) return new Map()
  return parseGitTreeRecords(result.stdout)
}

const readHeadBlobIds = async (repoRoot, repoPaths, timeout) => readTreeBlobIds(repoRoot, "HEAD", repoPaths, timeout)

/**
 * The git mode of a regular worktree file. Windows has no executable bit, so git keeps the index mode there (core.filemode
 * is false); elsewhere the owner executable bit decides, as git does.
 */
const worktreeRegularMode = (stat, indexMode) => {
  if (process.platform === "win32") return indexMode === "100755" ? "100755" : "100644"
  return stat.mode & 0o100 ? "100755" : "100644"
}

// Git's blob id for these exact bytes (what `git hash-object --no-filters` prints).
const gitBlobId = (bytes) =>
  createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")

/**
 * Worktree blob ids computed in-process. Each file is opened once without following a final symlink (where the OS
 * supports O_NOFOLLOW; elsewhere the handle must match the checked file's device and inode) and hashed from that
 * handle, so nothing can swap it between the checks and the read. A symlink is hashed by its
 * link text, which is the blob git stores for it; its target is never read. Paths whose parent directories
 * resolve outside the repository are skipped. git hash-object --stdin-paths is not used: it decodes quoted
 * C-style escapes in a path, which let a crafted filename name a file outside the repository.
 */
const hashWorktreeBlobs = async (repoRoot, files, maxBytes, timeout, indexModes = new Map()) => {
  const ids = new Map()
  const modes = new Map()
  const deadline = Date.now() + timeout
  const rootReal = await fsp.realpath(repoRoot).catch(() => null)
  if (!rootReal) return { ids, modes }
  const noFollow = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0)
  for (const file of files) {
    if (Date.now() > deadline) break
    if (worktreeFileRemoved(file) || !isSafeGitStatusPath(file.path)) continue
    let absolute
    try {
      absolute = resolveRepositoryFilePath(repoRoot, file.path)
    } catch {
      continue
    }
    const parentReal = await fsp.realpath(path.dirname(absolute)).catch(() => null)
    if (!parentReal || !isInsideOrSameDirectory(rootReal, parentReal)) continue
    const entry = await fsp.lstat(absolute).catch(() => null)
    if (!entry) continue
    if (entry.isSymbolicLink()) {
      const linkText = await fsp.readlink(absolute, { encoding: "buffer" }).catch(() => null)
      if (linkText && linkText.length <= maxBytes) {
        ids.set(file.path, gitBlobId(linkText))
        modes.set(file.path, "120000")
      }
      continue
    }
    if (!entry.isFile() || entry.size > maxBytes) continue
    let handle
    try {
      handle = await fsp.open(absolute, noFollow)
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > maxBytes) continue
      const openedParent = await fsp.realpath(path.dirname(absolute)).catch(() => null)
      if (openedParent !== parentReal || !isInsideOrSameDirectory(rootReal, openedParent)) continue
      // Windows has no O_NOFOLLOW: the opened file must be the one lstat checked, not a link swapped in since.
      if (stat.dev !== entry.dev || stat.ino !== entry.ino) continue
      // Probe past the measured size: growth invalidates this snapshot instead of hashing truncated bytes.
      const buffer = Buffer.alloc(Math.min(stat.size, maxBytes) + 1)
      let length = 0
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
        if (bytesRead === 0) break
        length += bytesRead
      }
      if (length > maxBytes || length > stat.size) continue
      ids.set(file.path, gitBlobId(buffer.subarray(0, length)))
      modes.set(file.path, worktreeRegularMode(stat, indexModes.get(file.path)))
    } catch {
      continue
    } finally {
      await handle?.close().catch(() => {})
    }
  }
  return { ids, modes }
}

/**
 * Blob ids for changed files. Paths come from git status only. Deleted files and files over the
 * size cap have no worktree id. Files past the count cap are left without identity fields so the
 * client can fall back to the count signature. The payload never includes file bytes.
 */
const collectContentIdentities = async (repoRoot, files, options) => {
  const maxFiles = boundedIdentityOption(options.contentIdentityMaxFiles, GIT_STATUS_CONTENT_ID_MAX_FILES)
  const maxBytes = boundedIdentityOption(options.contentIdentityMaxBytes, GIT_STATUS_CONTENT_ID_MAX_BYTES)
  const timeout = GIT_STATUS_CONTENT_ID_TIMEOUT_MS
  const limited = files.slice(0, maxFiles).filter((file) => isSafeGitStatusPath(file?.path))
  const safe = []
  for (const file of limited) {
    try {
      resolveRepositoryFilePath(repoRoot, file.path)
    } catch {
      continue
    }
    safe.push(file)
  }
  const indexPaths = safe.map((file) => file.path)
  const headPaths = []
  for (const file of safe) {
    const index = gitStatusColumn(file.index)
    const headPath = (index === "R" || index === "C") && isSafeGitStatusPath(file.from) ? file.from : file.path
    headPaths.push(headPath)
  }
  const [indexEntries, headIds] = await Promise.all([
    readIndexBlobIds(repoRoot, indexPaths, timeout),
    readHeadBlobIds(repoRoot, [...new Set(headPaths)], timeout),
  ])
  const indexModes = new Map([...indexEntries].map(([filePath, entry]) => [filePath, entry.mode]))
  const worktree = await hashWorktreeBlobs(repoRoot, safe, maxBytes, timeout, indexModes)
  const identities = new Map()
  for (const file of safe) {
    const index = gitStatusColumn(file.index)
    const headPath = (index === "R" || index === "C") && isSafeGitStatusPath(file.from) ? file.from : file.path
    identities.set(file.path, {
      headBlobId: headIds.get(headPath) ?? null,
      indexBlobId: indexEntries.get(file.path)?.id ?? null,
      worktreeBlobId: worktree.ids.get(file.path) ?? null,
      // Modes let a reviewer's content proof also cover the file type and executable bit.
      indexMode: indexEntries.get(file.path)?.mode ?? null,
      worktreeMode: worktree.modes.get(file.path) ?? null,
    })
  }
  return { identities, maxFiles }
}

export async function getStatus(directory, options = {}) {
  const lightMode = options.mode === "light"

  try {
    const { directoryPath, repoRoot, git } = await createRepositoryGitContext(directory)

    // Use -uall to show all untracked files individually, not just directories
    // Preserve only the first porcelain-v1 record: simple-git drops the explicit no-commits marker
    // while parsing the branch name. Both legacy and current Git report unborn branches here.
    let statusHeader = ""
    git.outputHandler((_command, stdout) => {
      stdout.on("data", (chunk) => {
        if (!statusHeader.includes("\0") && statusHeader.length < 4096) {
          const header = (statusHeader + chunk.toString()).slice(0, 4096)
          const end = header.indexOf("\0")
          statusHeader = end < 0 ? header : header.slice(0, end + 1)
        }
      })
    })
    let status
    try {
      status = await git.status(["-uall"])
    } finally {
      git.outputHandler(null)
    }

    // Read the commit identity as well as the per-path blobs: an empty commit moves HEAD too.
    const headResult = await runGitCommand(repoRoot, ["rev-parse", "--verify", "HEAD"], {
      timeout: GIT_STATUS_CONTENT_ID_TIMEOUT_MS,
    })
    // Only an explicit no-commits header proves absence. Read failures remain unknown.
    const unborn = /^## (?:No commits yet on |Initial commit on )[^\0]+\0/.test(statusHeader)
    const headOid = headResult.success
      ? normalizeGitBlobId(headResult.stdout.trim()) ?? undefined
      : unborn
        ? null
        : undefined

    // Light mode: skip numstat + new-file line counting for faster response. Staged
    // (`--cached`: HEAD -> index) and working (`--numstat`: index -> worktree) stay in
    // separate maps, so a partially staged file shows each row's own scope instead of the
    // same combined total on both.
    const [stagedStatsRaw, workingStatsRaw] = lightMode
      ? ["", ""]
      : await Promise.all([
          git.raw(["diff", "--cached", "--numstat", "-z"]).catch(() => ""),
          git.raw(["diff-files", "--numstat", "-z"]).catch(() => ""),
        ])

    const stagedDiffStats = {}
    const workingDiffStats = {}

    // `-z` keeps paths raw instead of C-quoting them (`"r\303\251sum\303\251.txt"`),
    // which never matched the status entry's real path. A rename/copy record ends after
    // its second tab; its source and destination follow as separate NUL records.
    const accumulateStats = (raw, target) => {
      if (!raw) return
      const records = raw.split("\0")
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index]
        if (!record) continue

        const parts = record.split("\t")
        if (parts.length < 3) continue

        const [insertionsRaw, deletionsRaw, ...pathParts] = parts
        let path = pathParts.join("\t")
        if (!path) {
          path = records[index + 2]
          index += 2
          if (!path) continue
        }

        const insertions = insertionsRaw === "-" ? 0 : parseInt(insertionsRaw, 10) || 0
        const deletions = deletionsRaw === "-" ? 0 : parseInt(deletionsRaw, 10) || 0

        const existing = target[path] || { insertions: 0, deletions: 0 }
        target[path] = {
          insertions: existing.insertions + insertions,
          deletions: existing.deletions + deletions,
        }
      }
    }

    accumulateStats(stagedStatsRaw, stagedDiffStats)
    accumulateStats(workingStatsRaw, workingDiffStats)

    const diffStats = { staged: stagedDiffStats, working: workingDiffStats }

    const MAX_NEW_FILE_STATS = 200
    const MAX_NEW_FILE_STAT_SIZE = 1024 * 1024
    const newFileStats = []

    if (!lightMode) {
      // Select candidates with the cheap synchronous checks first (capped), then
      // read them with bounded concurrency. The previous sequential await-per-file
      // loop blocked the event loop for the duration of every stat+read; reads are
      // independent, so running a small batch in parallel cuts wall-clock time.
      const NEW_FILE_STAT_CONCURRENCY = 12
      const candidates = []
      for (const file of status.files) {
        if (candidates.length >= MAX_NEW_FILE_STATS) {
          break
        }

        const working = (file.working_dir || "").trim()
        const indexStatus = (file.index || "").trim()
        const statusCode = working || indexStatus

        if (statusCode !== "?" && statusCode !== "A") {
          continue
        }

        // Untracked and working-tree-added files belong to the working scope; a file
        // whose "A" code is on the index belongs to the staged scope.
        const target = working === "?" || working === "A" ? workingDiffStats : stagedDiffStats
        const existing = target[file.path]
        if (existing && existing.insertions > 0) {
          continue
        }

        candidates.push({ file, target })
      }

      const estimateNewFileStat = async ({ file, target }) => {
        const existing = target[file.path]
        let absolutePath
        try {
          absolutePath = resolveRepositoryFilePath(repoRoot, file.path)
        } catch (error) {
          console.warn("Skipping new file outside repository", file.path, error)
          return null
        }

        try {
          const repoPath = toGitPath(path.relative(repoRoot, absolutePath))
          const emptyPath = NULL_DEVICE_PATH
          const diff = await execFileAsync(
            getGitBinary(),
            ["diff", "--numstat", "--no-index", "--", emptyPath, repoPath],
            {
              cwd: repoRoot,
              encoding: "utf8",
              windowsHide: true,
              maxBuffer: MAX_NEW_FILE_STAT_SIZE,
            },
          ).catch((error) => {
            const stdout = typeof error?.stdout === "string" ? error.stdout : ""
            if (stdout.trim()) {
              return { stdout }
            }
            throw error
          })
          const [insertionsRaw, deletionsRaw] = String(diff.stdout || "")
            .trim()
            .split(/\t/)
          if (insertionsRaw === "-" || deletionsRaw === "-") {
            return {
              target,
              path: file.path,
              insertions: existing?.insertions ?? 0,
              deletions: existing?.deletions ?? 0,
            }
          }

          return { target, path: file.path, insertions: parseInt(insertionsRaw, 10) || 0, deletions: 0 }
        } catch (error) {
          if (error?.code !== "ENOENT") {
            console.warn("Failed to estimate diff stats for new file", file.path, error)
          }
          return null
        }
      }

      // Process candidates in fixed-size batches to bound concurrent open file
      // descriptors while still parallelizing the IO.
      for (let i = 0; i < candidates.length; i += NEW_FILE_STAT_CONCURRENCY) {
        const batch = candidates.slice(i, i + NEW_FILE_STAT_CONCURRENCY)
        const results = await Promise.all(batch.map(estimateNewFileStat))
        for (const result of results) {
          if (result) newFileStats.push(result)
        }
      }
    }

    for (const entry of newFileStats) {
      entry.target[entry.path] = {
        insertions: entry.insertions,
        deletions: entry.deletions,
      }
    }

    const selectBaseRefForUnpublished = async () => {
      const candidates = []

      const originHead = await git
        .raw(["symbolic-ref", "-q", "refs/remotes/origin/HEAD"])
        .then((value) => String(value || "").trim())
        .catch(() => "")

      if (originHead) {
        // "refs/remotes/origin/main" -> "origin/main"
        candidates.push(originHead.replace(/^refs\/remotes\//, ""))
      }

      candidates.push("origin/main", "origin/master", "main", "master")

      for (const ref of candidates) {
        const exists = await git
          .raw(["rev-parse", "--verify", ref])
          .then((value) => String(value || "").trim())
          .catch(() => "")
        if (exists) return ref
      }

      return null
    }

    let tracking = status.tracking || null
    let ahead = status.ahead
    let behind = status.behind
    let upstreamComparison

    // When no upstream is configured (common for new worktree branches), Git doesn't report ahead/behind.
    // We still want to show the number of unpublished commits to the user.
    // Light mode skips this — the basic ahead/behind from git status is sufficient for polling.
    if (!lightMode && !tracking && status.current) {
      const baseRef = await selectBaseRefForUnpublished()
      if (baseRef) {
        const countRaw = await git
          .raw(["rev-list", "--count", `${baseRef}..HEAD`])
          .then((value) => String(value || "").trim())
          .catch(() => "")
        const count = parseInt(countRaw, 10)
        if (Number.isFinite(count)) {
          ahead = count
          behind = 0
        }
      }
    }

    if (
      !lightMode &&
      status.current &&
      (!tracking || !tracking.startsWith("upstream/")) &&
      (await hasRemote(git, directoryPath, "upstream"))
    ) {
      upstreamComparison = await getRemoteBranchComparison(git, "upstream", status.current)
    }

    // Check for in-progress operations
    let mergeInProgress = null
    let rebaseInProgress = null

    try {
      // Check MERGE_HEAD for merge in progress
      const mergeHeadExists = await git
        .raw(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"])
        .then(() => true)
        .catch(() => false)

      if (mergeHeadExists) {
        const mergeHead = await git.raw(["rev-parse", "MERGE_HEAD"]).catch(() => "")
        const headSha = mergeHead.trim().slice(0, 7)
        // Only set mergeInProgress if we actually have a valid head SHA
        if (headSha) {
          const mergeMessage = await readGitInternalText(repoRoot, git, "MERGE_MSG")
          mergeInProgress = {
            head: headSha,
            message: mergeMessage.trim().split("\n")[0] || "",
          }
        }
      }
    } catch {
      // ignore
    }

    try {
      rebaseInProgress = await readRebaseInProgress(repoRoot, git)
    } catch {
      // ignore
    }

    let contentIdentities = { identities: new Map(), maxFiles: 0 }
    try {
      contentIdentities = await collectContentIdentities(repoRoot, status.files, options)
    } catch (identityError) {
      console.warn("Failed to read git content identities:", identityError?.message || identityError)
    }

    return {
      current: status.current,
      worktreeRoot: repoRoot.replace(/\\/g, "/"),
      headOid,
      tracking,
      ahead,
      behind,
      upstreamComparison,
      files: status.files.map((file, index) => {
        const row = {
          path: file.path,
          index: file.index,
          working_dir: file.working_dir,
        }
        // Past the cap the fields are omitted, which is the client's signal to fall back.
        if (index >= contentIdentities.maxFiles) return row
        const identity = contentIdentities.identities.get(file.path) ?? {
          headBlobId: null,
          indexBlobId: null,
          worktreeBlobId: null,
          indexMode: null,
          worktreeMode: null,
        }
        return { ...row, ...identity }
      }),
      isClean: status.isClean(),
      diffStats: lightMode ? undefined : diffStats,
      mergeInProgress,
      rebaseInProgress,
    }
  } catch (error) {
    if (!isNotGitRepositoryError(error)) {
      console.error("Failed to get Git status:", error)
    }
    throw error
  }
}

export async function getDiff(directory, { path: filePath, staged = false, contextLines = 3 } = {}) {
  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory)

  try {
    const args = ["diff", "--no-color"]
    const fileContext = filePath ? await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot) : null

    if (typeof contextLines === "number" && !Number.isNaN(contextLines)) {
      args.push(`-U${Math.max(0, contextLines)}`)
    }

    if (staged) {
      args.push("--cached")
    }

    if (fileContext) {
      args.push("--", literalPathspec(fileContext.repoPath))
    }

    const diff = await git.raw(args)
    if (diff && diff.trim().length > 0) {
      return diff
    }

    if (staged) {
      return diff
    }

    if (!fileContext) {
      return diff
    }

    try {
      await git.raw(["ls-files", "--error-unmatch", "--", literalPathspec(fileContext.repoPath)])
      return diff
    } catch {
      const noIndexArgs = ["diff", "--no-color"]
      if (typeof contextLines === "number" && !Number.isNaN(contextLines)) {
        noIndexArgs.push(`-U${Math.max(0, contextLines)}`)
      }
      noIndexArgs.push("--no-index", "--", NULL_DEVICE_PATH, fileContext.repoPath)
      try {
        const noIndexDiff = await git.raw(noIndexArgs)
        return noIndexDiff
      } catch (noIndexError) {
        // git diff --no-index returns exit code 1 when differences exist (not a real error)
        if (noIndexError.exitCode === 1 && noIndexError.message) {
          return noIndexError.message
        }
        throw noIndexError
      }
    }
  } catch (error) {
    console.error("Failed to get Git diff:", error)
    throw error
  }
}

export async function getRangeDiff(directory, { base, head, path: filePath, contextLines = 3 } = {}) {
  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory)
  const baseRef = typeof base === "string" ? base.trim() : ""
  const headRef = typeof head === "string" ? head.trim() : ""
  if (!baseRef || !headRef) {
    throw new Error("base and head are required")
  }

  // Prefer remote-tracking base ref so merged commits don't reappear
  // when local base branch is stale (common when user stays on feature branch).
  let resolvedBase = baseRef
  const originCandidate = `refs/remotes/origin/${baseRef}`
  try {
    const verified = await git.raw(["rev-parse", "--verify", originCandidate])
    if (verified && verified.trim()) {
      resolvedBase = `origin/${baseRef}`
    }
  } catch {
    // ignore
  }

  const args = ["diff", "--no-color"]
  if (typeof contextLines === "number" && !Number.isNaN(contextLines)) {
    args.push(`-U${Math.max(0, contextLines)}`)
  }
  args.push(`${resolvedBase}...${headRef}`)
  if (filePath) {
    const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot)
    args.push("--", literalPathspec(fileContext.repoPath))
  }
  const diff = await git.raw(args)
  return diff
}

export async function getRangeFiles(directory, { base, head } = {}) {
  const { git } = await createRepositoryGitContext(directory)
  const baseRef = typeof base === "string" ? base.trim() : ""
  const headRef = typeof head === "string" ? head.trim() : ""
  if (!baseRef || !headRef) {
    throw new Error("base and head are required")
  }

  let resolvedBase = baseRef
  const originCandidate = `refs/remotes/origin/${baseRef}`
  try {
    const verified = await git.raw(["rev-parse", "--verify", originCandidate])
    if (verified && verified.trim()) {
      resolvedBase = `origin/${baseRef}`
    }
  } catch {
    // ignore
  }

  const raw = await git.raw(["diff", "--name-only", `${resolvedBase}...${headRef}`])
  return String(raw || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif"]

const BINARY_SNIFF_BYTES = 8192

function isImageFile(filePath) {
  const ext = filePath.split(".").pop()?.toLowerCase()
  return IMAGE_EXTENSIONS.includes(ext || "")
}

function getImageMimeType(filePath) {
  const ext = filePath.split(".").pop()?.toLowerCase()
  const mimeMap = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    ico: "image/x-icon",
    bmp: "image/bmp",
    avif: "image/avif",
  }
  return mimeMap[ext] || "application/octet-stream"
}

const parseIsBinaryFromNumstat = (raw) => {
  const text = String(raw || "").trim()
  if (!text) {
    return false
  }

  // Expected format: <added>\t<deleted>\t<path>
  const firstLine =
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || ""
  const [added, deleted] = firstLine.split("\t")
  return added === "-" || deleted === "-"
}

// `-z` writes every path raw, so non-ASCII names are not C-quoted; a rename or
// copy is three NUL records (status, source, destination) instead of a line.
const parseGitNameStatusZ = (raw) => {
  const records = String(raw || "").split("\0")
  const entries = []
  for (let index = 0; index < records.length; index += 1) {
    const match = /^([A-Z])\d*$/.exec(records[index])
    if (!match) {
      continue
    }
    const status = match[1]
    if (status === "R" || status === "C") {
      const source = records[index + 1]
      const path = records[index + 2]
      index += 2
      if (source && path) {
        entries.push({ status, source, path })
      }
      continue
    }
    const path = records[index + 1]
    index += 1
    if (path) {
      entries.push({ status, source: null, path })
    }
  }
  return entries
}

const extractGitNumstatDestinationPath = (filePath) => {
  if (!filePath.includes(" => ")) {
    return filePath
  }

  const braceMatch = filePath.match(/^(.*)\{([^{}]*)\s=>\s([^{}]*)\}(.*)$/)
  if (braceMatch) {
    const [, prefix, , destination, suffix] = braceMatch
    return `${prefix}${destination}${suffix}`.replace(/\/+/g, "/")
  }

  return filePath.split(" => ").pop()?.trim() || filePath
}

const looksBinaryBySniff = async (absolutePath) => {
  try {
    const handle = await fsp.open(absolutePath, "r")
    try {
      const buffer = Buffer.alloc(BINARY_SNIFF_BYTES)
      const { bytesRead } = await handle.read(buffer, 0, BINARY_SNIFF_BYTES, 0)
      if (bytesRead <= 0) {
        return false
      }
      return buffer.subarray(0, bytesRead).includes(0)
    } finally {
      await handle.close()
    }
  } catch {
    return false
  }
}

const isBinaryDiff = async (directoryPath, filePath, staged) => {
  // Fast path: ask git for numstat. For binary, it returns "-\t-\t<path>".
  const args = ["diff", "--numstat"]
  if (staged) {
    args.push("--cached")
  }
  args.push("--", literalPathspec(filePath))

  const result = await runGitCommand(directoryPath, args)
  if (parseIsBinaryFromNumstat(result.stdout)) {
    return true
  }

  // Fallback for untracked files (diff output is empty): use --no-index against the platform's null device
  if (!staged) {
    const tracked = await runGitCommand(directoryPath, ["ls-files", "--error-unmatch", "--", literalPathspec(filePath)]).then(
      (r) => r.success,
    )
    if (!tracked) {
      const noIndex = await runGitCommand(directoryPath, [
        "diff",
        "--no-index",
        "--numstat",
        "--",
        NULL_DEVICE_PATH,
        filePath,
      ])
      if (
        parseIsBinaryFromNumstat(noIndex.stdout) ||
        parseIsBinaryFromNumstat(noIndex.stderr) ||
        parseIsBinaryFromNumstat(noIndex.message)
      ) {
        return true
      }
      const text = `${noIndex.stdout || ""}\n${noIndex.stderr || ""}\n${noIndex.message || ""}`.toLowerCase()
      if (text.includes("binary files") || text.includes("git binary patch")) {
        return true
      }
    }
  }

  return false
}

/** The source path of a staged rename whose destination is `destinationPath`, or null. */
const resolveStagedRenameSourcePath = async (git, destinationPath) => {
  // A pathspec-limited diff reports the rename as an addition, so the whole index has to be scanned.
  const raw = await git.raw(["diff", "--cached", "--name-status", "-z", "-M"]).catch(() => "")
  for (const entry of parseGitNameStatusZ(raw)) {
    if ((entry.status === "R" || entry.status === "C") && entry.path === destinationPath) {
      return entry.source
    }
  }
  return null
}

const readHeadFileSide = async (git, repoRoot, sourcePath, isImage, mimeType) => {
  if (!isImage) {
    return await git.show([`HEAD:${sourcePath}`])
  }

  const { stdout } = await execFileAsync(getGitBinary(), ["show", `HEAD:${sourcePath}`], {
    cwd: repoRoot,
    encoding: "buffer",
    windowsHide: true,
    maxBuffer: 50 * 1024 * 1024, // 50MB max
  })
  return stdout && stdout.length > 0 ? `data:${mimeType};base64,${stdout.toString("base64")}` : ""
}

export async function getFileDiff(directory, { path: filePath, staged = false } = {}) {
  if (!directory || !filePath) {
    throw new Error("directory and path are required for getFileDiff")
  }

  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory)
  const isImage = isImageFile(filePath)
  const mimeType = isImage ? getImageMimeType(filePath) : null
  const { absolutePath, repoPath } = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot)

  if (!isImage) {
    const isBinaryBySniff = await looksBinaryBySniff(absolutePath)
    const isBinary = isBinaryBySniff || (await isBinaryDiff(repoRoot, repoPath, staged))
    if (isBinary) {
      return {
        original: "",
        modified: "",
        path: filePath,
        isBinary: true,
      }
    }
  }

  let original = ""
  try {
    original = await readHeadFileSide(git, repoRoot, repoPath, isImage, mimeType)
  } catch {
    original = ""
    // A staged rename has no destination entry in HEAD; read the original from
    // the rename's source instead of rendering the whole file as added.
    if (staged) {
      const renameSource = await resolveStagedRenameSourcePath(git, repoPath)
      if (renameSource) {
        original = await readHeadFileSide(git, repoRoot, renameSource, isImage, mimeType).catch(() => "")
      }
    }
  }

  let modified = ""
  if (staged) {
    // The index is the modified side when staged, and a staged deletion has no
    // index entry: `git show :<path>` fails with "path ... does not exist
    // (neither on disk nor in the index)" and simple-git's GitError carries no
    // `code` to match, so a deletion must read as an empty side, not a 500.
    try {
      if (isImage) {
        const { stdout } = await execFileAsync(getGitBinary(), ["show", `:${repoPath}`], {
          cwd: repoRoot,
          encoding: "buffer",
          windowsHide: true,
          maxBuffer: 50 * 1024 * 1024,
        })
        if (stdout && stdout.length > 0) {
          modified = `data:${mimeType};base64,${stdout.toString("base64")}`
        }
      } else {
        modified = await git.show([`:${repoPath}`])
      }
    } catch {
      modified = ""
    }
  } else {
    try {
      if (isImage) {
        // For images, read as binary and convert to data URL
        const buffer = await fsp.readFile(absolutePath)
        modified = `data:${mimeType};base64,${buffer.toString("base64")}`
      } else {
        modified = await fsp.readFile(absolutePath, "utf8")
      }
    } catch (error) {
      if (error && typeof error === "object" && (error.code === "ENOENT" || error.code === "EISDIR")) {
        modified = ""
      } else {
        console.error("Failed to read modified file contents for diff:", error)
        throw error
      }
    }
  }

  return {
    original: typeof original === "string" ? original.replace(/\r\n/g, "\n") : original,
    modified: typeof modified === "string" ? modified.replace(/\r\n/g, "\n") : modified,
    path: filePath,
    isBinary: false,
  }
}

// A branch review compares the working tree with the merge-base of the chosen branch and HEAD, so
// committed and uncommitted changes on this branch are both included. The cap keeps one response
// from reading an unbounded tree into the desktop process.
const BRANCH_DIFF_MAX_FILES = 300
const BRANCH_DIFF_MAX_BYTES = 1024 * 1024
const BRANCH_DIFF_READ_CONCURRENCY = 8
// Whole-response content budget and per-command time limit: a large branch must not hold the desktop
// process on one request or return hundreds of megabytes of text.
const BRANCH_DIFF_MAX_TOTAL_BYTES = 16 * 1024 * 1024
const BRANCH_DIFF_GIT_TIMEOUT_MS = 30_000
const BRANCH_DIFF_STATUS = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "modified",
  U: "modified",
}

export class GitBranchDiffError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = "GitBranchDiffError"
    this.statusCode = statusCode
  }
}

const listBranchDiffNames = async (repoRoot, prefix) => {
  const result = await runGitCommandOrThrow(
    repoRoot,
    ["for-each-ref", "--format=%(symref)\t%(refname:short)", prefix],
    "Failed to list branches",
  )
  const names = new Set()
  for (const line of String(result.stdout || "").split("\n")) {
    if (!line) continue
    const tab = line.indexOf("\t")
    if (tab < 0) continue
    const symref = line.slice(0, tab)
    const name = line.slice(tab + 1)
    // Symbolic refs such as origin/HEAD are pointers, not branch names.
    if (!name || symref) continue
    names.add(name)
  }
  return names
}

const resolveDefaultBranchBase = async (repoRoot, localNames, remoteNames) => {
  const originHead = await runGitCommand(repoRoot, [
    "symbolic-ref",
    "-q",
    "--end-of-options",
    "refs/remotes/origin/HEAD",
  ])
  if (originHead.success) {
    const ref = String(originHead.stdout || "").trim()
    const remotePrefix = "refs/remotes/"
    if (ref.startsWith(remotePrefix)) {
      const short = ref.slice(remotePrefix.length)
      const slash = short.indexOf("/")
      const leaf = slash >= 0 ? short.slice(slash + 1) : short
      if (leaf && localNames.has(leaf)) return leaf
      if (short && remoteNames.has(short)) return short
    }
  }
  if (localNames.has("main")) return "main"
  if (localNames.has("master")) return "master"
  throw new GitBranchDiffError("No default branch")
}

// `git diff` keeps only the last format, so --numstat and --name-status cannot share one invocation.
// A rename's numstat record is `added\tdeleted\t\0old\0new\0`; the destination is the working-tree path.
const parseBranchNumstatZ = (raw) => {
  const stats = new Map()
  const records = String(raw || "").split("\0")
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record) continue
    const parts = record.split("\t")
    if (parts.length < 3) continue
    const [added, deleted, ...pathParts] = parts
    let filePath = pathParts.join("\t")
    if (!filePath) {
      filePath = records[index + 2] || ""
      index += 2
    }
    if (!filePath) continue
    const binary = added === "-" || deleted === "-"
    stats.set(filePath, {
      additions: binary ? 0 : Number.parseInt(added, 10) || 0,
      deletions: binary ? 0 : Number.parseInt(deleted, 10) || 0,
      binary,
    })
  }
  return stats
}

const countBranchDiffLines = (text) => {
  if (!text) return 0
  let count = 1
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) count += 1
  }
  if (text.endsWith("\n")) count -= 1
  return count
}

const readBranchWorkingSide = async (repoRoot, repoPath) => {
  let handle
  let absolute
  try {
    absolute = resolveRepositoryFilePath(repoRoot, repoPath)
    const [rootReal, target] = await Promise.all([fsp.realpath(repoRoot), fsp.realpath(absolute)])
    if (!isInsideOrSameDirectory(rootReal, target)) return { text: "", tooLarge: true }
    const entry = await fsp.lstat(target)
    if (!entry.isFile()) return { text: "", missing: true }
    if (entry.size > BRANCH_DIFF_MAX_BYTES) return { text: "", tooLarge: true }

    // Use one checked handle for both binary detection and content. Never reopen by path after checking it.
    handle = await fsp.open(
      target,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0),
    )
    const stat = await handle.stat()
    if (!stat.isFile() || stat.dev !== entry.dev || stat.ino !== entry.ino || stat.size > BRANCH_DIFF_MAX_BYTES)
      return { text: "", tooLarge: true }
    // A parent directory may also have changed while opening the file.
    const currentTarget = await fsp.realpath(target)
    if (currentTarget !== target || !isInsideOrSameDirectory(rootReal, currentTarget))
      return { text: "", tooLarge: true }
    const buffer = Buffer.alloc(BRANCH_DIFF_MAX_BYTES + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (bytesRead === 0) break
      length += bytesRead
    }
    if (length > BRANCH_DIFF_MAX_BYTES) return { text: "", tooLarge: true }
    const bytes = buffer.subarray(0, length)
    if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { text: "", binary: true }
    return { text: bytes.toString("utf8").replace(/\r\n/g, "\n") }
  } catch (error) {
    if (error?.code === "ENOENT") {
      const entry = absolute && await fsp.lstat(absolute).catch(() => null)
      return entry?.isSymbolicLink() ? { text: "", tooLarge: true } : { text: "", missing: true }
    }
    if (["ELOOP", "ENOTDIR"].includes(error?.code)) return { text: "", tooLarge: true }
    throw error
  } finally {
    await handle?.close().catch(() => {})
  }
}

const readBranchBaseSide = async (repoRoot, mergeBase, repoPath) => {
  const spec = `${mergeBase}:${repoPath}`
  const sizeResult = await runGitCommand(repoRoot, ["cat-file", "-s", "--end-of-options", spec])
  if (!sizeResult.success) return { text: "", missing: true }
  const size = Number.parseInt(String(sizeResult.stdout || "").trim(), 10)
  if (!Number.isFinite(size)) return { text: "", missing: true }
  if (size > BRANCH_DIFF_MAX_BYTES) return { text: "", tooLarge: true }
  if (size === 0) return { text: "" }

  const shown = await runGitCommand(repoRoot, ["show", "--end-of-options", spec])
  if (!shown.success) return { text: "", missing: true }
  const text = String(shown.stdout || "")
  if (text.includes("\0")) return { text: "", binary: true }
  if (Buffer.byteLength(text) > BRANCH_DIFF_MAX_BYTES) return { text: "", tooLarge: true }
  return { text: text.replace(/\r\n/g, "\n") }
}

const mapBranchDiffEntries = async (entries, mapper) => {
  const results = new Array(entries.length)
  let next = 0
  const workers = Array.from({ length: Math.min(BRANCH_DIFF_READ_CONCURRENCY, entries.length) }, async () => {
    while (next < entries.length) {
      const current = next
      next += 1
      results[current] = await mapper(entries[current])
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * Files changed on this branch relative to `base`: committed changes since the merge-base plus
 * everything in the working tree. `base` must be an existing local or remote-tracking branch.
 * Omit it to use origin/HEAD's target, then `main`, then `master`.
 */
export async function getGitBranchDiff(directory, { base, maxTotalBytes = BRANCH_DIFF_MAX_TOTAL_BYTES } = {}) {
  if (!directory || typeof directory !== "string") {
    throw new GitBranchDiffError("directory is required")
  }

  let repoRoot
  try {
    ;({ repoRoot } = await createRepositoryGitContext(directory))
  } catch (error) {
    if (isNotGitRepositoryError(error)) throw new GitBranchDiffError("Not a git repository")
    throw error
  }

  const [localNames, remoteNames] = await Promise.all([
    listBranchDiffNames(repoRoot, "refs/heads"),
    listBranchDiffNames(repoRoot, "refs/remotes"),
  ])
  const allowed = new Set([...localNames, ...remoteNames])
  const requested = typeof base === "string" ? base : ""
  let resolvedBase = requested
  if (!resolvedBase) {
    resolvedBase = await resolveDefaultBranchBase(repoRoot, localNames, remoteNames)
  }
  // The name is taken from for-each-ref and then passed as one argv entry after --end-of-options.
  // Anything else (options, SHAs, shell metacharacters, unknown refs) is rejected before git sees it.
  if (!allowed.has(resolvedBase) || resolvedBase.startsWith("-") || resolvedBase.includes("\0")) {
    throw new GitBranchDiffError("Unknown branch")
  }

  const mergeBaseResult = await runGitCommand(repoRoot, ["merge-base", "--end-of-options", resolvedBase, "HEAD"])
  if (!mergeBaseResult.success) throw new GitBranchDiffError("No merge base")
  const mergeBase = String(mergeBaseResult.stdout || "").trim()
  if (!/^[0-9a-f]{40}$/i.test(mergeBase)) throw new GitBranchDiffError("No merge base")

  const [nameStatusResult, numstatResult, untrackedResult] = await Promise.all([
    runGitCommandOrThrow(
      repoRoot,
      ["diff", "--name-status", "-z", "-M", "--end-of-options", mergeBase],
      "Failed to list branch changes",
      { timeout: BRANCH_DIFF_GIT_TIMEOUT_MS },
    ),
    runGitCommandOrThrow(
      repoRoot,
      ["diff", "--numstat", "-z", "-M", "--end-of-options", mergeBase],
      "Failed to count branch changes",
      { timeout: BRANCH_DIFF_GIT_TIMEOUT_MS },
    ),
    runGitCommandOrThrow(
      repoRoot,
      ["ls-files", "--others", "--exclude-standard", "-z", "--end-of-options"],
      "Failed to list untracked files",
      { timeout: BRANCH_DIFF_GIT_TIMEOUT_MS },
    ),
  ])

  const numstat = parseBranchNumstatZ(numstatResult.stdout)
  const entries = []
  const seen = new Set()
  for (const change of parseGitNameStatusZ(nameStatusResult.stdout)) {
    const status = BRANCH_DIFF_STATUS[change.status] || "modified"
    const previousFile = change.source || null
    entries.push({ file: change.path, status, previousFile })
    seen.add(change.path)
  }

  const untracked = String(untrackedResult.stdout || "").split("\0").filter(Boolean)
  for (const file of untracked) {
    if (seen.has(file) || leavesRepositoryRoot(file)) continue
    entries.push({ file, status: "untracked", previousFile: null })
  }

  entries.sort((left, right) => left.file.localeCompare(right.file))
  const truncated = entries.length > BRANCH_DIFF_MAX_FILES
  const kept = truncated ? entries.slice(0, BRANCH_DIFF_MAX_FILES) : entries

  const beforePaths = []
  for (const entry of kept) {
    if (entry.status === "added" || entry.status === "untracked") continue
    const source = entry.previousFile || entry.file
    if (!isSafeGitStatusPath(source)) continue
    beforePaths.push(source)
  }
  const beforeBlobIds = await readTreeBlobIds(repoRoot, mergeBase, [...new Set(beforePaths)], BRANCH_DIFF_GIT_TIMEOUT_MS).catch(
    () => new Map(),
  )

  let contentBytes = 0
  const files = await mapBranchDiffEntries(kept, async (entry) => {
    const stat = numstat.get(entry.file)
    const needsBefore = entry.status === "deleted" || entry.status === "modified" || entry.status === "renamed" || entry.status === "copied"
    const needsAfter = entry.status !== "deleted"
    let binary = Boolean(stat?.binary)
    let tooLarge = false
    let before = ""
    let after = ""

    if (!binary) {
      const [beforeSide, afterSide] = await Promise.all([
        needsBefore ? readBranchBaseSide(repoRoot, mergeBase, entry.previousFile || entry.file) : Promise.resolve({ text: "" }),
        needsAfter ? readBranchWorkingSide(repoRoot, entry.file) : Promise.resolve({ text: "" }),
      ])
      binary = Boolean(beforeSide.binary || afterSide.binary)
      tooLarge = Boolean(beforeSide.tooLarge || afterSide.tooLarge)
      if (!binary && !tooLarge) {
        const size = Buffer.byteLength(beforeSide.text || "") + Buffer.byteLength(afterSide.text || "")
        if (contentBytes + size > maxTotalBytes) {
          tooLarge = true
        } else {
          contentBytes += size
          before = beforeSide.text || ""
          after = afterSide.text || ""
        }
      }
    }

    let additions = stat?.additions ?? 0
    let deletions = stat?.deletions ?? 0
    if (entry.status === "untracked" && !binary && !tooLarge) {
      additions = countBranchDiffLines(after)
      deletions = 0
    }

    const beforeSource = entry.previousFile || entry.file
    const beforeBlobId =
      entry.status === "added" || entry.status === "untracked" ? null : beforeBlobIds.get(beforeSource) ?? null

    return {
      file: entry.file,
      before,
      after,
      additions,
      deletions,
      status: entry.status,
      binary,
      tooLarge,
      previousFile: entry.previousFile,
      beforeBlobId,
    }
  })

  return {
    base: resolvedBase,
    mergeBase,
    truncated,
    files,
  }
}

export async function revertFile(directory, filePath, options = {}) {
  return withGitIndexMutationQueue(directory, async () => {
    const scope = options?.scope === "working" ? "working" : "all"
    const directoryPath = normalizeDirectoryPath(directory)
    const directoryGit = await createGit(directoryPath)
    const repoRoot = await resolveGitRepositoryRoot(directoryPath, directoryGit)
    const { absolutePath, repoPath } = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot)
    const git = await createGit(repoRoot)

    // A lexical repository path can traverse a replaced parent into unrelated files.
    // Reject it before changing the index, even when the path is still staged.
    let parent = repoRoot
    for (const segment of path.relative(repoRoot, path.dirname(absolutePath)).split(path.sep).filter(Boolean)) {
      parent = path.join(parent, segment)
      const parentEntry = await fsp.lstat(parent).catch((error) => {
        if (error?.code === "ENOENT") return null
        throw error
      })
      // A deleted tracked file may have missing ancestors that Git must restore.
      if (!parentEntry) break
      if (parentEntry.isSymbolicLink()) {
        throw new Error("Refusing to revert a file through a symbolic-link parent")
      }
    }
    const directoryExclude = `/${repoPath.replace(/[\\*?\[\]]/g, "\\$&")}/`
    const worktreeEntry = await fsp.lstat(absolutePath).catch((error) => {
      if (error?.code === "ENOENT") return null
      throw error
    })
    if (worktreeEntry?.isDirectory()) {
      throw new Error("Refusing to revert a file replaced by a directory")
    }

    const isTracked = await git
      .raw(["ls-files", "--error-unmatch", "--", literalPathspec(repoPath)])
      .then(() => true)
      .catch(() => false)

    // Staged state is not tracked state: a staged deletion still exists in HEAD
    // and a staged addition does not. Deciding from the index alone sent both
    // down the "untracked" path — the deletion silently stayed deleted and the
    // addition failed after being unstaged.
    const existsInHead = await git
      .raw(["ls-tree", "--name-only", "HEAD", "--", literalPathspec(repoPath)])
      .then((output) => String(output || "").trim().length > 0)
      .catch(() => false)

    if (!isTracked && !existsInHead) {
      // A failed Git cleanup is not permission to bypass its path and ignore rules.
      await git.raw(["clean", "-f", "-e", directoryExclude, "--", literalPathspec(repoPath)])
      return
    }

    if (scope === "all") {
      try {
        await git.raw(["restore", "--staged", "--", literalPathspec(repoPath)])
      } catch (error) {
        await git.raw(["reset", "HEAD", "--", literalPathspec(repoPath)]).catch(() => {})
      }

      if (!existsInHead) {
        // A staged addition has no HEAD version to restore; reverting it means
        // removing the file instead of failing with a checkout error.
        // Keep Git's symlink-parent checks. Exclude a directory replacing this
        // exact file, including ignored additions and literal glob characters.
        await git.raw(["clean", "-f", "-x", "-e", directoryExclude, "--", literalPathspec(repoPath)])
        const remaining = await fsp.lstat(absolutePath).catch((error) => {
          if (error?.code === "ENOENT") return null
          throw error
        })
        if (remaining) throw new Error("Refusing to remove a replaced file or directory during revert")
        return
      }

      await restoreWorktreeFromHead(git, repoPath)
      return
    }

    if (existsInHead) {
      try {
        await git.raw(["restore", "--worktree", "--", literalPathspec(repoPath)])
      } catch (error) {
        try {
          await git.raw(["checkout", "--", literalPathspec(repoPath)])
        } catch (fallbackError) {
          console.error("Failed to revert git file:", fallbackError)
          throw fallbackError
        }
      }
      return
    }

    // A staged addition with only its worktree changes to discard: restore the
    // staged version into the worktree.
    try {
      await git.raw(["restore", "--worktree", "--", literalPathspec(repoPath)])
    } catch (error) {
      if (error && typeof error === "object" && /did not match/i.test(String(error.message || ""))) {
        return
      }
      throw error
    }
  })
}

const restoreWorktreeFromHead = async (git, repoPath) => {
  try {
    await git.raw(["restore", "--source=HEAD", "--worktree", "--", literalPathspec(repoPath)])
  } catch (error) {
    try {
      await git.raw(["checkout", "HEAD", "--", literalPathspec(repoPath)])
    } catch (fallbackError) {
      console.error("Failed to restore git file from HEAD:", fallbackError)
      throw fallbackError
    }
  }
}

export async function collectDiffs(directory, files = []) {
  const results = []
  for (const filePath of files) {
    try {
      const diff = await getDiff(directory, { path: filePath })
      if (diff && diff.trim().length > 0) {
        results.push({ path: filePath, diff })
      }
    } catch (error) {
      console.error(`Failed to diff ${filePath}:`, error)
    }
  }
  return results
}

export async function pull(directory, options = {}) {
  const { git } = await createRepositoryGitContext(directory)
  // Positional for git pull, same option-injection guard as push.
  rejectOptionLikeValue(options.remote, "remote name")
  rejectOptionLikeValue(options.branch, "branch name")
  const pullOptions =
    options.rebase === true
      ? {
          ...(options.options && typeof options.options === "object" && !Array.isArray(options.options)
            ? options.options
            : {}),
          "--rebase": null,
        }
      : options.options || {}

  try {
    const remote = String(options.remote || "").trim()
    const requestedBranch = String(options.branch || "").trim()
    let branch = requestedBranch

    if (remote && !branch) {
      // simple-git only includes the remote when both remote and branch are provided.
      // Resolve the current branch so selecting a remote in the UI really runs `git pull <remote> <branch>`.
      const status = await git.status()
      branch = String(status.current || "").trim()
    }

    const result = await git.pull(remote || "origin", branch || undefined, pullOptions)

    return {
      success: true,
      summary: result.summary,
      files: result.files,
      insertions: result.insertions,
      deletions: result.deletions,
    }
  } catch (error) {
    console.error("Failed to pull:", error)
    throw error
  }
}

export async function listStashes(directory) {
  const { git } = await createRepositoryGitContext(directory)
  const output = await git.raw(["stash", "list", "--format=%gd%x1f%gs%x1f%cr%x1f%H"])
  return String(output || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [ref = "", message = "", relativeTime = "", hash = ""] = line.split("\x1f")
      return { ref, message, relativeTime, hash }
    })
    .filter((entry) => entry.ref)
}

export async function countStashFiles(directory, refs = []) {
  const { git } = await createRepositoryGitContext(directory)
  const uniqueRefs = normalizeStringList(refs)
  const counts = {}
  const concurrency = 4
  let cursor = 0

  const worker = async () => {
    while (cursor < uniqueRefs.length) {
      const ref = uniqueRefs[cursor++]
      if (!ref) continue
      try {
        const names = await git.raw(["stash", "show", "--name-only", ref])
        counts[ref] = String(names || "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean).length
      } catch {
        counts[ref] = 0
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, uniqueRefs.length) }, () => worker()))
  return counts
}
export async function stashPush(directory, options = {}) {
  const { git } = await createRepositoryGitContext(directory)
  const message =
    typeof options.message === "string" && options.message.trim()
      ? options.message.trim()
      : `OpenChamber stash ${new Date().toISOString()}`
  const output = await git.raw(["stash", "push", "--include-untracked", "-m", message])
  return {
    success: true,
    created: !/no local changes/i.test(String(output || "")),
    message,
    output: String(output || "").trim(),
  }
}

export async function stashApply(directory, options = {}) {
  const { git } = await createRepositoryGitContext(directory)
  const ref = typeof options.ref === "string" && options.ref.trim() ? options.ref.trim() : "stash@{0}"
  // Prefer --index so the staged/unstaged split captured in the stash is restored
  // faithfully. Fall back to a plain apply when the index can't be reinstated
  // cleanly (e.g. conflicts), which is the prior behavior.
  await git.raw(["stash", "apply", "--index", ref]).catch(async () => {
    await git.raw(["stash", "apply", ref])
  })
  return { success: true, ref }
}

export async function stashDrop(directory, options = {}) {
  const { git } = await createRepositoryGitContext(directory)
  const ref = typeof options.ref === "string" && options.ref.trim() ? options.ref.trim() : "stash@{0}"
  await git.raw(["stash", "drop", ref])
  return { success: true, ref }
}

export async function stashPop(directory, options = {}) {
  const ref = typeof options.ref === "string" && options.ref.trim() ? options.ref.trim() : "stash@{0}"
  await stashApply(directory, { ref })
  await stashDrop(directory, { ref })
  return { success: true, ref }
}

export async function push(directory, options = {}) {
  const { git } = await createRepositoryGitContext(directory)

  // remote/branch are positional for git push: option-looking values
  // ("--mirror", "--force") would be parsed as flags — and `--mirror` deletes
  // every remote ref the local repo does not have.
  rejectOptionLikeValue(options.remote, "remote name")
  rejectOptionLikeValue(options.branch, "branch name")

  const describePushError = (error) => {
    const fromNestedGit =
      error?.git && typeof error.git === "object" ? [error.git.message, error.git.stderr, error.git.stdout] : []
    const candidates = [error?.message, error?.stderr, error?.stdout, ...fromNestedGit]
      .map((value) => String(value || "").trim())
      .filter(Boolean)

    return candidates[0] || "Failed to push to remote"
  }

  const buildUpstreamOptions = (raw) => {
    if (Array.isArray(raw)) {
      return raw.includes("--set-upstream") ? raw : [...raw, "--set-upstream"]
    }

    if (raw && typeof raw === "object") {
      return { ...raw, "--set-upstream": null }
    }

    return ["--set-upstream"]
  }

  const looksLikeMissingUpstream = (error) => {
    const message = String(error?.message || error?.stderr || "").toLowerCase()
    return (
      message.includes("has no upstream") ||
      message.includes("no upstream") ||
      message.includes("set-upstream") ||
      message.includes("set upstream") ||
      (message.includes("upstream") && message.includes("push") && message.includes("-u"))
    )
  }

  const normalizePushResult = (result) => {
    return {
      success: true,
      pushed: result.pushed,
      repo: result.repo,
      ref: result.ref,
    }
  }

  const remote = String(options.remote || "").trim()

  if (!remote && !options.branch) {
    try {
      await git.push()
      return {
        success: true,
        pushed: [],
        repo: directory,
        ref: null,
      }
    } catch (error) {
      if (!looksLikeMissingUpstream(error)) {
        const message = describePushError(error)
        console.error("Failed to push:", error)
        throw new Error(message)
      }

      try {
        const status = await git.status()
        const branch = status.current
        const remotes = await git.getRemotes(true)
        const fallbackRemote = remotes.find((entry) => entry.name === "origin")?.name || remotes[0]?.name
        if (!branch || !fallbackRemote) {
          const message = describePushError(error)
          throw new Error(message)
        }

        const result = await git.push(fallbackRemote, branch, buildUpstreamOptions(options.options))
        return normalizePushResult(result)
      } catch (fallbackError) {
        const message = describePushError(fallbackError)
        console.error("Failed to push (including upstream fallback):", fallbackError)
        throw new Error(message)
      }
    }
  }

  const remoteName = remote || "origin"

  // If caller didn't specify a branch, this is the common "Push"/"Commit & Push" path.
  // When there's no upstream yet (typical for freshly-created worktree branches), publish it on first push.
  if (!options.branch) {
    let status = null
    try {
      status = await git.status()
    } catch (error) {
      // If we can't read status, fall back to the regular push path below.
      console.warn("Failed to read git status before push:", error)
    }
    // A failed publish push must surface, not fall through to the generic path
    // below (which would push the branch's configured upstream instead).
    if (status?.current && !status.tracking) {
      const result = await git.push(remoteName, status.current, buildUpstreamOptions(options.options))
      return normalizePushResult(result)
    }
  }

  try {
    const result = await git.push(remoteName, options.branch, options.options || {})
    return normalizePushResult(result)
  } catch (error) {
    // Last-resort fallback: retry with upstream if the error suggests it's missing.
    if (!looksLikeMissingUpstream(error)) {
      const message = describePushError(error)
      console.error("Failed to push:", error)
      throw new Error(message)
    }

    try {
      const status = await git.status()
      const branch = options.branch || status.current
      if (!branch) {
        console.error("Failed to push: missing branch name for upstream setup:", error)
        throw error
      }

      const result = await git.push(remoteName, branch, buildUpstreamOptions(options.options))
      return normalizePushResult(result)
    } catch (fallbackError) {
      const message = describePushError(fallbackError)
      console.error("Failed to push (including upstream fallback):", fallbackError)
      throw new Error(message)
    }
  }
}

export async function deleteRemoteBranch(directory, options = {}) {
  const { branch, remote } = options
  if (!branch) {
    throw new Error("branch is required to delete remote branch")
  }

  const { git } = await createRepositoryGitContext(directory)
  const targetBranch = branch.startsWith("refs/heads/") ? branch.substring("refs/heads/".length) : branch
  let targetRef = `refs/heads/${targetBranch}`

  // Defaulting to origin deleted an unrelated same-named branch when the
  // worktree branch tracked another remote (upstream/fork). Delete from the
  // configured upstream, and refuse when there is none to be sure about.
  let remoteName = rejectOptionLikeValue(remote, "remote name")
  if (!remoteName) {
    const configured = await git.getConfig(`branch.${targetBranch}.remote`).catch(() => null)
    remoteName = typeof configured?.value === "string" ? configured.value.trim() : ""
    if (remoteName) {
      const upstream = await git.getConfig(`branch.${targetBranch}.merge`).catch(() => null)
      const upstreamRef = typeof upstream?.value === "string" ? upstream.value.trim() : ""
      if (!upstreamRef.startsWith("refs/heads/")) {
        throw new Error(`Branch "${targetBranch}" has no configured upstream branch; refusing to guess`)
      }
      // A local branch can track a differently named remote branch.
      targetRef = upstreamRef
    }
  }
  if (!remoteName) {
    throw new Error(`Branch "${targetBranch}" has no configured remote; refusing to delete a remote branch`)
  }
  if (remoteName.startsWith("-")) {
    throw new Error(`Invalid remote name: ${remoteName}`)
  }
  if (remoteName === ".") {
    throw new Error("Refusing to delete a remote branch from the local repository")
  }

  try {
    await git.raw(["check-ref-format", targetRef])
    await git.push(remoteName, `:${targetRef}`)
    return { success: true, remote: remoteName }
  } catch (error) {
    console.error("Failed to delete remote branch:", error)
    throw error
  }
}

export async function fetch(directory, options = {}) {
  const { git } = await createRepositoryGitContext(directory)

  try {
    // Positional for git fetch, same option-injection guard as push/pull.
    const remote = rejectOptionLikeValue(options.remote, "remote name")
    const branch = rejectOptionLikeValue(options.branch, "branch name")
    const fetchOptions = options.options || {}

    if (remote && !branch) {
      // simple-git drops the remote when branch is omitted, so use raw to preserve `git fetch <remote>`.
      await git.raw(["fetch", ...buildRawGitOptions(fetchOptions), remote])
    } else {
      await git.fetch(remote || "origin", branch || undefined, fetchOptions)
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to fetch:", error)
    throw error
  }
}

export async function stageFile(directory, filePath) {
  await stageFiles(directory, [filePath])
}

export async function stageFiles(directory, paths) {
  if (!directory) {
    throw new Error("directory and path are required for stageFile")
  }

  const filePaths = normalizeFilePathList(paths)
  if (filePaths.length === 0) {
    throw new Error("directory and path are required for stageFile")
  }
  validateRepositoryFilePaths(normalizeDirectoryPath(directory), filePaths)

  await withGitIndexMutationQueue(directory, async () => {
    const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory)
    const repoPaths = Array.from(
      new Set(
        await Promise.all(
          filePaths.map(async (filePath) => {
            const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot)
            return fileContext.repoPath
          }),
        ),
      ),
    )
    validateRepositoryFilePaths(repoRoot, repoPaths)
    await git.raw(["add", "--", ...repoPaths.map(literalPathspec)]).catch(async (error) => {
      const gitErrorText = parseGitErrorText(error)
      const isPathspecError = gitErrorText.includes("pathspec") && gitErrorText.includes("did not match any files")
      if (!isPathspecError) {
        throw error
      }

      // During rapid stage/unstage toggling the optimistic UI can request staging a
      // path that a prior queued mutation already staged (most visibly a deletion,
      // whose file is gone from the working tree). `git add` aborts the whole batch
      // on a single unmatched pathspec, so retry per-path and skip the ones already
      // in their target state rather than failing the entire "stage all".
      for (const repoPath of repoPaths) {
        await git.raw(["add", "--", literalPathspec(repoPath)]).catch((perPathError) => {
          const perPathText = parseGitErrorText(perPathError)
          const perPathIsPathspecError =
            perPathText.includes("pathspec") && perPathText.includes("did not match any files")
          if (!perPathIsPathspecError) {
            throw perPathError
          }
        })
      }
    })
  })
}

export async function unstageFile(directory, filePath) {
  await unstageFiles(directory, [filePath])
}

export async function unstageFiles(directory, paths) {
  if (!directory) {
    throw new Error("directory and path are required for unstageFile")
  }

  const filePaths = normalizeFilePathList(paths)
  if (filePaths.length === 0) {
    throw new Error("directory and path are required for unstageFile")
  }
  validateRepositoryFilePaths(normalizeDirectoryPath(directory), filePaths)

  await withGitIndexMutationQueue(directory, async () => {
    const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory)
    const repoPaths = Array.from(
      new Set(
        await Promise.all(
          filePaths.map(async (filePath) => {
            const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot)
            return fileContext.repoPath
          }),
        ),
      ),
    )
    validateRepositoryFilePaths(repoRoot, repoPaths)
    await git.raw(["restore", "--staged", "--", ...repoPaths.map(literalPathspec)]).catch(async () => {
      await git.raw(["reset", "HEAD", "--", ...repoPaths.map(literalPathspec)])
    })
  })
}

// The patch names the file it edits; the route validated a declared path, so a patch whose
// post-image names a different file must be rejected rather than silently editing that one.
// A deletion patch instead carries the target in its `--- a/<path>` pre-image line.
// git writes a header path that needs escaping (non-ASCII, quotes, control
// characters) as a C-style quoted string with octal byte escapes.
const C_QUOTE_ESCAPES = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '"': 34, "\\": 92 }
const unquoteGitHeaderPath = (value) => {
  if (!value.startsWith('"') || !value.endsWith('"') || value.length < 2) {
    return value
  }
  const bytes = []
  const body = value.slice(1, -1)
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]
    if (character !== "\\") {
      bytes.push(...Buffer.from(character, "utf8"))
      continue
    }
    const next = body[index + 1]
    if (/[0-7]/.test(next ?? "")) {
      bytes.push(parseInt(body.slice(index + 1, index + 4), 8))
      index += 3
      continue
    }
    bytes.push(C_QUOTE_ESCAPES[next] ?? next.charCodeAt(0))
    index += 1
  }
  return Buffer.from(bytes).toString("utf8")
}

const HUNK_HEADER_PATTERN = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/

/**
 * The file sections a patch declares: its `--- `/`+++ ` header pairs that are not part of a hunk body.
 *
 * A hunk body is content — its lines start with ` `, `+`, `-` or `\` — and a removed `-- old` line directly above
 * the added `++ new` line that replaces it renders as `--- old` / `+++ new`, which reads exactly like a header.
 * The body is consumed by the line counts its `@@ ` header declares (a `\ No newline` marker is not among them, so
 * it is skipped), and only pairs outside every body are sections. Counting `diff --git` lines is not enough on
 * its own: a patch can start another file's section straight at a `--- `/`+++ ` pair.
 *
 * The two counts are tracked separately because a context line belongs to both: draining them together would
 * consume `oldCount + newCount` lines for a body of `max(oldCount, newCount)` and read the lines that follow the
 * hunk as body. That both hid a second file section — the guard counts sections, so it saw only one — and read a
 * later hunk's own `--- x`/`+++ y` body lines as a second section.
 */
const declaredFileSections = (lines) => {
  const sections = []
  let index = 0
  while (index < lines.length) {
    const hunk = HUNK_HEADER_PATTERN.exec(lines[index])
    if (hunk) {
      let oldRemaining = hunk[1] === undefined ? 1 : Number(hunk[1])
      let newRemaining = hunk[2] === undefined ? 1 : Number(hunk[2])
      index += 1
      while ((oldRemaining > 0 || newRemaining > 0) && index < lines.length) {
        const line = lines[index]
        if (line.startsWith("\\ ")) {
          index += 1
          continue
        }
        if (!line.startsWith("+")) {
          oldRemaining -= 1
        }
        if (!line.startsWith("-")) {
          newRemaining -= 1
        }
        index += 1
      }
      continue
    }
    if (lines[index].startsWith("--- ") && (lines[index + 1] ?? "").startsWith("+++ ")) {
      sections.push({ preImage: lines[index], postImage: lines[index + 1] })
      index += 2
      continue
    }
    index += 1
  }
  return sections
}

const patchTargetsDeclaredPath = (patchText, repoPath) => {
  const allLines = patchText.split("\n")
  // One file only: a second section would let the patch edit another file, whether it carries its own
  // `diff --git` line or starts straight at a `--- `/`+++ ` pair.
  const sections = declaredFileSections(allLines)
  if (sections.length !== 1) {
    return false
  }
  const [section] = sections
  const postImage = section?.postImage
  if (!postImage) {
    return false
  }

  const postImagePath = unquoteGitHeaderPath(postImage.slice(4).trim())
  if (postImagePath === `b/${repoPath}`) {
    return true
  }

  if (postImagePath === "/dev/null") {
    return unquoteGitHeaderPath((section.preImage ?? "").slice(4).trim()) === `a/${repoPath}`
  }

  return false
}

const applyHunkPatchToIndex = async (directory, filePath, patch, direction) => {
  const action = direction === "unstage" ? "unstage" : "stage"
  const patchText = typeof patch === "string" ? patch : ""

  if (!directory || !filePath || !patchText.trim()) {
    throw new Error(`directory, path, and patch are required to ${action} a hunk`)
  }
  validateRepositoryFilePaths(normalizeDirectoryPath(directory), [filePath])

  await withGitIndexMutationQueue(directory, async () => {
    const { directoryPath, directoryGit, repoRoot } = await createRepositoryGitContext(directory)
    const { repoPath } = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot)
    validateRepositoryFilePaths(repoRoot, [repoPath])

    if (!patchTargetsDeclaredPath(patchText, repoPath)) {
      throw new Error(`Patch does not target ${filePath}`)
    }

    const args = ["apply", "--cached", "--unidiff-zero", "--whitespace=nowarn"]
    if (direction === "unstage") {
      args.push("--reverse")
    }

    const result = await runGitCommandWithInput(repoRoot, args, patchText)
    if (!result.success) {
      throw new Error(result.message || `Failed to ${action} hunk`)
    }
  })
}

export async function stageHunk(directory, filePath, patch) {
  await applyHunkPatchToIndex(directory, filePath, patch, "stage")
}

export async function unstageHunk(directory, filePath, patch) {
  await applyHunkPatchToIndex(directory, filePath, patch, "unstage")
}

/**
 * The index entry (mode and blob) per path, so a file that was temporarily unstaged can be put back
 * exactly as it was. `git add` re-stages the *worktree* content instead, which folds edits the user
 * left unstaged into the next commit and can never restore a staged state that differs from the file.
 */
const readStagedIndexEntries = async (git, paths) => {
  const entries = new Map()
  try {
    // -z so a path with quotes or newlines is still one record.
    const raw = await git.raw(["ls-files", "--stage", "-z", "--", ...paths.map(literalPathspec)])
    for (const record of raw.split("\0")) {
      if (!record) {
        continue
      }
      const tabIndex = record.indexOf("\t")
      if (tabIndex < 0) {
        continue
      }
      const [mode, object, stage] = record.slice(0, tabIndex).split(" ")
      // Stage 0 only: an unmerged path has no single entry to restore.
      if (stage !== "0" || !mode || !object) {
        continue
      }
      entries.set(record.slice(tabIndex + 1), { mode, object })
    }
    // A staged deletion has no index entry at all — `ls-files --stage` lists nothing for a path that is
    // gone — so the loop above records nothing for it and the path came back unstaged after the commit.
    // HEAD is what distinguishes "deleted" from "never tracked".
    const headRaw = await git.raw(["ls-tree", "--full-tree", "-z", "HEAD", "--", ...paths.map(literalPathspec)]).catch(() => "")
    for (const record of String(headRaw || "").split("\0")) {
      if (!record) {
        continue
      }
      const headTabIndex = record.indexOf("\t")
      if (headTabIndex < 0) {
        continue
      }
      const [headMode, , headObject] = record.slice(0, headTabIndex).split(" ")
      const headPath = record.slice(headTabIndex + 1)
      if (!headMode || !headObject || entries.has(headPath)) {
        continue
      }
      entries.set(headPath, { deletion: true })
    }
  } catch (error) {
    console.error("Failed to read the staged entries that are about to be unstaged:", error)
  }
  return entries
}

const restoreStagedIndexEntries = async (git, paths, entries) => {
  for (const filePath of paths) {
    const entry = entries.get(filePath)
    if (!entry) {
      continue
    }
    if (entry.deletion) {
      // A staged deletion *is* the absence of an index entry, which `update-index --cacheinfo` cannot
      // express: `--force-remove` drops the entry without touching the worktree file.
      await git.raw(["update-index", "--force-remove", "--", filePath])
      continue
    }
    // `--add` is required for an entry that is not in the index anymore (a staged addition that was
    // just unstaged); the three-argument form passes the path without any comma-delimited parsing.
    await git.raw(["update-index", "--add", "--cacheinfo", entry.mode, entry.object, filePath])
  }
}

export async function commit(directory, message, options = {}) {
  return withGitIndexMutationQueue(directory, async () => {
    const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory)
    let temporarilyUnstagedFiles = []
    let preservedIndexEntries = new Map()

    try {
      const requestedFiles = Array.isArray(options.files) ? normalizeFilePathList(options.files) : []
      const requestedStageFiles = Array.isArray(options.stageFiles) ? normalizeFilePathList(options.stageFiles) : null
      let filesToCommit = []
      let commitFromIndexOnly = false

      if (options.addAll) {
        await git.add(".")
      } else if (requestedFiles.length > 0) {
        filesToCommit = Array.from(
          new Set(
            await Promise.all(
              requestedFiles.map(async (filePath) => {
                const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot)
                return fileContext.repoPath
              }),
            ),
          ),
        )

        const stageFilesToCommit = requestedStageFiles
          ? Array.from(
              new Set(
                await Promise.all(
                  requestedStageFiles.map(async (filePath) => {
                    const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot)
                    return fileContext.repoPath
                  }),
                ),
              ),
            )
          : null

        const status = await git.status()
        const fileStatusByPath = new Map(status.files.map((file) => [file.path, file]))
        filesToCommit = filesToCommit.filter((filePath) => fileStatusByPath.has(filePath))

        if (filesToCommit.length === 0) {
          throw new Error("No selected files are available to commit. Refresh git status and try again.")
        }

        if (requestedStageFiles) {
          commitFromIndexOnly = true
          const selectedFileSet = new Set(filesToCommit)
          temporarilyUnstagedFiles = status.files
            .filter((file) => {
              const indexStatus = (file.index || "").trim()
              return indexStatus && indexStatus !== "?" && !selectedFileSet.has(file.path)
            })
            .map((file) => file.path)

          if (temporarilyUnstagedFiles.length > 0) {
            preservedIndexEntries = await readStagedIndexEntries(git, temporarilyUnstagedFiles)
            await git.raw(["restore", "--staged", "--", ...temporarilyUnstagedFiles.map(literalPathspec)])
          }
        }

        const filesNeedingAdd = requestedStageFiles
          ? (stageFilesToCommit || []).filter((filePath) => fileStatusByPath.has(filePath))
          : filesToCommit.filter((filePath) => {
              const fileStatus = fileStatusByPath.get(filePath)
              if (!fileStatus) {
                return false
              }

              const alreadyFullyStaged = fileStatus.index !== " " && fileStatus.working_dir === " "
              return !alreadyFullyStaged
            })

        if (filesNeedingAdd.length > 0) {
          await git.raw(["add", "--", ...filesNeedingAdd.map(literalPathspec)])
        }
      }

      // `--` stops a file name such as `--amend` from being parsed as a commit
      // option; literal pathspecs keep glob characters from matching siblings.
      const commitArgs =
        !commitFromIndexOnly && !options.addAll && filesToCommit.length > 0
          ? ["--", ...filesToCommit.map(literalPathspec)]
          : undefined

      let result
      try {
        result = await git.commit(message, commitArgs)
      } catch (error) {
        const gitErrorText = parseGitErrorText(error)
        const isPathspecError = gitErrorText.includes("pathspec") && gitErrorText.includes("did not match any files")
        if (!isPathspecError || !commitArgs || commitArgs.length === 0) {
          throw error
        }

        // Fallback for deleted/stale selections: commit currently staged changes.
        result = await git.commit(message)
      }

      if (temporarilyUnstagedFiles.length > 0) {
        await restoreStagedIndexEntries(git, temporarilyUnstagedFiles, preservedIndexEntries).catch((restoreError) => {
          console.error("Failed to restore temporarily unstaged files:", restoreError)
        })
      }

      return {
        success: true,
        commit: result.commit,
        branch: result.branch,
        summary: result.summary,
      }
    } catch (error) {
      if (temporarilyUnstagedFiles.length > 0) {
        await restoreStagedIndexEntries(git, temporarilyUnstagedFiles, preservedIndexEntries).catch((restoreError) => {
          console.error("Failed to restore temporarily unstaged files after commit failure:", restoreError)
        })
      }
      console.error("Failed to commit:", error)
      throw error
    }
  })
}

export async function getBranches(directory) {
  const { git } = await createRepositoryGitContext(directory)

  try {
    const result = await git.branch()

    const allBranches = result.all
    const remoteBranches = allBranches.filter((branch) => branch.startsWith("remotes/"))
    const activeRemoteBranches = await filterActiveRemoteBranches(git, remoteBranches)

    const filteredAll = [...allBranches.filter((branch) => !branch.startsWith("remotes/")), ...activeRemoteBranches]

    return {
      all: filteredAll,
      current: result.current,
      branches: result.branches,
    }
  } catch (error) {
    console.error("Failed to get branches:", error)
    throw error
  }
}

async function filterActiveRemoteBranches(git, remoteBranches) {
  try {
    const remotes = await git.getRemotes()
    const branchesByRemote = new Map()

    await Promise.all(
      remotes.map(async (remote) => {
        try {
          const lsRemoteResult = await git.raw(["ls-remote", "--heads", remote.name])
          const actualRemoteBranches = new Set()
          const lines = lsRemoteResult.trim().split("\n")
          for (const line of lines) {
            if (line.includes("\trefs/heads/")) {
              const branchName = line.split("\t")[1].replace("refs/heads/", "")
              actualRemoteBranches.add(branchName)
            }
          }
          branchesByRemote.set(remote.name, actualRemoteBranches)
        } catch {
          // Skip remotes that fail (e.g., unreachable)
        }
      }),
    )

    return remoteBranches.filter((remoteBranch) => {
      const match = remoteBranch.match(/^remotes\/[^\/]+\/(.+)$/)
      if (!match) return false
      const remoteName = remoteBranch.split("/")[1]
      const branchName = match[1]
      return branchesByRemote.get(remoteName)?.has(branchName) ?? false
    })
  } catch (error) {
    console.warn("Failed to filter active remote branches, returning all:", error.message)
    return remoteBranches
  }
}

export async function createBranch(directory, branchName, options = {}) {
  const { git } = await createRepositoryGitContext(directory)

  try {
    await git.checkoutBranch(branchName, options.startPoint || "HEAD")
    return { success: true, branch: branchName }
  } catch (error) {
    console.error("Failed to create branch:", error)
    throw error
  }
}

/** Whether a checkout target names something git can check out as a revision (not a path or an option). */
async function isCheckoutableRevision(git, name) {
  const value = String(name || "").trim()
  if (!value || value.startsWith("-")) {
    return false
  }
  return git
    .raw(["rev-parse", "--verify", "--quiet", `${value}^{commit}`])
    .then((output) => Boolean(String(output || "").trim()))
    .catch(() => false)
}

export async function checkoutBranch(directory, branchName) {
  const { git } = await createRepositoryGitContext(directory)

  try {
    const target = await resolveCheckoutBranchName(git, branchName)
    // `git checkout origin/feature` detaches HEAD when the remote-tracking ref
    // resolves: the new commits then belong to no branch and are easy to lose. A
    // remote-tracking name therefore becomes (or reuses) a local branch that tracks it.
    if (target.remoteRef) {
      if (target.existsLocally) {
        await git.checkout(target.local)
        await git.raw(["branch", "--set-upstream-to", target.remoteRef, target.local]).catch(() => {})
      } else {
        try {
          // --track explicitly, so the upstream is set regardless of the user's
          // branch.autoSetupMerge setting.
          await git.raw(["checkout", "-b", target.local, "--track", target.remoteRef])
        } catch {
          // Without a configured remote there is nothing to track, but the local
          // branch must still be created rather than detaching HEAD.
          await git.raw(["checkout", "-b", target.local, target.remoteRef])
        }
      }
    } else {
      // Git's DWIM reads a value that names a tracked file as a pathspec: `git checkout README.md`
      // restored that file from the index and discarded the user's uncommitted edits, while this
      // function reported a successful branch checkout. Only a revision is checked out.
      if (!(await isCheckoutableRevision(git, target.local))) {
        throw new Error(`No branch or revision named "${target.local}"`)
      }
      await git.checkout(target.local)
    }
    return { success: true, branch: target.local }
  } catch (error) {
    console.error("Failed to checkout branch:", error)
    throw error
  }
}

/** Resolve `origin/feature` to the local branch it should be worked on. */
async function resolveCheckoutBranchName(git, branchName) {
  const name = String(branchName || "").trim()
  if (!name) {
    return { local: name, remoteRef: null, existsLocally: false }
  }

  const locals = await git
    .branchLocal()
    .then((result) => (Array.isArray(result?.all) ? result.all : []))
    .catch(() => [])

  if (locals.includes(name)) {
    return { local: name, remoteRef: null, existsLocally: true }
  }

  const remotes = await git
    .branch(["-r"])
    .then((result) => (Array.isArray(result?.all) ? result.all : []))
    .catch(() => [])

  if (!remotes.includes(name)) {
    return { local: name, remoteRef: null, existsLocally: false }
  }

  const separator = name.indexOf("/")
  if (separator <= 0) {
    return { local: name, remoteRef: null, existsLocally: false }
  }

  const local = name.slice(separator + 1)
  return { local, remoteRef: name, existsLocally: locals.includes(local) }
}

export async function checkoutCommit(directory, hash) {
  if (!isValidCommitHash(hash)) {
    throw new Error("Invalid commit hash")
  }
  const { git } = await createRepositoryGitContext(directory)
  // A hex-looking value that names no commit falls through to git's pathspec
  // semantics: `git checkout deadbeef` restores a tracked file with that name
  // and discards its uncommitted changes instead of failing.
  if (!(await isCheckoutableRevision(git, hash))) {
    throw new Error("Invalid commit hash")
  }
  try {
    await git.checkout(hash)
    return { success: true }
  } catch (error) {
    console.error("Failed to checkout commit:", error)
    throw error
  }
}

export async function cherryPick(directory, hash) {
  if (!isValidCommitHash(hash)) {
    throw new Error("Invalid commit hash")
  }
  const { git } = await createRepositoryGitContext(directory)
  try {
    await git.raw(["cherry-pick", hash])
    return { success: true, conflict: false }
  } catch (error) {
    const errorMessage = String(error?.message || error || "").toLowerCase()
    const isConflict = errorMessage.includes("conflict") || errorMessage.includes("patch does not apply")

    if (isConflict) {
      const status = await git.status().catch(() => ({ conflicted: [] }))
      return {
        success: false,
        conflict: true,
        conflictFiles: status.conflicted || [],
      }
    }

    console.error("Failed to cherry-pick:", error)
    throw error
  }
}

export async function revertCommit(directory, hash) {
  if (!isValidCommitHash(hash)) {
    throw new Error("Invalid commit hash")
  }
  const { git } = await createRepositoryGitContext(directory)
  try {
    await git.raw(["revert", "--no-commit", hash])
    return { success: true, conflict: false }
  } catch (error) {
    const errorMessage = String(error?.message || error || "").toLowerCase()
    const isConflict = errorMessage.includes("conflict") || errorMessage.includes("revert failed")

    if (isConflict) {
      const status = await git.status().catch(() => ({ conflicted: [] }))
      return {
        success: false,
        conflict: true,
        conflictFiles: status.conflicted || [],
      }
    }

    console.error("Failed to revert commit:", error)
    throw error
  }
}

export async function resetToCommit(directory, hash, mode, force = false) {
  if (!isValidCommitHash(hash)) {
    throw new Error("Invalid commit hash")
  }
  const { git } = await createRepositoryGitContext(directory)

  if (mode === "hard" && !force) {
    const status = await git.status()
    const isDirty = !status.isClean()
    if (isDirty) {
      throw new Error("Cannot hard reset: uncommitted changes in working tree. Stash or commit first, or use force.")
    }
  }

  try {
    await git.raw(["reset", `--${mode}`, hash])
    return { success: true }
  } catch (error) {
    console.error("Failed to reset to commit:", error)
    throw error
  }
}

export async function getWorktrees(directory) {
  const directoryPath = normalizeDirectoryPath(directory)
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    return []
  }
  try {
    const directoryGit = await createGit(directoryPath)
    // A bare repository answers `--show-toplevel` with a fatal error while still listing the worktrees
    // linked to it; it is its own root for this command, and its own bare entry is filtered out below.
    const repoRoot = await resolveGitRepositoryRoot(directoryPath, directoryGit).catch(() => directoryPath)
    const result = await runGitCommandOrThrow(
      repoRoot,
      ["worktree", "list", "--porcelain"],
      "Failed to list git worktrees",
    )
    return parseWorktreePorcelain(result.stdout)
      .filter((entry) => !entry.bare)
      .map((entry) => ({
        head: entry.head || "",
        name: path.basename(entry.worktree || ""),
        branch: entry.branch || "",
        path: entry.worktree,
      }))
  } catch (error) {
    console.warn("Failed to list worktrees, returning empty list:", error?.message || error)
    return []
  }
}

export async function validateWorktreeCreate(directory, input = {}) {
  const mode = input?.mode === "existing" ? "existing" : "new"
  const errors = []

  try {
    const context = await resolveWorktreeProjectContext(directory)
    const preferredBranchName = cleanBranchName(String(input?.branchName || "").trim())
    const startRef = normalizeStartRef(input?.startRef)
    const ensureRemoteName = String(input?.ensureRemoteName || "").trim()
    const ensureRemoteUrl = String(input?.ensureRemoteUrl || "").trim()

    let localBranch = ""
    let inferredUpstream = null

    if (mode === "existing") {
      try {
        const requestedExistingBranch = String(input?.existingBranch || "").trim()
        const parsedExistingRemote = await resolveRemoteBranchRef(context.primaryWorktree, requestedExistingBranch)
        if (
          parsedExistingRemote &&
          ensureRemoteName &&
          ensureRemoteUrl &&
          ensureRemoteName === parsedExistingRemote.remote
        ) {
          const lsRemote = await runGitCommand(context.primaryWorktree, [
            "ls-remote",
            "--heads",
            ensureRemoteUrl,
            `refs/heads/${parsedExistingRemote.branch}`,
          ])
          if (!lsRemote.success) {
            throw new Error(`Unable to query remote ${ensureRemoteName}`)
          }
          if (!String(lsRemote.stdout || "").trim()) {
            throw new Error(`Remote branch not found: ${parsedExistingRemote.remoteRef}`)
          }
          localBranch = cleanBranchName(preferredBranchName || parsedExistingRemote.branch)
          inferredUpstream = {
            remote: parsedExistingRemote.remote,
            branch: parsedExistingRemote.branch,
          }
        } else {
          const resolved = await resolveBranchForExistingMode(
            context.primaryWorktree,
            requestedExistingBranch,
            preferredBranchName,
          )
          localBranch = resolved.localBranch || ""
          if (resolved.remoteRef) {
            inferredUpstream = {
              remote: resolved.remoteRef.remote,
              branch: resolved.remoteRef.branch,
            }
          }
        }
      } catch (error) {
        errors.push({
          code: "branch_not_found",
          message: error instanceof Error ? error.message : "Existing branch not found",
        })
      }
    } else {
      if (preferredBranchName) {
        const exists = await runGitCommand(context.primaryWorktree, [
          "show-ref",
          "--verify",
          "--quiet",
          `refs/heads/${preferredBranchName}`,
        ])
        if (exists.success) {
          errors.push({
            code: "branch_exists",
            message: `Branch already exists: ${preferredBranchName}`,
          })
        }
        localBranch = preferredBranchName
      }

      const parsedRemoteRef = await resolveRemoteBranchRef(context.primaryWorktree, startRef)
      if (startRef && startRef !== "HEAD") {
        if (parsedRemoteRef && ensureRemoteName && ensureRemoteUrl && ensureRemoteName === parsedRemoteRef.remote) {
          const remoteCheck = await checkRemoteBranchExists(
            context.primaryWorktree,
            parsedRemoteRef.remote,
            parsedRemoteRef.branch,
            ensureRemoteUrl,
          )
          if (!remoteCheck.success) {
            errors.push({
              code: "remote_unreachable",
              message: `Unable to query remote ${ensureRemoteName}`,
            })
          } else if (!remoteCheck.found) {
            errors.push({
              code: "start_ref_not_found",
              message: `Remote branch not found: ${parsedRemoteRef.remoteRef}`,
            })
          }
        } else if (parsedRemoteRef) {
          const remoteCheck = await checkRemoteBranchExists(
            context.primaryWorktree,
            parsedRemoteRef.remote,
            parsedRemoteRef.branch,
          )
          if (!remoteCheck.success) {
            errors.push({
              code: "remote_unreachable",
              message: `Unable to query remote ${parsedRemoteRef.remote}`,
            })
          } else if (!remoteCheck.found) {
            errors.push({
              code: "start_ref_not_found",
              message: `Remote branch not found: ${parsedRemoteRef.remoteRef}`,
            })
          }
        } else {
          const startRefExists = await runGitCommand(context.primaryWorktree, [
            "rev-parse",
            "--verify",
            "--quiet",
            startRef,
          ])
          if (!startRefExists.success) {
            errors.push({
              code: "start_ref_not_found",
              message: `Start ref not found: ${startRef}`,
            })
          }
        }
      }

      if (parsedRemoteRef) {
        inferredUpstream = {
          remote: parsedRemoteRef.remote,
          branch: parsedRemoteRef.branch,
        }
      }
    }

    if (localBranch) {
      const inUse = await findBranchInUse(context.primaryWorktree, localBranch)
      if (inUse) {
        errors.push({
          code: "branch_in_use",
          message: `Branch is already checked out in ${inUse.worktree}`,
        })
      }
    }

    if ((ensureRemoteName && !ensureRemoteUrl) || (!ensureRemoteName && ensureRemoteUrl)) {
      errors.push({
        code: "invalid_remote_config",
        message: "Both ensureRemoteName and ensureRemoteUrl are required together",
      })
    }

    const shouldSetUpstream = Boolean(input?.setUpstream)
    if (shouldSetUpstream) {
      const upstreamRemote = String(input?.upstreamRemote || inferredUpstream?.remote || "").trim()
      const upstreamBranch = String(input?.upstreamBranch || inferredUpstream?.branch || "").trim()

      if (!upstreamRemote || !upstreamBranch) {
        errors.push({
          code: "upstream_incomplete",
          message: "upstreamRemote and upstreamBranch are required when setUpstream is true",
        })
      } else {
        const remoteExists = await runGitCommand(context.primaryWorktree, ["remote", "get-url", upstreamRemote])
        if (!remoteExists.success && (!ensureRemoteName || ensureRemoteName !== upstreamRemote)) {
          errors.push({
            code: "remote_not_found",
            message: `Remote not found: ${upstreamRemote}`,
          })
        }
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      resolved: {
        mode,
        localBranch: localBranch || null,
      },
    }
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          code: "validation_failed",
          message: error instanceof Error ? error.message : "Failed to validate worktree creation",
        },
      ],
    }
  }
}

// The runtime chooses the worktree's location, so a preview reports the name and branch it will ask
// for and no path: the path is known once `worktree.create` answers.
export async function previewWorktreeCreate(directory, input = {}) {
  const mode = input?.mode === "existing" ? "existing" : "new"
  await resolveWorktreeProjectContext(directory)

  const name = slugWorktreeName(String(input?.worktreeName || input?.name || "").trim())
  const preferredBranchName = cleanBranchName(String(input?.branchName || "").trim())
  const branch = preferredBranchName || (mode === "new" && name ? `ax-code/${name}` : "")

  return {
    name,
    branch,
    path: "",
  }
}

/**
 * Create a worktree through the runtime (ADR-020, runtime worktree migration v1).
 *
 * Desktop keeps the interactive version-control steps in the primary checkout — adding or updating a
 * fork remote, fetching the remote ref the worktree starts from, and setting the new branch's
 * upstream — and asks the runtime for everything else: the location, `git worktree add`, sandbox
 * registration and the start scripts. Bootstrap progress arrives as `worktree.ready` /
 * `worktree.failed` runtime events (`recordWorktreeRuntimeEvent`).
 *
 * `deps.getWorktreeClient(directory)` returns the SDK client.
 */
export async function createWorktree(directory, input = {}, deps = {}) {
  const mode = input?.mode === "existing" ? "existing" : "new"
  const context = await resolveWorktreeProjectContext(directory)

  const preferredName = String(input?.worktreeName || input?.name || "").trim()
  const preferredBranchName = cleanBranchName(String(input?.branchName || "").trim())
  const startRef = normalizeStartRef(input?.startRef)
  const ensureRemoteName = String(input?.ensureRemoteName || "").trim()
  const ensureRemoteUrl = String(input?.ensureRemoteUrl || "").trim()

  const worktreeCreateInput = {}
  if (preferredName) {
    worktreeCreateInput.name = preferredName
  }

  let localBranch = ""
  let inferredUpstream = null
  let parsedRemoteStartRef = null

  if (mode === "existing") {
    const requestedExistingBranch = rejectOptionLikeValue(input?.existingBranch, "branch name")
    const parsedExistingRemote = await resolveRemoteBranchRef(context.primaryWorktree, requestedExistingBranch)
    if (
      parsedExistingRemote &&
      ensureRemoteName &&
      ensureRemoteUrl &&
      parsedExistingRemote.remote === ensureRemoteName
    ) {
      await ensureRemoteWithUrl(context.primaryWorktree, ensureRemoteName, ensureRemoteUrl)
      await fetchRemoteBranchRef(context.primaryWorktree, parsedExistingRemote.remote, parsedExistingRemote.branch)
    }

    const resolved = await resolveBranchForExistingMode(
      context.primaryWorktree,
      requestedExistingBranch,
      preferredBranchName,
    )
    localBranch = resolved.localBranch

    if (resolved.createLocalBranch) {
      // A remote branch becomes a new local branch the runtime owns, started from the remote ref.
      worktreeCreateInput.branch = localBranch
      worktreeCreateInput.startRef = resolved.checkoutRef
    } else {
      // The user's own branch is borrowed: the runtime never deletes or resets it.
      worktreeCreateInput.existingBranch = localBranch
    }

    if (resolved.remoteRef) {
      inferredUpstream = {
        remote: resolved.remoteRef.remote,
        branch: resolved.remoteRef.branch,
      }
    }
  } else {
    if (preferredBranchName) {
      worktreeCreateInput.branch = preferredBranchName
      localBranch = preferredBranchName
    }
    if (startRef && startRef !== "HEAD") {
      worktreeCreateInput.startRef = startRef
    }

    parsedRemoteStartRef = await resolveRemoteBranchRef(context.primaryWorktree, startRef)
    if (parsedRemoteStartRef) {
      inferredUpstream = {
        remote: parsedRemoteStartRef.remote,
        branch: parsedRemoteStartRef.branch,
      }
    }
  }

  if (ensureRemoteName && ensureRemoteUrl) {
    await ensureRemoteWithUrl(context.primaryWorktree, ensureRemoteName, ensureRemoteUrl)
  }

  if (parsedRemoteStartRef) {
    await fetchRemoteBranchRef(context.primaryWorktree, parsedRemoteStartRef.remote, parsedRemoteStartRef.branch)
  }

  const startCommand = typeof input?.startCommand === "string" ? input.startCommand.trim() : ""
  if (startCommand) {
    worktreeCreateInput.startCommand = startCommand
  }
  // One ID per request: a transport retry of this call joins the first create instead of making a
  // second worktree.
  worktreeCreateInput.operationId = randomUUID()

  const client = resolveWorktreeRuntimeClient(deps, context.primaryWorktree)
  const requestedAt = Date.now()
  const created = unwrapRuntimeResult(
    await client.worktree.create({ directory: context.primaryWorktree, worktreeCreateInput }),
    "Failed to create git worktree",
  )

  const worktreePath = typeof created?.directory === "string" ? created.directory.trim() : ""
  if (!worktreePath) {
    throw new Error("The runtime did not report the new worktree's directory")
  }
  const branch = typeof created?.branch === "string" && created.branch.trim() ? created.branch.trim() : localBranch
  const name = typeof created?.name === "string" && created.name.trim() ? created.name.trim() : path.basename(worktreePath)

  startWorktreeBootstrapState(worktreePath, requestedAt)

  const shouldSetUpstream = Boolean(input?.setUpstream)
  if (shouldSetUpstream) {
    const upstreamRemote = String(input?.upstreamRemote || inferredUpstream?.remote || "").trim()
    const upstreamBranch = String(input?.upstreamBranch || inferredUpstream?.branch || "").trim()
    await applyUpstreamConfiguration({
      primaryWorktree: context.primaryWorktree,
      worktreeDirectory: worktreePath,
      localBranch: branch,
      setUpstream: shouldSetUpstream,
      upstreamRemote,
      upstreamBranch,
      ensureRemoteName,
      ensureRemoteUrl,
    }).catch((error) => {
      console.warn("Worktree upstream configuration failed:", error instanceof Error ? error.message : String(error))
    })
  }

  // The runtime populates the checkout after it answers; HEAD can still be unreadable here.
  const headResult = await runGitCommand(worktreePath, ["rev-parse", "HEAD"])
  const head = headResult.success ? String(headResult.stdout || "").trim() : ""

  return {
    head,
    name,
    branch,
    path: worktreePath,
  }
}

export async function getWorktreeBootstrapStatus(directory) {
  const key = toBootstrapStateKey(directory)
  if (!key) {
    throw new Error("Worktree directory is required")
  }

  const current = worktreeBootstrapState.get(key)
  if (current) {
    return current
  }

  return {
    status: WORKTREE_BOOTSTRAP_READY,
    error: null,
    updatedAt: Date.now(),
  }
}

/**
 * Remove a worktree through the runtime. The runtime deletes the worktree's branch only when it owns
 * it (AX Code ADR-260); a branch it keeps — the user's own, or one an older Desktop created — is
 * reported back when the caller asked for the local branch to be deleted.
 */
export async function removeWorktree(directory, input = {}, deps = {}) {
  const targetDirectory = normalizeDirectoryPath(input?.directory)
  if (!targetDirectory) {
    throw new Error("Worktree directory is required")
  }

  const context = await resolveWorktreeProjectContext(directory)
  const deleteLocalBranch = input?.deleteLocalBranch === true

  const targetCanonical = await canonicalPath(targetDirectory)
  const primaryCanonical = await canonicalPath(context.primaryWorktree)
  if (targetCanonical === primaryCanonical) {
    throw new Error("Cannot remove the primary workspace")
  }

  // Read-only: the branch the worktree has checked out. Keeping or deleting
  // that branch depends on knowing it, so a failed listing stops the removal
  // instead of letting the runtime delete a branch the user meant to keep.
  let entries
  try {
    entries = await listWorktreeEntries(context.primaryWorktree)
  } catch (error) {
    throw new Error(
      `Could not read the worktree list, so nothing was removed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  let matchedEntry = null
  for (const entry of entries) {
    if (entry?.worktree && (await canonicalPath(entry.worktree)) === targetCanonical) {
      matchedEntry = entry
      break
    }
  }
  const branchName = cleanBranchName(String(matchedEntry?.branchRef || matchedEntry?.branch || "").trim())

  // The runtime deletes every branch it created when it removes the worktree.
  // When the user asks to keep the branch, claim it for them first with the
  // AX Code borrowed mark (ADR-260: a borrowed branch is never deleted or
  // reset), so unmerged work survives the removal.
  if (!deleteLocalBranch && branchName) {
    await runGitCommandOrThrow(
      context.primaryWorktree,
      ["config", `branch.${branchName}.axCodeBorrowed`, branchName],
      "Failed to keep the worktree branch",
    )
  }

  const client = resolveWorktreeRuntimeClient(deps, context.primaryWorktree)
  unwrapRuntimeResult(
    await client.worktree.remove({
      directory: context.primaryWorktree,
      worktreeRemoveInput: { directory: targetDirectory },
    }),
    "Failed to remove git worktree",
  )

  clearWorktreeBootstrapState(targetDirectory)
  if (matchedEntry?.worktree) {
    clearWorktreeBootstrapState(matchedEntry.worktree)
  }

  // The runtime keeps branches it does not own (a borrowed existing branch, or
  // one the user kept earlier). An explicit request to delete the local branch
  // is a user-initiated version-control step (ADR-020), so Desktop performs it.
  if (deleteLocalBranch && branchName) {
    const stillExists = await runGitCommand(context.primaryWorktree, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${branchName}`,
    ])
    if (stillExists.success) {
      await runGitCommandOrThrow(
        context.primaryWorktree,
        ["branch", "-D", "--", branchName],
        `Removed the worktree but could not delete the local branch ${branchName}`,
      )
    }
  }

  return true
}

export async function deleteBranch(directory, branch, options = {}) {
  const { git } = await createRepositoryGitContext(directory)

  try {
    const branchName = branch.startsWith("refs/heads/") ? branch.substring("refs/heads/".length) : branch
    const args = ["branch", options.force ? "-D" : "-d", branchName]
    await git.raw(args)
    return { success: true }
  } catch (error) {
    console.error("Failed to delete branch:", error)
    throw error
  }
}

/**
 * Resolve a log base ref using local-first semantics.
 *
 * - If `from` is falsy / whitespace → return undefined.
 * - If the local ref resolves → return it unchanged (caller's intent preserved).
 * - If the local ref is absent but `origin/<from>` exists → return `origin/<from>`
 *   (common when the user has never checked out the base branch locally).
 * - If neither resolves → return `from` unchanged so git surfaces a meaningful error.
 *
 * @param {string | undefined} from   - The raw `from` option value.
 * @param {(ref: string) => Promise<boolean>} checkRef - Returns true when the ref resolves.
 * @returns {Promise<string | undefined>}
 */
export async function resolveBaseRefForLog(from, checkRef) {
  const normalized = typeof from === "string" ? from.trim() : undefined
  if (!normalized) return undefined

  if (await checkRef(normalized)) return normalized

  const originRef = `refs/remotes/origin/${normalized}`
  if (await checkRef(originRef)) return `origin/${normalized}`

  return normalized
}

export async function getLog(directory, options = {}) {
  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory)

  try {
    const maxCount = options.maxCount || 50

    if (options.all) {
      const logArgs = [
        "log",
        `--max-count=${maxCount}`,
        "--all",
        "--topo-order",
        "--date=iso",
        "--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%ad%x1f%s%x1f%D",
        "--shortstat",
      ]

      const rawLog = await git.raw(logArgs)
      const records = rawLog
        .split("\x1e")
        .map((e) => e.trim())
        .filter(Boolean)

      const entries = []
      for (const record of records) {
        const lines = record.split("\n").filter((l) => l.trim().length > 0)
        const header = lines.shift() || ""
        const [hash, parentsRaw, author_name, author_email, date, message, refsRaw] = header.split("\x1f")
        if (!hash) continue

        const parents = parentsRaw ? parentsRaw.trim().split(" ").filter(Boolean) : []
        const refs = refsRaw ? refsRaw.trim() : ""

        let filesChanged = 0
        let insertions = 0
        let deletions = 0
        for (const line of lines) {
          const filesMatch = line.match(/(\d+)\s+files?\s+changed/)
          const insertMatch = line.match(/(\d+)\s+insertions?\(\+\)/)
          const deleteMatch = line.match(/(\d+)\s+deletions?\(-\)/)
          if (filesMatch) filesChanged = parseInt(filesMatch[1], 10)
          if (insertMatch) insertions = parseInt(insertMatch[1], 10)
          if (deleteMatch) deletions = parseInt(deleteMatch[1], 10)
        }

        entries.push({
          hash,
          date: date || "",
          message: message || "",
          refs,
          body: "",
          author_name: author_name || "",
          author_email: author_email || "",
          filesChanged,
          insertions,
          deletions,
          parents,
        })
      }

      return { all: entries, latest: entries[0] || null, total: entries.length }
    }

    const filePath = options.file
      ? (await resolveGitFileContext(directoryPath, directoryGit, options.file, repoRoot)).repoPath
      : undefined

    // Prefer the local ref; fall back to origin/<from> only when the local ref
    // cannot be resolved (e.g. user has never checked out the base branch).
    const checkRef = async (ref) => {
      try {
        const out = await git.raw(["rev-parse", "--verify", ref])
        return Boolean(out && out.trim())
      } catch {
        return false
      }
    }
    const resolvedFrom = await resolveBaseRefForLog(options.from, checkRef)

    // simple-git builds a symmetric `from...to` range by default; the stats command below
    // uses `from..to`, so commits only on the base would be listed with zero stats.
    const baseLog = await git.log({
      maxCount,
      from: resolvedFrom,
      to: options.to,
      symmetric: false,
      file: filePath,
    })

    const logArgs = [
      "log",
      `--max-count=${maxCount}`,
      "--date=iso",
      "--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%ad%x1f%s",
      "--shortstat",
    ]

    if (resolvedFrom && options.to) {
      logArgs.push(`${resolvedFrom}..${options.to}`)
    } else if (resolvedFrom) {
      logArgs.push(`${resolvedFrom}..HEAD`)
    } else if (options.to) {
      logArgs.push(options.to)
    }

    if (filePath) {
      logArgs.push("--", literalPathspec(filePath))
    }

    const rawLog = await git.raw(logArgs)
    const records = rawLog
      .split("\x1e")
      .map((entry) => entry.trim())
      .filter(Boolean)

    const statsMap = new Map()

    records.forEach((record) => {
      const lines = record.split("\n").filter((line) => line.trim().length > 0)
      const header = lines.shift() || ""
      const [hash, parentsRaw] = header.split("\x1f")
      const parents = parentsRaw ? parentsRaw.trim().split(" ").filter(Boolean) : []
      if (!hash) {
        return
      }

      let filesChanged = 0
      let insertions = 0
      let deletions = 0

      lines.forEach((line) => {
        const filesMatch = line.match(/(\d+)\s+files?\s+changed/)
        const insertMatch = line.match(/(\d+)\s+insertions?\(\+\)/)
        const deleteMatch = line.match(/(\d+)\s+deletions?\(-\)/)

        if (filesMatch) {
          filesChanged = parseInt(filesMatch[1], 10)
        }
        if (insertMatch) {
          insertions = parseInt(insertMatch[1], 10)
        }
        if (deleteMatch) {
          deletions = parseInt(deleteMatch[1], 10)
        }
      })

      statsMap.set(hash, { filesChanged, insertions, deletions, parents })
    })

    const merged = baseLog.all.map((entry) => {
      const stats = statsMap.get(entry.hash) || { filesChanged: 0, insertions: 0, deletions: 0, parents: [] }
      return {
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        refs: entry.refs || "",
        body: entry.body || "",
        author_name: entry.author_name,
        author_email: entry.author_email,
        filesChanged: stats.filesChanged,
        insertions: stats.insertions,
        deletions: stats.deletions,
        parents: stats.parents || [],
      }
    })

    return {
      all: merged,
      latest: merged[0] || null,
      total: baseLog.total,
    }
  } catch (error) {
    console.error("Failed to get log:", error)
    throw error
  }
}

export async function isLinkedWorktree(directory) {
  const git = await createGit(directory)
  try {
    const [gitDir, gitCommonDir] = await Promise.all([
      git.raw(["rev-parse", "--git-dir"]).then((output) => output.trim()),
      git.raw(["rev-parse", "--git-common-dir"]).then((output) => output.trim()),
    ])
    return gitDir !== gitCommonDir
  } catch (error) {
    console.error("Failed to determine worktree type:", error)
    return false
  }
}

export async function validateWorktreeDirectory(directory, worktreeRoot) {
  const directoryPath = normalizeDirectoryPath(directory)
  const rootPath = normalizeDirectoryPath(worktreeRoot)

  if (!directoryPath || !rootPath) {
    return {
      valid: false,
      insideWorktreeRoot: false,
      resolvedWorktreeRoot: null,
      resolvedCwd: null,
    }
  }

  const isRepo = await isGitRepository(directoryPath)
  if (!isRepo) {
    return {
      valid: false,
      insideWorktreeRoot: false,
      resolvedWorktreeRoot: null,
      resolvedCwd: null,
    }
  }

  const resolvedCwd = await canonicalPath(directoryPath)
  const resolvedRoot = await canonicalPath(rootPath)

  const inside = resolvedCwd.startsWith(resolvedRoot + path.sep) || resolvedCwd === resolvedRoot

  return {
    valid: true,
    insideWorktreeRoot: inside,
    resolvedWorktreeRoot: resolvedRoot,
    resolvedCwd,
  }
}

export async function canonicalizeWorktreeState(directory) {
  const directoryPath = normalizeDirectoryPath(directory)

  if (!directoryPath) {
    return {
      worktreeRoot: null,
      cwd: null,
      branch: null,
      headState: "detached",
      worktreeStatus: "not-a-repo",
      legacy: false,
      degraded: false,
      attentionReason: null,
    }
  }

  const isRepo = await isGitRepository(directoryPath)
  if (!isRepo) {
    return {
      worktreeRoot: null,
      cwd: null,
      branch: null,
      headState: "detached",
      worktreeStatus: "not-a-repo",
      legacy: false,
      degraded: false,
      attentionReason: null,
    }
  }

  const cwd = await canonicalPath(directoryPath)
  const git = await createGit(directoryPath)
  const repoRoot = await resolveGitRepositoryRoot(directoryPath, git).catch(() => directoryPath)

  let worktreeRoot = null
  let worktreeStatus = "ready"
  /** @type {'branch' | 'detached' | 'unborn'} */
  let headState
  let branch = null
  let attentionReason = /** @type {'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect' | null} */ (null)

  try {
    const context = await resolveWorktreeProjectContext(directoryPath)
    worktreeRoot = await canonicalPath(context.worktreeRoot)
  } catch {
    worktreeStatus = "invalid"
  }

  try {
    const symbolicRef = await git.raw(["symbolic-ref", "-q", "HEAD"]).catch(() => "")
    if (symbolicRef.trim()) {
      headState = "branch"
      branch = cleanBranchName(symbolicRef.trim())
    } else {
      const revParse = await git.raw(["rev-parse", "HEAD"]).catch(() => "")
      if (!revParse.trim()) {
        headState = "unborn"
        branch = null
      } else {
        headState = "detached"
        branch = revParse.trim().slice(0, 7)
      }
    }
  } catch {
    headState = "unborn"
    branch = null
  }

  // Detect attention reasons from getStatus side-effects
  try {
    const status = await git.status(["-uall"])
    if (
      status.current &&
      (await git
        .raw(["rev-parse", "--verify", "MERGE_HEAD"])
        .then(() => true)
        .catch(() => false))
    ) {
      attentionReason = "merge"
    } else {
      const rebaseMergePath = await resolveGitInternalPath(repoRoot, git, "rebase-merge").catch(() => "")
      const rebaseApplyPath = await resolveGitInternalPath(repoRoot, git, "rebase-apply").catch(() => "")
      const rebaseMerge = rebaseMergePath
        ? await fsp
            .stat(rebaseMergePath)
            .then(() => true)
            .catch(() => false)
        : false
      const rebaseApply = rebaseApplyPath
        ? await fsp
            .stat(rebaseApplyPath)
            .then(() => true)
            .catch(() => false)
        : false
      if (rebaseMerge || rebaseApply) {
        attentionReason = "rebase"
      } else if (status.conflicted && status.conflicted.length > 0) {
        const cherryPickHeadPath = await resolveGitInternalPath(repoRoot, git, "CHERRY_PICK_HEAD").catch(() => "")
        const revertHeadPath = await resolveGitInternalPath(repoRoot, git, "REVERT_HEAD").catch(() => "")
        const cherryPickHead = cherryPickHeadPath
          ? await fsp
              .stat(cherryPickHeadPath)
              .then(() => true)
              .catch(() => false)
          : false
        const revertHead = revertHeadPath
          ? await fsp
              .stat(revertHeadPath)
              .then(() => true)
              .catch(() => false)
          : false
        if (cherryPickHead) attentionReason = "cherry-pick"
        else if (revertHead) attentionReason = "revert"
      }
    }
  } catch {
    // Status check failed — ignore
  }

  return {
    worktreeRoot,
    cwd,
    branch,
    headState,
    worktreeStatus,
    legacy: false,
    degraded: false,
    attentionReason,
  }
}

export async function getCommitFiles(directory, commitHash) {
  const { git } = await createRepositoryGitContext(directory)

  try {
    // `-z` keeps non-ASCII paths raw instead of C-quoting them: a quoted path is not
    // a path, so the history view rendered it garbled and `commit-file-diff` rejected it.
    const numstatRaw = await git.raw(["show", "--numstat", "-z", "--format=", commitHash])

    const files = []
    const records = String(numstatRaw || "").split("\0")

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index]
      if (!record) continue

      const parts = record.split("\t")
      if (parts.length < 3) continue

      const [insertionsRaw, deletionsRaw, ...pathParts] = parts
      let filePath = pathParts.join("\t")
      let isRename = false
      // A rename's numstat record ends after its second tab and names its source and
      // destination as the next two NUL records.
      if (!filePath) {
        filePath = records[index + 2]
        isRename = Boolean(records[index + 1] && filePath)
        index += 2
        if (!isRename) continue
      }

      const insertions = insertionsRaw === "-" ? 0 : parseInt(insertionsRaw, 10) || 0
      const deletions = deletionsRaw === "-" ? 0 : parseInt(deletionsRaw, 10) || 0
      const isBinary = insertionsRaw === "-" && deletionsRaw === "-"

      let changeType = "M"

      // `git show --numstat` can write a rename as `old.ts => new.ts` or `src/{old.ts => new.ts}`, which is
      // not a path: the history view passed it back as `commit-file-diff`'s `path` and every renamed file
      // answered 500. The destination is what the file is called at this commit.
      const displayPath = filePath.includes(" => ") ? extractGitNumstatDestinationPath(filePath) : filePath
      if (isRename || filePath.includes(" => ")) {
        changeType = "R"
      }

      files.push({
        path: displayPath,
        insertions,
        deletions,
        isBinary,
        changeType,
      })
    }

    const nameStatusRaw = await git.raw(["show", "--name-status", "-z", "--format=", commitHash]).catch(() => "")

    const statusMap = new Map()
    for (const entry of parseGitNameStatusZ(nameStatusRaw)) {
      statusMap.set(entry.path, entry.status)
    }

    for (const file of files) {
      const basePath = extractGitNumstatDestinationPath(file.path)

      const status = statusMap.get(basePath) || statusMap.get(file.path)
      if (status) {
        file.changeType = status
      }
    }

    return { files }
  } catch (error) {
    console.error("Failed to get commit files:", error)
    throw error
  }
}

export async function renameBranch(directory, oldName, newName) {
  const { git, repoRoot } = await createRepositoryGitContext(directory)

  try {
    const normalizedOldName = cleanBranchName(String(oldName || "").trim())
    const normalizedNewName = cleanBranchName(String(newName || "").trim())

    const previousRemote = await git
      .raw(["config", "--get", `branch.${normalizedOldName}.remote`])
      .then((value) => String(value || "").trim())
      .catch(() => "")
    const previousMerge = await git
      .raw(["config", "--get", `branch.${normalizedOldName}.merge`])
      .then((value) => String(value || "").trim())
      .catch(() => "")

    // Use git branch -m command to rename the branch
    await git.raw(["branch", "-m", oldName, newName])

    if (previousRemote && previousMerge && normalizedNewName) {
      const previousMergeBranch = cleanBranchName(previousMerge)
      const nextMergeBranch = previousMergeBranch === normalizedOldName ? normalizedNewName : previousMergeBranch
      const upstream = normalizeUpstreamTarget(previousRemote, nextMergeBranch)

      if (upstream) {
        try {
          await runGitCommandOrThrow(
            repoRoot,
            ["branch", `--set-upstream-to=${upstream.full}`, normalizedNewName],
            `Failed to set upstream to ${upstream.full}`,
          )
        } catch {
          await setBranchTrackingFallback(repoRoot, normalizedNewName, upstream)
        }
      }
    }

    return { success: true, branch: newName }
  } catch (error) {
    console.error("Failed to rename branch:", error)
    throw error
  }
}

export async function getRemotes(directory) {
  const { git } = await createRepositoryGitContext(directory)

  try {
    const remotes = await git.getRemotes(true)

    return remotes.map((remote) => ({
      name: remote.name,
      fetchUrl: remote.refs.fetch,
      pushUrl: remote.refs.push,
    }))
  } catch (error) {
    if (isNotGitRepositoryError(error)) {
      return []
    }
    console.error("Failed to get remotes:", error)
    throw error
  }
}

export async function removeRemote(directory, options = {}) {
  const remoteName = String(options.remote || "").trim()
  if (!remoteName) {
    throw new Error("remote is required to remove a remote")
  }
  if (remoteName === "origin") {
    throw new Error("Cannot remove origin remote")
  }

  const { git } = await createRepositoryGitContext(directory)

  try {
    await git.removeRemote(remoteName)
    remoteExistenceCache.delete(getRemoteExistenceCacheKey(directory, remoteName))
    return { success: true }
  } catch (error) {
    console.error("Failed to remove remote:", error)
    throw error
  }
}

export async function rebase(directory, options = {}) {
  const { git } = await createRepositoryGitContext(directory)

  try {
    const { onto } = options
    if (!onto || typeof onto !== "string") {
      throw new Error("onto parameter is required for rebase")
    }
    // Reject refs starting with '-' so they can't be interpreted as git options
    // (e.g. `--exec=<cmd>`, which would run arbitrary commands during rebase).
    if (onto.startsWith("-")) {
      throw new Error("Invalid onto ref for rebase")
    }

    await git.rebase([onto])

    return {
      success: true,
      conflict: false,
    }
  } catch (error) {
    const errorMessage = String(error?.message || error || "").toLowerCase()
    const isConflict =
      errorMessage.includes("conflict") ||
      errorMessage.includes("could not apply") ||
      errorMessage.includes("merge conflict")

    if (isConflict) {
      // Get list of conflicted files
      const status = await git.status().catch(() => ({ conflicted: [] }))
      return {
        success: false,
        conflict: true,
        conflictFiles: status.conflicted || [],
      }
    }

    console.error("Failed to rebase:", error)
    throw error
  }
}

export async function abortRebase(directory) {
  const { git } = await createRepositoryGitContext(directory)

  try {
    await git.rebase(["--abort"])
    return { success: true }
  } catch (error) {
    console.error("Failed to abort rebase:", error)
    throw error
  }
}

export async function merge(directory, options = {}) {
  const { git } = await createRepositoryGitContext(directory)

  try {
    const { branch } = options
    if (!branch || typeof branch !== "string") {
      throw new Error("branch parameter is required for merge")
    }
    // Reject refs starting with '-' so they can't be interpreted as git options
    // (option injection via a positional argument).
    if (branch.startsWith("-")) {
      throw new Error("Invalid branch ref for merge")
    }

    await git.merge([branch])

    return {
      success: true,
      conflict: false,
    }
  } catch (error) {
    const errorMessage = String(error?.message || error || "").toLowerCase()
    const isConflict =
      errorMessage.includes("conflict") ||
      errorMessage.includes("merge conflict") ||
      errorMessage.includes("automatic merge failed")

    if (isConflict) {
      // Get list of conflicted files
      const status = await git.status().catch(() => ({ conflicted: [] }))
      return {
        success: false,
        conflict: true,
        conflictFiles: status.conflicted || [],
      }
    }

    console.error("Failed to merge:", error)
    throw error
  }
}

export async function abortMerge(directory) {
  const { git } = await createRepositoryGitContext(directory)

  try {
    await git.merge(["--abort"])
    return { success: true }
  } catch (error) {
    console.error("Failed to abort merge:", error)
    throw error
  }
}

/**
 * Whether git's answer says the step had nothing left to apply, whatever hint it printed alongside it.
 *
 * The apply backend answers a step whose conflict resolution left nothing to stage with git's conflict
 * hint in front of "No changes - did you forget to use 'git add'?", and the cherry-pick wording is "The
 * previous cherry-pick is now empty, possibly due to conflict resolution": reading those as a conflict
 * showed a conflict list that no longer exists and left the step unable to advance.
 *
 * The text is only ever consulted for a step whose conflicts are resolved — see the structural check in
 * the callers — because git quotes the commit it failed to apply in the same message, and its subject
 * can contain any of these phrases.
 */
const saysNothingLeftToApply = (message) =>
  message.includes("nothing to commit") ||
  message.includes("no changes") ||
  message.includes("nothing left to stage") ||
  message.includes("now empty")

/**
 * Classify a refused `rebase --continue` / `merge` step.
 *
 * The structural answer comes first: unmerged entries mean a conflict is genuinely outstanding, whatever
 * text git printed around it — its message quotes the commit it failed to apply, and a subject can say
 * "no changes" or "now empty", which the empty-step check reads as text. The text is only consulted for a
 * step whose conflicts are resolved.
 */
const classifyRefusedSequencerStep = async (git, message) => {
  const text = String(message || "").toLowerCase()
  const status = await git.status().catch(() => null)
  const conflictedFiles = status?.conflicted ?? []
  if (conflictedFiles.length > 0) {
    return { conflict: true, conflictFiles: conflictedFiles, nothingLeftToApply: false }
  }
  if (saysNothingLeftToApply(text)) {
    return { conflict: false, conflictFiles: [], nothingLeftToApply: true }
  }
  const conflictText =
    text.includes("conflict") ||
    text.includes("needs merge") ||
    text.includes("unmerged") ||
    text.includes("fix conflicts")
  return { conflict: conflictText, conflictFiles: [], nothingLeftToApply: false }
}

export async function continueRebase(directory) {
  const { repoRoot, git } = await createRepositoryGitContext(directory)

  const result = await runSequencerStep(repoRoot, ["rebase", "--continue"])
  if (result.success) {
    return { success: true, conflict: false }
  }

  const verdict = await classifyRefusedSequencerStep(git, result.message || result.stderr)
  if (verdict.conflict) {
    return {
      success: false,
      conflict: true,
      conflictFiles: verdict.conflictFiles,
    }
  }

  // Git's empty-step answer: the step has nothing left to apply, so it is skipped rather than left
  // stopped. Whether the skip worked is reported from git's own answer, not assumed.
  if (verdict.nothingLeftToApply) {
    const skipped = await runSequencerStep(repoRoot, ["rebase", "--skip"])
    if (!skipped.success) {
      const afterSkip = await git.status().catch(() => null)
      const stillConflicted = afterSkip?.conflicted ?? []
      if (stillConflicted.length > 0) {
        return { success: false, conflict: true, conflictFiles: stillConflicted }
      }
      console.warn("Rebase skip failed after an empty step:", skipped.message || skipped.stderr)
    }
    return { success: true, conflict: false }
  }

  console.error("Failed to continue rebase:", result.message || result.stderr)
  throw new Error(result.message || "Failed to continue rebase")
}

export async function continueMerge(directory) {
  const { repoRoot, git } = await createRepositoryGitContext(directory)

  // Check if there are still unmerged files
  const status = await git.status()
  if (status.conflicted && status.conflicted.length > 0) {
    return {
      success: false,
      conflict: true,
      conflictFiles: status.conflicted,
    }
  }

  // For merge, the merge commit is written once the conflicts are resolved; --no-edit keeps the default
  // message, and the editor is silenced for the same reason as in continueRebase.
  const result = await runSequencerStep(repoRoot, ["commit", "--no-edit"])
  if (result.success) {
    return { success: true, conflict: false }
  }

  const verdict = await classifyRefusedSequencerStep(git, result.message || result.stderr)
  if (verdict.conflict) {
    return {
      success: false,
      conflict: true,
      conflictFiles: verdict.conflictFiles,
    }
  }

  // "nothing to commit" can happen if all conflicts resolved to one side: the merge is effectively
  // complete (all changes already committed or no changes needed).
  if (verdict.nothingLeftToApply) {
    return { success: true, conflict: false }
  }

  console.error("Failed to continue merge:", result.message || result.stderr)
  throw new Error(result.message || "Failed to continue merge")
}

export async function getConflictDetails(directory) {
  const { repoRoot, git } = await createRepositoryGitContext(directory)

  try {
    // Get git status --porcelain
    const statusPorcelain = await git.raw(["status", "--porcelain"]).catch(() => "")

    // Get unmerged files
    const unmergedFilesRaw = await git.raw(["diff-files", "--name-only", "--diff-filter=U"]).catch(() => "")
    const unmergedFiles = unmergedFilesRaw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    // Get current diff
    const diff = await git.raw(["diff-files", "-p"]).catch(() => "")

    // Detect operation type and get head info
    let operation = "merge"
    let headInfo = ""

    // Check for MERGE_HEAD (merge in progress)
    const mergeHeadExists = await git
      .raw(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"])
      .then(() => true)
      .catch(() => false)

    if (mergeHeadExists) {
      operation = "merge"
      const mergeHead = await git.raw(["rev-parse", "MERGE_HEAD"]).catch(() => "")
      const mergeMsgPath = await resolveGitInternalPath(repoRoot, git, "MERGE_MSG").catch(() => "")
      const mergeMsg = mergeMsgPath ? await fsp.readFile(mergeMsgPath, "utf8").catch(() => "") : ""
      headInfo = `MERGE_HEAD: ${mergeHead.trim()}\n${mergeMsg}`
    } else {
      // Detect the rebase from its state directory: REBASE_HEAD is absent while
      // the apply backend (git am, rebase --apply) is in progress.
      const rebaseState = await readRebaseInProgress(repoRoot, git).catch(() => null)

      if (rebaseState) {
        operation = "rebase"
        const rebaseHead = await git.raw(["rev-parse", "REBASE_HEAD"]).catch(() => "")
        const headSha = rebaseHead.trim()
        headInfo = headSha ? `REBASE_HEAD: ${headSha}` : `REBASE onto: ${rebaseState.onto}`
      }
    }

    return {
      statusPorcelain: statusPorcelain.trim(),
      unmergedFiles,
      diff: diff.trim(),
      headInfo: headInfo.trim(),
      operation,
    }
  } catch (error) {
    console.error("Failed to get conflict details:", error)
    throw error
  }
}

const COMMIT_PATCH_MAX_BYTES = 256 * 1024

/**
 * One commit as `git show` prints it: header, message, stat and unified patch.
 * The text is cut at `maxBytes` (on a line boundary) so a huge commit cannot
 * produce an unbounded response; `truncated` says when that happened.
 */
export async function getCommitPatch(directory, hash, { maxBytes = COMMIT_PATCH_MAX_BYTES } = {}) {
  if (!directory || !hash) {
    throw new Error("directory and hash are required for getCommitPatch")
  }
  const { repoRoot } = await createRepositoryGitContext(directory)
  const result = await runGitCommandOrThrow(
    repoRoot,
    ["show", "--no-color", "--no-ext-diff", "--stat", "--patch", "--format=medium", hash, "--"],
    "Failed to read commit",
  )
  const limit = Math.max(1, maxBytes)
  const buffer = Buffer.from(result.stdout, "utf8")
  if (buffer.length <= limit) {
    return { patch: result.stdout, truncated: false }
  }
  const head = buffer.subarray(0, limit).toString("utf8")
  const lastNewline = head.lastIndexOf("\n")
  return { patch: lastNewline > 0 ? head.slice(0, lastNewline + 1) : head, truncated: true }
}

/** The source path of a rename in this commit, or null when `displayPath` was not renamed. */
const resolveCommitRenameSourcePath = async (repoRoot, hash, displayPath) => {
  const nameStatus = await runGitCommand(repoRoot, ["show", "--name-status", "-z", "-M", "--format=", hash])
  if (!nameStatus.success) return null
  for (const entry of parseGitNameStatusZ(nameStatus.stdout)) {
    if (entry.status === "R" && entry.path === displayPath) return entry.source
  }
  return null
}

export async function getCommitFileDiff(directory, hash, filePath, isBinary) {
  if (!directory || !hash || !filePath) {
    throw new Error("directory, hash, and path are required for getCommitFileDiff")
  }

  if (isBinary) {
    return { original: "", modified: "", isBinary: true }
  }

  const { directoryPath, repoRoot } = await createRepositoryGitContext(directory)
  const candidates = Array.from(
    new Set([
      toGitPath(path.relative(repoRoot, path.resolve(repoRoot, filePath))),
      toGitPath(path.relative(repoRoot, path.resolve(directoryPath, filePath))),
    ]),
  ).filter((candidate) => candidate && !leavesRepositoryRoot(candidate))

  let originalResult = null
  let modifiedResult = null
  let usedPath = null

  for (const candidate of candidates) {
    const [candidateOriginalResult, candidateModifiedResult] = await Promise.all([
      runGitCommand(repoRoot, ["show", `${hash}^:${candidate}`]),
      runGitCommand(repoRoot, ["show", `${hash}:${candidate}`]),
    ])

    if (candidateOriginalResult.success || candidateModifiedResult.success) {
      originalResult = candidateOriginalResult
      modifiedResult = candidateModifiedResult
      usedPath = candidate
      break
    }
  }

  if (!originalResult || !modifiedResult) {
    const resolvedPath = await resolveGitCommitFilePath(repoRoot, hash, candidates)
    usedPath = resolvedPath
    ;[originalResult, modifiedResult] = await Promise.all([
      runGitCommand(repoRoot, ["show", `${hash}^:${resolvedPath}`]),
      runGitCommand(repoRoot, ["show", `${hash}:${resolvedPath}`]),
    ])
  }

  // A pure rename reads as "file added" with this lookup: the destination path
  // does not exist in the parent commit. Find the rename's source path and read
  // the original from there instead of reporting the whole file as new.
  if (originalResult && !originalResult.success && modifiedResult?.success && usedPath) {
    const renameSource = await resolveCommitRenameSourcePath(repoRoot, hash, usedPath)
    if (renameSource) {
      originalResult = await runGitCommand(repoRoot, ["show", `${hash}^:${renameSource}`])
    }
  }

  const original = originalResult.success ? originalResult.stdout : ""
  const modified = modifiedResult.success ? modifiedResult.stdout : ""

  if (!originalResult.success && !modifiedResult.success) {
    throw new Error(`Failed to read file content at commit ${hash}: ${originalResult.stderr || modifiedResult.stderr}`)
  }

  return { original, modified, isBinary: false }
}
