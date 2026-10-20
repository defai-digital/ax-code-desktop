import fs from "fs"
import path from "path"
import os from "os"
import {
  SKILL_SCOPE,
  ensureDirs,
  AX_CODE_CONFIG_DIR,
  ensureProjectAxCodeResourceDirs,
  resolveProjectAxCodeResourcePath,
  resolveUserAxCodeResourcePath,
  parseMdFile,
  writeMdFile,
  readConfig,
  walkSkillMdFiles,
  addSkillFromMdFile,
  resolveSkillSearchDirectories,
  listSkillSupportingFiles,
  writeSkillSupportingFile,
  deleteSkillSupportingFile,
  getAncestors,
  findWorktreeRoot,
  assertSafeResourceName,
} from "./shared.js"

const BUILT_IN_SKILL_LOCATION = "<built-in>"
const SKILL_MD_FILENAME = "SKILL.md"
const EXTERNAL_SKILL_SOURCES = [
  { source: "claude", rootName: ".claude" },
  { source: "agents", rootName: ".agents" },
]
const [CLAUDE_SKILL_SOURCE, AGENTS_SKILL_SOURCE] = EXTERNAL_SKILL_SOURCES

const normalizedSkillName = (skill) => (typeof skill?.name === "string" ? skill.name.trim() : "")

// Express 5 hands a `*filePath` wildcard over as an array of already-decoded segments, so a caller
// that does not percent-encode the separators (curl, older clients) arrives as
// ["references", "guide.md"]. Joining rebuilds the relative path that both forms describe. The
// segments are decoded exactly once by Express itself — decoding again here double-decoded a
// literal `%` in a file name (`100%.md` answered 400, and `a%20b.md` read/wrote `a b.md`).
const readSkillFilePathParam = (value) => {
  const raw = Array.isArray(value) ? value.join("/") : typeof value === "string" ? value : ""
  return raw.length > 0 ? raw : null
}

// Express decodes %2F inside a matched `:name` param, so an unvalidated skill
// name like "..%2F..%2F..%2F.ssh" reaches path.join as "../../.ssh" and escapes
// the skills directories. Routes reject such names before any filesystem work.
const readSkillNameParam = (value) => {
  try {
    return assertSafeResourceName(value, "Skill")
  } catch {
    return null
  }
}

function ensureProjectSkillDir(workingDirectory) {
  return ensureProjectAxCodeResourceDirs(workingDirectory, "skills", "skill")
}

function getProjectSkillDir(workingDirectory, skillName) {
  return resolveProjectAxCodeResourcePath(workingDirectory, ["skills", skillName], ["skill", skillName])
}

function getProjectSkillPath(workingDirectory, skillName) {
  return resolveProjectAxCodeResourcePath(
    workingDirectory,
    ["skills", skillName, "SKILL.md"],
    ["skill", skillName, "SKILL.md"],
  )
}

function getUserSkillDir(skillName) {
  return resolveUserAxCodeResourcePath(["skills", skillName], ["skill", skillName])
}

function getUserSkillPath(skillName) {
  return resolveUserAxCodeResourcePath(["skills", skillName, "SKILL.md"], ["skill", skillName, "SKILL.md"])
}

function getExternalSkillDir(scope, workingDirectory, skillName, sourceConfig) {
  const root = scope === SKILL_SCOPE.PROJECT ? workingDirectory : os.homedir()
  if (!root) return null
  return path.join(root, sourceConfig.rootName, "skills", skillName)
}

function getExternalSkillPath(scope, workingDirectory, skillName, sourceConfig) {
  const skillDir = getExternalSkillDir(scope, workingDirectory, skillName, sourceConfig)
  return skillDir ? path.join(skillDir, SKILL_MD_FILENAME) : null
}

function getExternalSkillEntry(scope, workingDirectory, skillName, sourceConfig) {
  const skillPath = getExternalSkillPath(scope, workingDirectory, skillName, sourceConfig)
  const exists = skillPath ? fs.existsSync(skillPath) : false
  return {
    exists,
    path: skillPath,
    dir: exists ? path.dirname(skillPath) : null,
    scope,
    source: sourceConfig.source,
  }
}

function findExternalSkillEntry(scope, workingDirectory, skillName) {
  for (const sourceConfig of EXTERNAL_SKILL_SOURCES) {
    const entry = getExternalSkillEntry(scope, workingDirectory, skillName, sourceConfig)
    if (entry.exists) return entry
  }
  return null
}

