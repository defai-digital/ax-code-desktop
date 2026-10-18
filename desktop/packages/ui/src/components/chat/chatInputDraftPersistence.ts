// Per-session chat composer draft persistence, backed by localStorage.
// Extracted from ChatInput-impl.tsx — keys and behavior must stay byte-identical.

export const CHAT_DRAFT_PERSIST_DEBOUNCE_MS = 500

// Per-session draft key — preserves in-progress messages across project switches
export const getDraftKey = (sessionId: string | null): string => `openchamber_chat_input_draft_${sessionId ?? "new"}`

// Helper to safely read from localStorage for a given session
export const getStoredDraft = (sessionId: string | null): string => {
  try {
    return localStorage.getItem(getDraftKey(sessionId)) ?? ""
  } catch {
    return ""
  }
}

// The live composer text per draft key, kept in memory. A remount reads its initial draft
// during render, while the outgoing instance's unmount flush runs later in the same commit —
// so localStorage could still hold the previous debounced snapshot and the last keystrokes
// were lost. Every keystroke writes here first; the remount reads it before storage.
const liveDrafts = new Map<string, string>()

export const getLiveDraft = (sessionId: string | null): string | undefined => liveDrafts.get(getDraftKey(sessionId))

export const setLiveDraft = (sessionId: string | null, draft: string): void => {
  const key = getDraftKey(sessionId)
  if (draft) {
    liveDrafts.set(key, draft)
  } else {
    liveDrafts.delete(key)
  }
}

// Helper to safely write/clear a per-session draft
export const saveStoredDraft = (sessionId: string | null, draft: string): void => {
  setLiveDraft(sessionId, draft)
  try {
    if (draft) {
      localStorage.setItem(getDraftKey(sessionId), draft)
    } else {
      localStorage.removeItem(getDraftKey(sessionId))
    }
  } catch {
    // Ignore localStorage errors
  }
}
