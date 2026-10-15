/**
 * Git repository detection for the add-project folder browser.
 *
 * - `gitRoot`: the nearest folder at or above `directory` that holds a `.git` entry (a directory, or
 *   a file for linked worktrees and submodules), never walking above `ceiling`.
 * - `childRepositories`: direct subfolders of `directory` that hold a `.git` entry. Hidden folders
 *   are skipped and the scan is bounded, so a huge parent folder cannot stall the dialog.
 */

export const MAX_SCANNED_CHILDREN = 500
export const MAX_REPORTED_REPOSITORIES = 200

const hasGitEntry = async (fsPromises, path, directory) => {
  try {
    await fsPromises.lstat(path.join(directory, ".git"))
    return true
  } catch {
    return false
  }
}

const isWithin = (path, candidate, ceiling) => {
  const relative = path.relative(ceiling, candidate)
  // Only ".." itself or a leading "../" leaves the ceiling: a path component
  // whose *name* starts with ".." ("..data/repo") is still inside it.
  return !(relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
}

export async function findGitRoot({ directory, ceiling, fsPromises, path }) {
  let current = path.resolve(directory)
  const limit = path.resolve(ceiling)
  while (isWithin(path, current, limit)) {
    if (await hasGitEntry(fsPromises, path, current)) return current
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

export async function listChildRepositories({ directory, fsPromises, path }) {
  let entries
  try {
    entries = await fsPromises.readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .slice(0, MAX_SCANNED_CHILDREN)
  const checks = await Promise.all(
    candidates.map(async (entry) => {
      const childPath = path.join(directory, entry.name)
      return (await hasGitEntry(fsPromises, path, childPath)) ? { name: entry.name, path: childPath } : null
    }),
  )
  return checks
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, MAX_REPORTED_REPOSITORIES)
}

export async function inspectGitRepositories({ directory, ceiling, fsPromises, path }) {
  const [gitRoot, childRepositories] = await Promise.all([
    findGitRoot({ directory, ceiling, fsPromises, path }),
    listChildRepositories({ directory, fsPromises, path }),
  ])
  return { directory: path.resolve(directory), gitRoot, childRepositories }
}
