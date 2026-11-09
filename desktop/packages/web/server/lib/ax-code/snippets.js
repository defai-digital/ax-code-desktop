import fs from "fs"
import path from "path"
import yaml from "yaml"
import { AX_CODE_CONFIG_DIR, resolveProjectAxCodeResourcePath, resolveUserAxCodeResourcePath } from "./shared.js"

const SNIPPET_DIR = "snippet"
const LEGACY_SNIPPET_DIR = "snippets"
const SNIPPET_LOAD_DIRS = [LEGACY_SNIPPET_DIR, SNIPPET_DIR]
const SNIPPET_EXTENSION = ".md"
const SNIPPET_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i
const HASHTAG_PATTERN = /#([a-z0-9_-]+)/gi
const MAX_EXPANSION_COUNT = 15
// A snippet is a short prompt fragment, and every list, read and expansion reloads all of them synchronously.
export const MAX_SNIPPET_BYTES = 256 * 1024

// A project's snippet directory belongs to a repository the user may have just cloned. A snippet symlinked to a
// private file was read and, through `#name`, expanded into the prompt sent to the model; an update wrote through
// the link. Project snippets must be regular files in a directory that resolves inside the project.
function resolvesInside(targetPath, rootPath) {
  let realTarget
  let realRoot
  try {
    realTarget = fs.realpathSync(targetPath)
    realRoot = fs.realpathSync(rootPath)
  } catch {
    return false
  }
  const relative = path.relative(realRoot, realTarget)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function isLoadableSnippetFile(filePath) {
  try {
    const stats = fs.lstatSync(filePath)
    return stats.isFile() && stats.size <= MAX_SNIPPET_BYTES
  } catch {
    return false
  }
}

function assertWritableSnippetPath(filePath, workingDirectory, scope) {
  try {
    if (!fs.lstatSync(filePath).isFile()) throw new Error("Snippet file is not a regular file")
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
  if (scope !== "project") return
  // The nearest existing ancestor decides where `mkdir` would create the directory.
  let existing = path.dirname(filePath)
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing)
  if (!resolvesInside(existing, workingDirectory)) {
    throw new Error("Snippet directory must be inside the project")
  }
}

function getProjectSnippetDirs(workingDirectory) {
  if (!workingDirectory) return []
  return SNIPPET_LOAD_DIRS.map((dir) => path.join(workingDirectory, ".ax-code", dir))
}

function getGlobalSnippetDirs() {
  return SNIPPET_LOAD_DIRS.map((dir) => path.join(AX_CODE_CONFIG_DIR, dir))
}

function getLoadDirs(workingDirectory) {
  return [
    ...getGlobalSnippetDirs().map((dir) => ({ dir, source: "global" })),
    ...getProjectSnippetDirs(workingDirectory).map((dir) => ({ dir, source: "project" })),
  ]
}

function assertValidSnippetName(name) {
  if (typeof name !== "string" || !SNIPPET_NAME_PATTERN.test(name)) {
    throw new Error("Snippet name must use letters, numbers, dashes, or underscores")
  }
}

function parseMarkdownFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8")
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    return { frontmatter: {}, body: content.trim() }
  }
  return {
    frontmatter: yaml.parse(match[1]) || {},
    body: match[2].trim(),
  }
}

function normalizeAliasList(raw) {
  if (!raw) return []
  const aliases = Array.isArray(raw) ? raw : [raw]
  return aliases.map((alias) => String(alias).trim()).filter(Boolean)
}

function normalizeAliases(frontmatter) {
  return normalizeAliasList(frontmatter.aliases ?? frontmatter.alias)
}

function writeMarkdownFile(filePath, { content, aliases = [], description }) {
  const frontmatter = {}
  const normalizedAliases = normalizeAliasList(aliases)
  if (normalizedAliases.length > 0) frontmatter.aliases = normalizedAliases
  if (description?.trim()) frontmatter.description = description.trim()

  const body = content ?? ""
  const output =
    Object.keys(frontmatter).length > 0 ? `---\n${yaml.stringify(frontmatter)}---\n${body ? `\n${body}` : ""}` : body

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, output, "utf8")
}

function loadSnippetFile(dir, filename, source) {
  const name = path.basename(filename, SNIPPET_EXTENSION)
  if (!SNIPPET_NAME_PATTERN.test(name)) return null
  const filePath = path.join(dir, filename)
  const { frontmatter, body } = parseMarkdownFile(filePath)
  return {
    name,
    content: body,
    aliases: normalizeAliases(frontmatter),
    description: typeof frontmatter.description === "string" ? frontmatter.description : undefined,
    filePath,
    source,
  }
}

function removeSnippetAliases(registry, snippet, canonicalNames) {
  for (const alias of snippet.aliases) {
    const aliasKey = alias.toLowerCase()
    if (canonicalNames.has(aliasKey)) continue
    if (registry.get(aliasKey) === snippet) registry.delete(aliasKey)
  }
}

function registerSnippet(registry, snippet, canonicalNames) {
  const key = snippet.name.toLowerCase()
  const existing = registry.get(key)
  if (existing?.name.toLowerCase() === key) {
    removeSnippetAliases(registry, existing, canonicalNames)
  }
  registry.set(key, snippet)
  canonicalNames.add(key)
  for (const alias of snippet.aliases) {
    const aliasKey = alias.toLowerCase()
    if (SNIPPET_NAME_PATTERN.test(alias) && !canonicalNames.has(aliasKey)) registry.set(aliasKey, snippet)
  }
}

