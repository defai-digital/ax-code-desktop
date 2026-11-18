import { normalizePathSeparators } from "@/lib/pathValues"
export const normalizeWorktreePath = (value: string): string => {
  if (!value) {
    return ""
  }
  const replaced = normalizePathSeparators(value)
  if (/^\/+$/.test(replaced)) {
    return "/"
  }
  return replaced.replace(/\/+$/, "") || value
}
