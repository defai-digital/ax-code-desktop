export type GitHubListLoadResult<T> =
  | { status: "loaded"; result: T }
  | { status: "stale" }
  | { status: "failed"; error: unknown }

export const loadCurrentGitHubList = async <T>({
  load,
  isCurrent,
}: {
  load: () => Promise<T>
  isCurrent: () => boolean
}): Promise<GitHubListLoadResult<T>> => {
  try {
    const result = await load()
    if (!isCurrent()) {
      return { status: "stale" }
    }
    return { status: "loaded", result }
  } catch (error) {
    if (!isCurrent()) {
      return { status: "stale" }
    }
    return { status: "failed", error }
  }
}
