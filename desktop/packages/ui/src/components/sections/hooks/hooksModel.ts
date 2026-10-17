import type { HookEntry, HookWorkspace } from "@defai-digital/ax-code-sdk/v2"

export type HooksFileStatus = "missing" | "valid" | "invalid"

export type HooksTrustNotice = "ignored" | "absent"

export type HookMatcherLabel = { kind: "all" } | { kind: "matcher"; value: string }

export type HookSourceLabel = { kind: "project" } | { kind: "pack"; name: string }

const HOOK_COMMAND_PREVIEW_LIMIT = 96

export function deriveHooksFileStatus(file: HookWorkspace["file"]): HooksFileStatus {
  if (!file.exists) return "missing"
  if (file.valid) return "valid"
  return "invalid"
}

export function deriveHooksTrustNotice(workspace: Pick<HookWorkspace, "trusted" | "file">): HooksTrustNotice | null {
  if (workspace.trusted) return null
  return workspace.file.exists ? "ignored" : "absent"
}

export function hookMatcherLabel(matcher: string | undefined): HookMatcherLabel {
  const value = matcher?.trim() ?? ""
  if (!value) return { kind: "all" }
  return { kind: "matcher", value }
}

export function hookSourceLabel(entry: Pick<HookEntry, "source" | "pack">): HookSourceLabel {
  if (entry.source === "pack") {
    return { kind: "pack", name: entry.pack?.trim() ?? "" }
  }
  return { kind: "project" }
}

export function hookCommandNeedsExpansion(command: string): boolean {
  return command.length > HOOK_COMMAND_PREVIEW_LIMIT || /[\r\n]/.test(command)
}

export function hooksLoadErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.trim()
  if (typeof error === "string") return error.trim()
  return ""
}
