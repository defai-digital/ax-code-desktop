import type { HookWorkspace } from "@defai-digital/ax-code-sdk/v2"
import { axCodeClient } from "@/lib/ax-code/client"
import { isPlainRecord } from "@/lib/record"

function isHookWorkspace(value: unknown): value is HookWorkspace {
  if (!isPlainRecord(value) || typeof value.trusted !== "boolean" || !isPlainRecord(value.file)) return false
  if (
    typeof value.file.path !== "string" ||
    typeof value.file.exists !== "boolean" ||
    typeof value.file.valid !== "boolean"
  )
    return false
  if (value.file.error !== undefined && typeof value.file.error !== "string") return false
  if (!Array.isArray(value.hooks) || !Array.isArray(value.packs)) return false
  return (
    value.hooks.every(
      (entry: unknown) =>
        isPlainRecord(entry) &&
        typeof entry.event === "string" &&
        typeof entry.command === "string" &&
        typeof entry.source === "string" &&
        ["matcher", "pack", "protocol"].every((key) => entry[key] === undefined || typeof entry[key] === "string") &&
        (entry.blockOnFailure === undefined || typeof entry.blockOnFailure === "boolean"),
    ) &&
    value.packs.every(
      (pack: unknown) =>
        isPlainRecord(pack) &&
        typeof pack.name === "string" &&
        typeof pack.enabled === "boolean" &&
        (pack.description === undefined || typeof pack.description === "string"),
    )
  )
}

export async function fetchHookWorkspace(directory: string): Promise<HookWorkspace> {
  const trimmed = directory.trim()
  if (!trimmed) {
    throw new Error("A project directory is required")
  }

  // The scoped client sends the directory header. The hooks operation also takes
  // the directory query used by GET /hooks?directory=.
  const result = await axCodeClient
    .getScopedSdkClient(trimmed)
    .hooks.get({ directory: trimmed }, { throwOnError: true })
  if (!result.data) {
    throw new Error("Empty hooks response")
  }
  if (!isHookWorkspace(result.data)) throw new Error("Invalid hooks response")
  return result.data
}
