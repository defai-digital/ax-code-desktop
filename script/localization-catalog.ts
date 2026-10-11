import ts from "typescript"

const placeholders = (value: string) =>
  [...new Set([...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1].trim()))].sort().join("|")

export function validateCatalog(text: string, english: Record<string, string>, allowed: readonly string[] = []) {
  const errors: string[] = []
  const parsed = ts.parseJsonText("catalog.json", text)
  const seen = new Set<string>()
  const scan = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node)) {
      const key = ts.isStringLiteral(node.name) ? node.name.text : node.name.getText(parsed)
      if (seen.has(key)) errors.push(`duplicate key ${key}`)
      seen.add(key)
    }
    ts.forEachChild(node, scan)
  }
  scan(parsed)
  let catalog: Record<string, string>
  try {
    catalog = JSON.parse(text)
  } catch {
    return { errors: [...errors, "invalid JSON"], catalog: {} }
  }
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    return { errors: [...errors, "invalid catalog object"], catalog: {} }
  }
  for (const key of Object.keys(catalog)) if (!Object.hasOwn(english, key)) errors.push(`unknown key ${key}`)
  for (const [key, source] of Object.entries(english)) {
    const value = catalog[key]
    if (typeof value !== "string" || !value.trim()) errors.push(`missing or empty ${key}`)
    else {
      if (value !== value.normalize("NFC")) errors.push(`non-NFC ${key}`)
      if (placeholders(value) !== placeholders(source)) errors.push(`placeholder mismatch ${key}`)
      if (value.normalize("NFC") === source.normalize("NFC") && !allowed.includes(key))
        errors.push(`unreviewed identical string ${key}`)
    }
  }
  return { errors, catalog }
}
