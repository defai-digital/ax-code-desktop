import { normalizeProjectPath } from "./projectResolution"

/**
 * The key persisted review state (viewed marks, threads, branch bases) uses for a repository. A Windows directory reaches
 * the UI as `C:\Work\Repo` from the runtime and `C:/Work/Repo` from the project list; both must find the same record.
 * POSIX paths are left as they are, so case-sensitive Linux directories stay distinct.
 */
export function reviewDirectoryKey(directory: string): string {
  return normalizeProjectPath(directory) ?? directory
}
