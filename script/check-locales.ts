import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { validateCatalog } from "./localization-catalog"
import { dict as english } from "../desktop/packages/ui/src/lib/i18n/messages/en"
import manifest from "../desktop/shared/locales.json"
import nativeEnglish from "../desktop/shared/native.en.json"
import sharedSpelling from "../desktop/shared/shared-spelling.json"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const catalogRoot = path.join(root, "desktop/packages/ui/src/lib/i18n/messages")
const sourceKeys = Object.keys(english).sort()
const errors: string[] = []
const native: Record<string, Record<string, string>> = { en: nativeEnglish }
const allowed = sharedSpelling as Record<string, string[]>
if (Object.keys(manifest.labels).sort().join("|") !== Object.keys(manifest.conversationNames).sort().join("|")) {
  errors.push("Interface and conversation locale manifests differ")
}
for (const [key, value] of Object.entries(nativeEnglish)) {
  if (english[key as keyof typeof english] !== value) errors.push(`Native English source differs: ${key}`)
}
let translationCount = 0
for (const locale of Object.keys(manifest.labels)) {
  if (locale === "en") continue
  const filename = path.join(catalogRoot, `${locale}.json`)
  if (!fs.existsSync(filename)) {
    errors.push(`${locale}: missing catalog`)
    continue
  }
  const text = fs.readFileSync(filename, "utf8")
  const { errors: issues, catalog } = validateCatalog(text, english, [
    ...(allowed.all || []),
    ...(allowed[locale] || []),
  ])
  errors.push(...issues.map((issue) => `${locale}: ${issue}`))
  translationCount += Object.keys(catalog).length
  native[locale] = Object.fromEntries(Object.keys(nativeEnglish).map((key) => [key, catalog[key]]))
}
for (const [locale, keys] of Object.entries(allowed)) {
  if (locale !== "all" && !Object.hasOwn(manifest.labels, locale)) errors.push(`Unknown spelling locale ${locale}`)
  for (const key of keys) if (!Object.hasOwn(english, key)) errors.push(`Unknown shared spelling ${locale}:${key}`)
}
const generated = `${JSON.stringify(native, null, 2)}\n`.replace(
  /[\u007f-\uffff]/g,
  (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
)
const nativePath = path.join(root, "desktop/shared/native-catalogs.json")
if (errors.length) {
  console.error(errors.join("\n"))
  console.error(`Localization failed: ${errors.length} issue(s).`)
  process.exitCode = 1
} else {
  if (process.argv.includes("--write-native")) fs.writeFileSync(nativePath, generated)
  else if (!fs.existsSync(nativePath) || fs.readFileSync(nativePath, "utf8") !== generated) {
    console.error("Native language catalogs are stale. Run pnpm check:locales --write-native.")
    process.exitCode = 1
  }
  console.log(
    `Checked ${Object.keys(manifest.labels).length} locales, ${sourceKeys.length} keys and ${translationCount} translated entries.`,
  )
}
