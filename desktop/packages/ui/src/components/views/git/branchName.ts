/**
 * Reduce arbitrary text to something git accepts as a ref name.
 *
 * Git's rule is a small forbidden set, not an ASCII whitelist: a branch name in any script is
 * valid. Mapping everything outside `[A-Za-z0-9._/-]` to "-" emptied a name written in, say,
 * Chinese - the create button then stayed disabled and nothing happened - and silently turned
 * `feature/测试` into `feature`, a different branch than the one that was asked for.
 */
export const sanitizeBranchNameInput = (value: string): string => {
  return (
    value
      .trim()
      // Forbidden anywhere in a ref: whitespace, control characters, ~ ^ : ? * [ \ and ".
      .replace(/[\s\p{Cc}~^:?*[\\"]+/gu, "-")
      // Forbidden sequences: "..", "@{", and a component ending in ".lock".
      .replace(/\.{2,}/g, "-")
      .replace(/@\{/g, "-")
      .replace(/\.lock\b/g, "-")
      // No component may begin with a dot, and not only the first one: git rejects
      // `feature/.hidden`, and this returned it unchanged.
      .replace(/(^|\/)\.+/g, "$1")
      .replace(/-+/g, "-")
      .replace(/\/{2,}/g, "/")
      .replace(/\/-+/g, "/")
      .replace(/-+\//g, "/")
      .replace(/^[-/.]+/, "")
      .replace(/[-/.]+$/, "")
      // `@` on its own is not a ref name. An empty result leaves the create button disabled, which is
      // what typing nothing valid should look like.
      .replace(/^@$/, "")
  )
}