function loadSnippetRegistry(workingDirectory) {
  const registry = new Map()
  const canonicalNames = new Set()
  for (const { dir, source } of getLoadDirs(workingDirectory)) {
    if (!fs.existsSync(dir)) continue
    if (source === "project" && !resolvesInside(dir, workingDirectory)) {
      console.warn(`[Snippets] Ignoring ${dir}: it resolves outside the project`)
      continue
    }
    for (const filename of fs.readdirSync(dir)) {
      if (!filename.endsWith(SNIPPET_EXTENSION)) continue
      if (!isLoadableSnippetFile(path.join(dir, filename))) continue
      try {
        const snippet = loadSnippetFile(dir, filename, source)
        if (snippet) registerSnippet(registry, snippet, canonicalNames)
      } catch (error) {
        console.warn(`[Snippets] Failed to load ${path.join(dir, filename)}:`, error)
      }
    }
  }
  return registry
}

function listUniqueSnippets(registry) {
  const seen = new Set()
  const snippets = []
  for (const snippet of registry.values()) {
    const key = `${snippet.source}:${snippet.filePath}`
    if (seen.has(key)) continue
    seen.add(key)
    snippets.push(snippet)
  }
  return snippets.sort((a, b) => a.name.localeCompare(b.name))
}

function getWritableSnippetDir(scope, workingDirectory) {
  if (scope === "project") {
    if (!workingDirectory) throw new Error("Project directory is required for project snippets")
    return resolveProjectAxCodeResourcePath(workingDirectory, [SNIPPET_DIR], [LEGACY_SNIPPET_DIR])
  }
  return resolveUserAxCodeResourcePath([SNIPPET_DIR], [LEGACY_SNIPPET_DIR])
}

function findSnippetByName(name, workingDirectory) {
  assertValidSnippetName(name)
  const registry = loadSnippetRegistry(workingDirectory)
  return registry.get(name.toLowerCase()) ?? null
}

function parseSnippetBlocks(content) {
  const blocks = { prepend: [], append: [] }
  let inline = content
  for (const type of ["prepend", "append"]) {
    const regex = new RegExp(`<${type}>([\\s\\S]*?)(?:<\\/${type}>|$)`, "gi")
    inline = inline.replace(regex, (_match, value) => {
      const normalized = String(value).trim()
      if (normalized) blocks[type].push(normalized)
      return ""
    })
  }
  inline = inline.replace(/<inject>[\s\S]*?(?:<\/inject>|$)/gi, "").trim()
  return { inline, prepend: blocks.prepend, append: blocks.append }
}

function expandText(text, registry, expansionCounts, collector) {
  let expanded = text
  let changed = true

  while (changed) {
    const previous = expanded
    let loopDetected = false
    HASHTAG_PATTERN.lastIndex = 0

    expanded = expanded.replace(HASHTAG_PATTERN, (match, name, offset, input) => {
      if (name.toLowerCase() === "skill" && input[offset + match.length] === "(") return match
      const snippet = registry.get(name.toLowerCase())
      if (!snippet) return match

      const key = snippet.name.toLowerCase()
      const count = (expansionCounts.get(key) || 0) + 1
      if (count > MAX_EXPANSION_COUNT) {
        loopDetected = true
        return match
      }
      expansionCounts.set(key, count)

      const parsed = parseSnippetBlocks(snippet.content)
      for (const block of parsed.prepend)
        collector.prepend.push(expandText(block, registry, expansionCounts, collector))
      for (const block of parsed.append) collector.append.push(expandText(block, registry, expansionCounts, collector))
      return expandText(parsed.inline, registry, expansionCounts, collector)
    })

    changed = expanded !== previous && !loopDetected
  }

  return expanded
}

export function listSnippets(workingDirectory) {
  return listUniqueSnippets(loadSnippetRegistry(workingDirectory))
}

export function getSnippet(name, workingDirectory) {
  return findSnippetByName(name, workingDirectory)
}

export function createSnippet(name, config, workingDirectory, scope = "global") {
  assertValidSnippetName(name)
  const dir = getWritableSnippetDir(scope, workingDirectory)
  const filePath = path.join(dir, `${name}${SNIPPET_EXTENSION}`)
  if (fs.existsSync(filePath)) throw new Error(`Snippet "${name}" already exists`)
  assertWritableSnippetPath(filePath, workingDirectory, scope)
  writeMarkdownFile(filePath, config || {})
  return getSnippet(name, workingDirectory)
}

export function updateSnippet(name, updates, workingDirectory) {
  const existing = findSnippetByName(name, workingDirectory)
  if (!existing) throw new Error(`Snippet "${name}" not found`)
  assertWritableSnippetPath(existing.filePath, workingDirectory, existing.source)
  writeMarkdownFile(existing.filePath, { ...existing, ...(updates || {}) })
  return getSnippet(name, workingDirectory)
}

export function deleteSnippet(name, workingDirectory) {
  const existing = findSnippetByName(name, workingDirectory)
  if (!existing) throw new Error(`Snippet "${name}" not found`)
  fs.unlinkSync(existing.filePath)
}

export function expandSnippets(text, workingDirectory) {
  const registry = loadSnippetRegistry(workingDirectory)
  const collector = { prepend: [], append: [] }
  const expanded = expandText(text || "", registry, new Map(), collector).trim()
  return [...collector.prepend, expanded, ...collector.append].filter(Boolean).join("\n\n")
}

export { assertValidSnippetName }