function getUserAgentsSkillDir(skillName) {
  return getExternalSkillDir(SKILL_SCOPE.USER, null, skillName, AGENTS_SKILL_SOURCE)
}

function getUserAgentsSkillPath(skillName) {
  return getExternalSkillPath(SKILL_SCOPE.USER, null, skillName, AGENTS_SKILL_SOURCE)
}

function getProjectAgentsSkillDir(workingDirectory, skillName) {
  return getExternalSkillDir(SKILL_SCOPE.PROJECT, workingDirectory, skillName, AGENTS_SKILL_SOURCE)
}

function getProjectAgentsSkillPath(workingDirectory, skillName) {
  return getExternalSkillPath(SKILL_SCOPE.PROJECT, workingDirectory, skillName, AGENTS_SKILL_SOURCE)
}

function getSkillScope(skillName, workingDirectory) {
  const discovered = discoverSkills(workingDirectory).find((skill) => skill.name === skillName)
  if (discovered?.path) {
    return { scope: discovered.scope || null, path: discovered.path, source: discovered.source || null }
  }

  if (workingDirectory) {
    const projectPath = getProjectSkillPath(workingDirectory, skillName)
    if (fs.existsSync(projectPath)) {
      return { scope: SKILL_SCOPE.PROJECT, path: projectPath, source: "ax-code" }
    }

    const projectExternal = findExternalSkillEntry(SKILL_SCOPE.PROJECT, workingDirectory, skillName)
    if (projectExternal) {
      return { scope: projectExternal.scope, path: projectExternal.path, source: projectExternal.source }
    }
  }

  const userPath = getUserSkillPath(skillName)
  if (fs.existsSync(userPath)) {
    return { scope: SKILL_SCOPE.USER, path: userPath, source: "ax-code" }
  }

  const userExternal = findExternalSkillEntry(SKILL_SCOPE.USER, null, skillName)
  if (userExternal) {
    return { scope: userExternal.scope, path: userExternal.path, source: userExternal.source }
  }

  return { scope: null, path: null, source: null }
}

function discoverSkills(workingDirectory) {
  const skills = new Map()

  for (const sourceConfig of EXTERNAL_SKILL_SOURCES) {
    const homeRoot = path.join(os.homedir(), sourceConfig.rootName, "skills")
    for (const skillMdPath of walkSkillMdFiles(homeRoot)) {
      addSkillFromMdFile(skills, skillMdPath, SKILL_SCOPE.USER, sourceConfig.source)
    }
  }

  if (workingDirectory) {
    const worktreeRoot = findWorktreeRoot(workingDirectory) || path.resolve(workingDirectory)
    const ancestors = getAncestors(workingDirectory, worktreeRoot)
    for (const ancestor of ancestors) {
      for (const sourceConfig of EXTERNAL_SKILL_SOURCES) {
        const externalSkillsRoot = path.join(ancestor, sourceConfig.rootName, "skills")
        for (const skillMdPath of walkSkillMdFiles(externalSkillsRoot)) {
          addSkillFromMdFile(skills, skillMdPath, SKILL_SCOPE.PROJECT, sourceConfig.source)
        }
      }
    }
  }

  const configDirectories = resolveSkillSearchDirectories(workingDirectory)
  const homeAxCodeDir = path.resolve(path.join(os.homedir(), ".ax-code"))
  const customConfigDir = process.env.AX_CODE_CONFIG_DIR ? path.resolve(process.env.AX_CODE_CONFIG_DIR) : null
  for (const dir of configDirectories) {
    for (const subDir of ["skill", "skills"]) {
      const root = path.join(dir, subDir)
      for (const skillMdPath of walkSkillMdFiles(root)) {
        const isUserConfigDir =
          dir === AX_CODE_CONFIG_DIR || dir === homeAxCodeDir || (customConfigDir && dir === customConfigDir)
        const scope = isUserConfigDir ? SKILL_SCOPE.USER : SKILL_SCOPE.PROJECT
        addSkillFromMdFile(skills, skillMdPath, scope, "ax-code")
      }
    }
  }

  let configuredPaths = []
  try {
    const config = readConfig(workingDirectory)
    configuredPaths = Array.isArray(config?.skills?.paths) ? config.skills.paths : []
  } catch {
    configuredPaths = []
  }
  for (const skillPath of configuredPaths) {
    if (typeof skillPath !== "string" || !skillPath.trim()) continue
    const expanded = skillPath.startsWith("~/") ? path.join(os.homedir(), skillPath.slice(2)) : skillPath
    const resolved = path.isAbsolute(expanded)
      ? path.resolve(expanded)
      : path.resolve(workingDirectory || process.cwd(), expanded)
    for (const skillMdPath of walkSkillMdFiles(resolved)) {
      addSkillFromMdFile(skills, skillMdPath, SKILL_SCOPE.PROJECT, "ax-code")
    }
  }

  const cacheCandidates = []
  if (process.env.XDG_CACHE_HOME) {
    cacheCandidates.push(path.join(process.env.XDG_CACHE_HOME, "ax-code", "skills"))
  }
  cacheCandidates.push(path.join(os.homedir(), ".cache", "ax-code", "skills"))
  cacheCandidates.push(path.join(os.homedir(), "Library", "Caches", "ax-code", "skills"))

  for (const cacheRoot of cacheCandidates) {
    if (!fs.existsSync(cacheRoot)) continue
    const entries = fs.readdirSync(cacheRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillRoot = path.join(cacheRoot, entry.name)
      for (const skillMdPath of walkSkillMdFiles(skillRoot)) {
        addSkillFromMdFile(skills, skillMdPath, SKILL_SCOPE.USER, "ax-code")
      }
    }
  }

  return Array.from(skills.values())
}

