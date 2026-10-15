/** Supervision shortcuts that move between sessions; they must never interrupt editing. */
export type SupervisionShortcutKind = "navigate" | "open-surface"

export interface ShortcutGuardInput {
  isComposing: boolean
  /** A modal dialog (other than the surface the shortcut would open) is showing. */
  modalOpen: boolean
  /** The event target is inside a code editor or a contenteditable region. */
  inCodeEditor: boolean
  /** The event target is a plain text field (input, textarea, select). */
  inTextField: boolean
}

/**
 * Whether a supervision shortcut may act on this key event. Nothing fires while an IME is composing or a modal
 * dialog owns the keyboard. Code editors keep their own chords. Plain text fields keep the arrow-based return
 * stack (word and line selection), while the surface shortcuts still work from the composer.
 */
export function supervisionShortcutAllowed(kind: SupervisionShortcutKind, input: ShortcutGuardInput): boolean {
  if (input.isComposing || input.modalOpen || input.inCodeEditor) return false
  if (kind === "navigate" && input.inTextField) return false
  return true
}

const CODE_EDITOR_SELECTOR = ".cm-editor, .monaco-editor, [contenteditable=''], [contenteditable='true']"

export function readShortcutGuardInput(event: KeyboardEvent): ShortcutGuardInput {
  const target = event.target instanceof Element ? event.target : null
  return {
    isComposing: event.isComposing,
    modalOpen: typeof document !== "undefined" && document.querySelector("[data-slot='dialog-content']") !== null,
    inCodeEditor: Boolean(target?.closest(CODE_EDITOR_SELECTOR)),
    inTextField: Boolean(target?.closest("input, textarea, select")),
  }
}
