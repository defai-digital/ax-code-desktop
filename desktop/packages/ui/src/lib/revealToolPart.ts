/** Quotes a value for a double-quoted attribute selector without relying on CSS.escape. */
const attributeValue = (value: string) => value.replace(/["\\]/g, "\\$&")

/**
 * Brings one tool call into view, focuses its row and marks it briefly, so a link from the browser's call list lands on the
 * exact call rather than only its message. A call that is not rendered (collapsed history) leaves the message scroll as is.
 */
export function revealToolPart(partId: string): boolean {
  if (typeof document === "undefined") return false
  const selector = `[data-tool-part-id="${attributeValue(partId)}"]`
  const part = document.querySelector<HTMLElement>(selector)
  if (!part) return false
  part.scrollIntoView({ block: "center" })
  part.querySelector<HTMLElement>('[role="button"]')?.focus({ preventScroll: true })
  part.setAttribute("data-attention", "")
  window.setTimeout(() => part.removeAttribute("data-attention"), 2000)
  return true
}

/** Brings a pending approval card into view and focuses its first answer, so it can be decided without searching. */
export function revealPermission(permissionId: string): boolean {
  if (typeof document === "undefined") return false
  const card = document.querySelector<HTMLElement>(`[data-permission-id="${attributeValue(permissionId)}"]`)
  if (!card) return false
  card.scrollIntoView({ block: "center" })
  card.querySelector<HTMLElement>("button")?.focus({ preventScroll: true })
  return true
}