function mergeDiscoveredSkills(primarySkills = [], fallbackSkills = []) {
  const merged = []
  const seenNames = new Set()

  const appendSkill = (skill) => {
    const name = normalizedSkillName(skill)
    if (!name || seenNames.has(name)) {
      return
    }
    seenNames.add(name)
    merged.push(skill)
  }

  for (const skill of primarySkills || []) {
    appendSkill(skill)
  }
  for (const skill of fallbackSkills || []) {
    appendSkill(skill)
  }

  return merged
}

function getSkillSources(skillName, workingDirectory, discoveredSkill = null) {
  const isReadableFile = (filePath) => {
    if (!filePath) return false
    try {
      return fs.statSync(filePath).isFile()
    } catch {
      return false
    }
  }

  const projectPath = workingDirectory ? getProjectSkillPath(workingDirectory, skillName) : null
  const projectExists = projectPath && fs.existsSync(projectPath)
  const projectDir = projectExists ? path.dirname(projectPath) : null

  const projectExternalEntries = new Map()
  const userExternalEntries = new Map()
  for (const sourceConfig of EXTERNAL_SKILL_SOURCES) {
    projectExternalEntries.set(
      sourceConfig.source,
      workingDirectory
        ? getExternalSkillEntry(SKILL_SCOPE.PROJECT, workingDirectory, skillName, sourceConfig)
        : { exists: false, path: null, dir: null, scope: SKILL_SCOPE.PROJECT, source: sourceConfig.source },
    )
    userExternalEntries.set(sourceConfig.source, getExternalSkillEntry(SKILL_SCOPE.USER, null, skillName, sourceConfig))
  }
  const claudeEntry = projectExternalEntries.get("claude")
  const projectAgentsEntry = projectExternalEntries.get("agents")
  const userClaudeEntry = userExternalEntries.get("claude")
  const userAgentsEntry = userExternalEntries.get("agents")

  const userPath = getUserSkillPath(skillName)
  const userExists = fs.existsSync(userPath)
  const userDir = userExists ? path.dirname(userPath) : null

  const matchedDiscovered =
    discoveredSkill && discoveredSkill.name === skillName
      ? discoveredSkill
      : discoverSkills(workingDirectory).find((skill) => skill.name === skillName)
  const discoveredDescription =
    matchedDiscovered && typeof matchedDiscovered.description === "string" ? matchedDiscovered.description : ""
  const discoveredContent =
    matchedDiscovered && typeof matchedDiscovered.content === "string" ? matchedDiscovered.content : ""
  const discoveredPath = matchedDiscovered && typeof matchedDiscovered.path === "string" ? matchedDiscovered.path : null
  const isBuiltInDiscovered = discoveredPath === BUILT_IN_SKILL_LOCATION

  let mdPath = null
  let mdScope = null
  let mdSource = null
  let mdDir = null

  if (isBuiltInDiscovered) {
    mdScope = matchedDiscovered.scope || SKILL_SCOPE.USER
    mdSource = matchedDiscovered.source || "ax-code"
  } else if (discoveredPath) {
    mdPath = discoveredPath
    mdScope = matchedDiscovered.scope || null
    mdSource = matchedDiscovered.source || null
    mdDir = isReadableFile(discoveredPath) ? path.dirname(discoveredPath) : null
  } else if (projectExists) {
    mdPath = projectPath
    mdScope = SKILL_SCOPE.PROJECT
    mdSource = "ax-code"
    mdDir = projectDir
  } else if (claudeEntry.exists) {
    mdPath = claudeEntry.path
    mdScope = claudeEntry.scope
    mdSource = claudeEntry.source
    mdDir = claudeEntry.dir
  } else if (projectAgentsEntry.exists) {
    mdPath = projectAgentsEntry.path
    mdScope = projectAgentsEntry.scope
    mdSource = projectAgentsEntry.source
    mdDir = projectAgentsEntry.dir
  } else if (userExists) {
    mdPath = userPath
    mdScope = SKILL_SCOPE.USER
    mdSource = "ax-code"
    mdDir = userDir
  } else if (userClaudeEntry.exists) {
    mdPath = userClaudeEntry.path
    mdScope = userClaudeEntry.scope
    mdSource = userClaudeEntry.source
    mdDir = userClaudeEntry.dir
  } else if (userAgentsEntry.exists) {
    mdPath = userAgentsEntry.path
    mdScope = userAgentsEntry.scope
    mdSource = userAgentsEntry.source
    mdDir = userAgentsEntry.dir
  }

  const mdExists = isBuiltInDiscovered || isReadableFile(mdPath)
  if (!mdExists) {
    mdPath = null
    mdDir = null
    mdScope = null
    mdSource = null
  }

  const sources = {
    md: {
      exists: mdExists,
      path: mdPath,
      dir: mdDir,
      scope: mdScope,
      source: mdSource,
      fields: isBuiltInDiscovered ? ["description", "instructions"] : [],
      supportingFiles: [],
      name: matchedDiscovered?.name || skillName,
      description: discoveredDescription,
      instructions: isBuiltInDiscovered ? discoveredContent : "",
    },
    projectMd: {
      exists: projectExists,
      path: projectPath,
      dir: projectDir,
    },
    claudeMd: {
      exists: claudeEntry.exists,
      path: claudeEntry.path,
      dir: claudeEntry.dir,
    },
    projectAgentsMd: {
      exists: projectAgentsEntry.exists,
      path: projectAgentsEntry.path,
      dir: projectAgentsEntry.dir,
    },
    userMd: {
      exists: userExists,
      path: userPath,
      dir: userDir,
    },
    userClaudeMd: {
      exists: userClaudeEntry.exists,
      path: userClaudeEntry.path,
      dir: userClaudeEntry.dir,
    },
    userAgentsMd: {
      exists: userAgentsEntry.exists,
      path: userAgentsEntry.path,
      dir: userAgentsEntry.dir,
    },
  }

  if (mdExists && mdDir) {
    const { frontmatter, body } = parseMdFile(mdPath)
    sources.md.fields = Object.keys(frontmatter)
    sources.md.description = frontmatter.description || ""
    sources.md.name = frontmatter.name || skillName
    if (body) {
      sources.md.fields.push("instructions")
      sources.md.instructions = body
    } else {
      sources.md.instructions = ""
    }
    sources.md.supportingFiles = listSkillSupportingFiles(mdDir)
  }

  return sources
}

