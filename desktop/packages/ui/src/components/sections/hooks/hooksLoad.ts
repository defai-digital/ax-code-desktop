import type { HookWorkspace } from "@defai-digital/ax-code-sdk/v2"
import { axCodeClient } from "@/lib/ax-code/client"

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
  return result.data
}
