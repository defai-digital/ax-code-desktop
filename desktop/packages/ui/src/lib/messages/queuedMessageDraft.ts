/**
 * Fold a queued message's text into whatever the composer already holds.
 *
 * Editing a chip pops the entry out of the queue, so that content now exists only in the
 * composer: replacing the draft there destroyed both the user's in-progress text and the
 * popped message. Appending keeps both, separated by a blank line so they stay readable
 * as two prompts.
 */
export const appendQueuedContentToDraft = (draft: string, content: string): string => {
  const existing = draft.replace(/\s+$/, "")
  if (!existing) return content
  return `${existing}\n\n${content}`
}
