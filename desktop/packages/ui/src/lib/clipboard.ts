type ClipboardCopyResult = { ok: true; method: "clipboard" | "execCommand" } | { ok: false; error: string }

export async function copyTextToClipboard(text: string): Promise<ClipboardCopyResult> {
  let clipboardError: string | null = null

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return { ok: true, method: "clipboard" }
    } catch (error) {
      clipboardError = error instanceof Error ? error.message : String(error)
    }
  }

  if (typeof document !== "undefined" && document.body) {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.top = "-1000px"
    textarea.style.left = "-1000px"
    document.body.appendChild(textarea)
    let copied = false
    try {
      textarea.select()
      textarea.setSelectionRange(0, textarea.value.length)
      copied = document.execCommand("copy")
    } catch (error) {
      // Some webviews throw instead of returning false; callers only handle the result
      // object, so a rejection here surfaced as an unhandled promise rejection and left
      // the hidden textarea in the DOM.
      clipboardError = clipboardError ?? (error instanceof Error ? error.message : String(error))
    } finally {
      document.body.removeChild(textarea)
    }

    if (copied) {
      return { ok: true, method: "execCommand" }
    }
  }

  return {
    ok: false,
    error: clipboardError ?? "Clipboard access denied in current context",
  }
}
