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
      .replace(/-+/g, "-")
      .replace(/\/{2,}/g, "/")
      .replace(/\/-+/g, "/")
      .replace(/-+\//g, "/")
      .replace(/^[-/.]+/, "")
      .replace(/[-/.]+$/, "")
  )
}