function createSkill(skillName, config, workingDirectory, scope) {
  ensureDirs()

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(skillName) || skillName.length > 64) {
    throw new Error(
      `Invalid skill name "${skillName}". Must be 1-64 lowercase alphanumeric characters with hyphens, cannot start or end with hyphen.`,
    )
  }

  const existing = getSkillScope(skillName, workingDirectory)
  if (existing.path) {
    throw new Error(`Skill ${skillName} already exists at ${existing.path}`)
  }

  let targetDir
  let targetPath
  let targetScope

  const requestedScope = scope === SKILL_SCOPE.PROJECT ? SKILL_SCOPE.PROJECT : SKILL_SCOPE.USER
  const requestedSource = config?.source === "agents" ? "agents" : "ax-code"

  if (requestedScope === SKILL_SCOPE.PROJECT && workingDirectory) {
    ensureProjectSkillDir(workingDirectory)
    if (requestedSource === "agents") {
      targetDir = getProjectAgentsSkillDir(workingDirectory, skillName)
      targetPath = getProjectAgentsSkillPath(workingDirectory, skillName)
    } else {
      targetDir = getProjectSkillDir(workingDirectory, skillName)
      targetPath = getProjectSkillPath(workingDirectory, skillName)
    }
    targetScope = SKILL_SCOPE.PROJECT
  } else {
    if (requestedSource === "agents") {
      targetDir = getUserAgentsSkillDir(skillName)
      targetPath = getUserAgentsSkillPath(skillName)
    } else {
      targetDir = getUserSkillDir(skillName)
      targetPath = getUserSkillPath(skillName)
    }
    targetScope = SKILL_SCOPE.USER
  }

  fs.mkdirSync(targetDir, { recursive: true })

  const { instructions, scope: _scopeFromConfig, source: _sourceFromConfig, supportingFiles, ...frontmatter } = config
  void _scopeFromConfig
  void _sourceFromConfig

  if (!frontmatter.name) {
    frontmatter.name = skillName
  }
  if (!frontmatter.description) {
    throw new Error("Skill description is required")
  }

  writeMdFile(targetPath, frontmatter, instructions || "")

  if (supportingFiles && Array.isArray(supportingFiles)) {
    for (const file of supportingFiles) {
      if (file.path && file.content !== undefined) {
        writeSkillSupportingFile(targetDir, file.path, file.content)
      }
    }
  }

  console.log(`Created new skill: ${skillName} (scope: ${targetScope}, path: ${targetPath})`)
}

