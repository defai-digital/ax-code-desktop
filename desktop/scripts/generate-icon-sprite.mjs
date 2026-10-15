/**
 * Generates the SVG icon sprite from Phosphor Icons (@phosphor-icons/core).
 *
 * Usage: node scripts/generate-icon-sprite.mjs [--check]
 *        (or `pnpm --filter @openchamber/ui icons:sprite`)
 *
 * --check writes nothing and exits non-zero when sprite.ts differs from what
 * the map would generate.
 *
 * Resolves every name in scripts/icon-sprite-map.mjs to its Phosphor SVG (or an
 * AX glyph from scripts/icon-custom-glyphs.mjs) and
 * writes packages/ui/src/components/icon/sprite.ts. It also scans
 * packages/ui/src for the names in use and reports mapped names it did not see.
 *
 * The run fails when a name rendered with `<Icon name="..." />` has no mapping
 * or a mapping points at a Phosphor asset that does not exist, so a new icon
 * cannot silently render as an empty box.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { CUSTOM_GLYPHS } from "./icon-custom-glyphs.mjs"
import { DEFAULT_WEIGHT, ICON_MAP, PHOSPHOR_WEIGHTS } from "./icon-sprite-map.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")
const outPath = resolve(repoRoot, "packages/ui/src/components/icon/sprite.ts")

const requireFromUi = createRequire(resolve(repoRoot, "packages/ui/package.json"))
// The package exports only its SVG assets and bundle, so locate the package
// root from a known asset rather than from package.json.
const phosphorRoot = resolve(dirname(requireFromUi.resolve("@phosphor-icons/core/assets/regular/house.svg")), "../..")
const phosphorVersion = JSON.parse(readFileSync(resolve(phosphorRoot, "package.json"), "utf-8")).version

const errors = []
const usedIcons = new Set()
const addKebabIcon = (kebab) => {
  if (!Object.hasOwn(ICON_MAP, kebab)) return false
  usedIcons.add(kebab)
  return true
}

const srcDir = resolve(repoRoot, "packages/ui/src")

function findAllSourceFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    try {
      const st = statSync(full)
      if (st.isDirectory()) {
        if (entry === "node_modules") continue
        results.push(...findAllSourceFiles(full))
      } else if (/\.(tsx?)$/.test(entry) && full !== outPath) {
        results.push(full)
      }
    } catch {
      /* skip */
    }
  }
  return results
}

const allSrcFiles = findAllSourceFiles(srcDir)
const addIconLiterals = (content) => {
  const iconLiteralRegex = /["']([a-z][a-z0-9-]*)["']/g
  let literal
  while ((literal = iconLiteralRegex.exec(content)) !== null) {
    addKebabIcon(literal[1])
  }
}

function findMatchingBrace(content, openBraceIndex) {
  let depth = 0
  let quote = null
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let i = openBraceIndex; i < content.length; i++) {
    const char = content[i]
    const next = content[i + 1]

    if (lineComment) {
      if (char === "\n") lineComment = false
      continue
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false
        i++
      }
      continue
    }

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === "/" && next === "/") {
      lineComment = true
      i++
      continue
    }

    if (char === "/" && next === "*") {
      blockComment = true
      i++
      continue
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char
      continue
    }

    if (char === "{") {
      depth++
    } else if (char === "}") {
      depth--
      if (depth === 0) return i
    }
  }

  return -1
}

