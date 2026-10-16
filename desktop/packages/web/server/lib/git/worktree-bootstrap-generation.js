/**
 * Tracks which bootstrap run owns a worktree directory.
 *
 * A worktree bootstrap is queued behind a timer and then awaits git and the project's start scripts,
 * while the directory it was queued for can be removed and re-created under the same name (the name is
 * preferred when a worktree is created, so the path is often reused). Without an owner, the earlier
 * run's `git reset --hard` wiped the new worktree's checkout and its state write reported on a worktree
 * it no longer owned.
 *
 * `start` returns the generation a run owns; `isCurrent` answers whether that run still owns the
 * directory; `invalidate` retires whatever run holds it (a removal does that).
 */
export function createWorktreeBootstrapGenerations() {
  const generations = new Map()

  return {
    start(key) {
      const next = (generations.get(key) ?? 0) + 1
      generations.set(key, next)
      return next
    },
    isCurrent(key, generation) {
      return (generations.get(key) ?? 0) === generation
    },
    invalidate(key) {
      const next = (generations.get(key) ?? 0) + 1
      generations.set(key, next)
    },
  }
}