function updateSkill(skillName, updates, workingDirectory, targetPath = null) {
  ensureDirs()

  const requestedPath = typeof targetPath === "string" && targetPath.trim() ? path.resolve(targetPath.trim()) : null
  let existing
  if (requestedPath && fs.existsSync(requestedPath)) {
    // The client-supplied path only disambiguates between skills the server
    // itself discovered for this directory (including .claude/.agents mirrors);
    // anything else would let this route rewrite an arbitrary SKILL.md on disk.
    const discovered = discoverSkills(workingDirectory).find(
      (skill) => skill.name === skillName && skill.path && path.resolve(skill.path) === requestedPath,
    )
    if (!discovered) {
      throw new Error(`Skill "${skillName}" target path is outside the known skill directories`)
    }
    existing = { scope: discovered.scope || null, path: requestedPath, source: discovered.source || null }
  } else {
    existing = getSkillScope(skillName, workingDirectory)
  }
  if (!existing.path) {
    throw new Error(`Skill "${skillName}" not found`)
  }
  if (path.basename(existing.path) !== "SKILL.md") {
    throw new Error(`Skill "${skillName}" target must be a SKILL.md file`)
  }

  const mdPath = existing.path
  const mdDir = path.dirname(mdPath)
  const mdData = parseMdFile(mdPath)
  const frontmatterName = typeof mdData.frontmatter?.name === "string" ? mdData.frontmatter.name.trim() : skillName
  if (frontmatterName !== skillName) {
    throw new Error(`Skill "${skillName}" does not match ${mdPath}`)
  }

  let mdModified = false

  for (const [field, value] of Object.entries(updates)) {
    if (field === "scope" || field === "source" || field === "targetPath") {
      continue
    }

    if (field === "instructions") {
      const normalizedValue = typeof value === "string" ? value : value == null ? "" : String(value)
      mdData.body = normalizedValue
      mdModified = true
      continue
    }

    if (field === "supportingFiles") {
      if (Array.isArray(value)) {
        for (const file of value) {
          if (file.delete && file.path) {
            deleteSkillSupportingFile(mdDir, file.path)
          } else if (file.path && file.content !== undefined) {
            writeSkillSupportingFile(mdDir, file.path, file.content)
          }
        }
      }
      continue
    }

    mdData.frontmatter[field] = value
    mdModified = true
  }

  if (mdModified) {
    writeMdFile(mdPath, mdData.frontmatter, mdData.body)
  }

  console.log(`Updated skill: ${skillName} (path: ${mdPath})`)
}

