import { readDirectoryPath } from "@/lib/pathValues"
export const DEFAULT_DIRECTORY_CACHE_KEY = "__default__"

export const getDirectoryCacheKey = (directory: string | null | undefined): string =>
  readDirectoryPath(directory) ?? DEFAULT_DIRECTORY_CACHE_KEY