const addIconNameFunctionReturns = (content) => {
  const functionRegex = /function\s+\w+\s*\([^)]*\)\s*:\s*IconName(?:\s*\|\s*null)?\s*{/g
  let match
  while ((match = functionRegex.exec(content)) !== null) {
    const openBraceIndex = content.indexOf("{", match.index)
    if (openBraceIndex === -1) continue

    const closeBraceIndex = findMatchingBrace(content, openBraceIndex)
    if (closeBraceIndex === -1) continue

    const body = content.slice(openBraceIndex + 1, closeBraceIndex)
    const returnRegex = /\breturn\s+["']([a-z][a-z0-9-]*)["']/g
    let returnMatch
    while ((returnMatch = returnRegex.exec(body)) !== null) {
      addKebabIcon(returnMatch[1])
    }
    functionRegex.lastIndex = closeBraceIndex + 1
  }
}

const addTypedIconNameRecords = (content) => {
  const recordRegex = /:\s*Record<[^>]*IconName[^>]*>\s*=\s*{/g
  let match
  while ((match = recordRegex.exec(content)) !== null) {
    const openBraceIndex = content.indexOf("{", match.index)
    if (openBraceIndex === -1) continue

    const closeBraceIndex = findMatchingBrace(content, openBraceIndex)
    if (closeBraceIndex === -1) continue

    addIconLiterals(content.slice(openBraceIndex + 1, closeBraceIndex))
    recordRegex.lastIndex = closeBraceIndex + 1
  }
}

const addIconNameVariableAssignments = (content) => {
  if (!/<Icon\b/.test(content)) return

  const variableRegex = /\b(?:const|let|var)\s+\w*IconName\b[^=]*=\s*([\s\S]*?);/g
  let match
  while ((match = variableRegex.exec(content)) !== null) {
    const initializer = match[1]
    const directLiteral = /^\s*["']([a-z][a-z0-9-]*)["']/.exec(initializer)
    if (directLiteral) {
      addKebabIcon(directLiteral[1])
    }

    const branchLiteralRegex = /(?:\?\?|[?:])\s*["']([a-z][a-z0-9-]*)["']/g
    let branchLiteral
    while ((branchLiteral = branchLiteralRegex.exec(initializer)) !== null) {
      addKebabIcon(branchLiteral[1])
    }
  }
}

for (const file of allSrcFiles) {
  const content = readFileSync(file, "utf-8")
  // Also scan for <Icon name="..." /> patterns (already-migrated icons)
  const iconNameRegex = /<Icon\b[^>]*\bname=(?:["']([^"']+)["']|{\s*["']([^"']+)["']\s*})/g
  let nm
  while ((nm = iconNameRegex.exec(content)) !== null) {
    const name = nm[1] || nm[2]
    if (!addKebabIcon(name)) {
      errors.push(`${file.slice(repoRoot.length + 1)}: <Icon name="${name}"> has no entry in icon-sprite-map.mjs`)
    }
  }

  // Also scan for icon: 'kebab-name' / Icon: 'kebab-name' in object literals.
  const iconPropRegex = /\b[Ii]con:\s*["']([a-z][a-z0-9-]*)["']/g
  let ip
  while ((ip = iconPropRegex.exec(content)) !== null) {
    addKebabIcon(ip[1])
  }

  // Also scan JSX props named icon/Icon with a string literal value.
  const iconJsxPropRegex = /\b[Ii]con=(?:["']([^"']+)["']|{\s*["']([^"']+)["']\s*})/g
  let jp
  while ((jp = iconJsxPropRegex.exec(content)) !== null) {
    addKebabIcon(jp[1] || jp[2])
  }

  addIconNameFunctionReturns(content)
  addTypedIconNameRecords(content)
  addIconNameVariableAssignments(content)
}

// Some icon names arrive through external configuration rather than a literal
// in the UI source. Keep those stable so regenerating the sprite does not
// leave a valid runtime icon reference without a symbol.
for (const icon of [
  "apple",
  "bar-chart-2",
  "checkbox-blank-circle-fill",
  "git-close-pull-request",
  "git-pr-draft",
  "mic",
  "mic-off",
  "play-list-add",
  "stop-circle",
  "volume-up",
]) {
  addKebabIcon(icon)
}

console.log(`Found ${usedIcons.size} sprite icon names used in source`)

// --- Resolve each name to Phosphor SVG content ---
const resolveSpec = (name) => {
  const raw = ICON_MAP[name]
  const spec = typeof raw === "string" ? { icon: raw } : raw
  if (spec.custom) {
    return { custom: spec.custom, flip: spec.flip === true }
  }
  const weight = spec.weight ?? DEFAULT_WEIGHT
  if (!PHOSPHOR_WEIGHTS.includes(weight)) {
    errors.push(`${name}: unknown Phosphor weight "${weight}"`)
  }
  return { icon: spec.icon, weight, flip: spec.flip === true }
}

const readPhosphorBody = ({ icon, weight }) => {
  const file = resolve(phosphorRoot, "assets", weight, weight === "regular" ? `${icon}.svg` : `${icon}-${weight}.svg`)
  if (!existsSync(file)) return null
  const svg = readFileSync(file, "utf-8").trim()
  const match = /^<svg\b[^>]*viewBox="0 0 256 256"[^>]*>([\s\S]*)<\/svg>$/.exec(svg)
  if (!match) return null
  const body = match[1].trim()
  // The button CSS in index.css forces `fill: none` on rect/circle; Phosphor
  // ships path-only glyphs, and anything else would disappear inside buttons.
  if (/<(?!\/?path\b)[a-z]/i.test(body)) return null
  return body
}

const iconEntries = []
// Emit every mapped name, not only the ones the scan found: names can also
// arrive from configuration and other packages, and dropping one would
// silently narrow the IconName type.
for (const name of Object.keys(ICON_MAP).sort()) {
  const spec = resolveSpec(name)
  let body
  if (spec.custom) {
    const pathData = CUSTOM_GLYPHS[spec.custom]
    if (typeof pathData !== "string" || pathData.length === 0) {
      errors.push(`${name}: no custom glyph named ${spec.custom} in icon-custom-glyphs.mjs`)
      continue
    }
    body = `<path d="${pathData}"/>`
  } else {
    body = readPhosphorBody(spec)
    if (body === null) {
      errors.push(`${name}: no usable Phosphor asset for ${spec.icon} (${spec.weight})`)
      continue
    }
  }
  const transform = spec.flip ? ' transform="matrix(-1 0 0 1 256 0)"' : ""
  iconEntries.push({ name, content: `<g fill="currentColor"${transform}>${body}</g>` })
}

if (errors.length > 0) {
  for (const error of errors) console.error(`  ✗ ${error}`)
  process.exit(1)
}

const unused = Object.keys(ICON_MAP).filter((name) => !usedIcons.has(name))
if (unused.length > 0) {
  console.log(`  Mapped but not found by the source scan: ${unused.join(", ")}`)
}

// --- Write sprite.ts ---
// Quote only keys that need it, matching Prettier, so the output is stable under formatting.
const spriteKey = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : `"${name}"`)
const spriteLines = iconEntries.map(({ name, content }) => `  ${spriteKey(name)}: \`${content}\`,`)

const spriteContent = `// This file is auto-generated by scripts/generate-icon-sprite.mjs
// Do not edit manually. Edit scripts/icon-sprite-map.mjs and run the script.
// Glyphs: Phosphor Icons ${phosphorVersion} (https://phosphoricons.com), MIT License.

export const ICON_VIEWBOX = "0 0 256 256"

export const iconSpriteData = {
${spriteLines.join("\n")}
} as const satisfies Record<string, string>
`

if (process.argv.includes("--check")) {
  const current = existsSync(outPath) ? readFileSync(outPath, "utf-8") : ""
  if (current !== spriteContent) {
    console.error("sprite.ts is out of date with icon-sprite-map.mjs. Run the generator and commit the result.")
    process.exit(1)
  }
  console.log("sprite.ts matches icon-sprite-map.mjs")
  process.exit(0)
}

writeFileSync(outPath, spriteContent, "utf-8")
console.log(`\n✅ Generated sprite data for ${iconEntries.length} icons → ${outPath}`)
console.log(`   Total sprite size: ${Buffer.byteLength(spriteContent).toLocaleString()} bytes`)