// The directories a delete may touch. Listing them explicitly (instead of
// deleting whatever path a caller names) keeps a request from removing files
// outside the managed skill roots. A grouped skill (`skills/<group>/<name>`)
// is found through discovery and accepted only when it lives under one of
// these roots.
function listSkillRoots(workingDirectory) {
  const roots = []
  const add = (root, scope, source) => {
    if (root) roots.push({ root, scope, source })
  }

  if (workingDirectory) {
    add(path.join(workingDirectory, ".ax-code", "skills"), SKILL_SCOPE.PROJECT, "ax-code")
    add(path.join(workingDirectory, ".ax-code", "skill"), SKILL_SCOPE.PROJECT, "ax-code")
    add(path.join(workingDirectory, CLAUDE_SKILL_SOURCE.rootName, "skills"), SKILL_SCOPE.PROJECT, CLAUDE_SKILL_SOURCE.source)
    add(path.join(workingDirectory, AGENTS_SKILL_SOURCE.rootName, "skills"), SKILL_SCOPE.PROJECT, AGENTS_SKILL_SOURCE.source)
  }

  add(path.join(AX_CODE_CONFIG_DIR, "skills"), SKILL_SCOPE.USER, "ax-code")
  add(path.join(AX_CODE_CONFIG_DIR, "skill"), SKILL_SCOPE.USER, "ax-code")
  add(path.join(os.homedir(), CLAUDE_SKILL_SOURCE.rootName, "skills"), SKILL_SCOPE.USER, CLAUDE_SKILL_SOURCE.source)
  add(path.join(os.homedir(), AGENTS_SKILL_SOURCE.rootName, "skills"), SKILL_SCOPE.USER, AGENTS_SKILL_SOURCE.source)

  return roots
}

function isPathWithinRoot(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

function deleteSkill(skillName, workingDirectory, target = {}) {
  assertSafeResourceName(skillName, "Skill")

  const requestedScope =
    target.scope === SKILL_SCOPE.PROJECT || target.scope === SKILL_SCOPE.USER ? target.scope : null
  const requestedSource = typeof target.source === "string" && target.source ? target.source : null
  const isTarget = (scope, source) =>
    (!requestedScope || scope === requestedScope) && (!requestedSource || source === requestedSource)

  const roots = listSkillRoots(workingDirectory)
  // Without an explicit scope/source every copy of the name is removed, which
  // is what a delete from a merged list used to do. The desktop sends the
  // entry's own scope and source so sibling copies in other scopes survive.
  const directories = new Map()
  for (const { root, scope, source } of roots) {
    if (!isTarget(scope, source)) continue
    const candidate = path.join(root, skillName)
    // A directory with the same name may be a group holding other skills
    // (skills/<group>/<name>/SKILL.md). Only delete it when it is itself a
    // skill; grouped skills are resolved through discovery below.
    if (!fs.existsSync(path.join(candidate, "SKILL.md"))) continue
    directories.set(candidate, { scope, source })
  }

  for (const skill of discoverSkills(workingDirectory)) {
    if (skill.name !== skillName || !skill.path || skill.path === BUILT_IN_SKILL_LOCATION) continue
    const containingRoot = roots.find(({ root }) => isPathWithinRoot(root, skill.path))
    if (!containingRoot) continue
    if (!isTarget(containingRoot.scope, containingRoot.source)) continue
    const directory = path.dirname(skill.path)
    // A SKILL.md sitting directly in a skills root is discovered as a skill
    // too; its "directory" is the whole root, so deleting it would wipe every
    // sibling skill. Any deeper folder is fine even when its name differs from
    // the frontmatter name (the catalog installer keeps the folder as-is).
    if (path.resolve(directory) === path.resolve(containingRoot.root)) continue
    directories.set(directory, {
      scope: containingRoot.scope,
      source: containingRoot.source,
    })
  }

  let deleted = false
  for (const directory of directories.keys()) {
    if (!fs.existsSync(directory)) continue
    fs.rmSync(directory, { recursive: true, force: true })
    console.log(`Deleted skill directory: ${directory}`)
    deleted = true
  }

  if (!deleted) {
    throw new Error(`Skill "${skillName}" not found`)
  }
}

export {
  getSkillSources,
  getSkillScope,
  discoverSkills,
  mergeDiscoveredSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  readSkillFilePathParam,
  readSkillNameParam,
}
