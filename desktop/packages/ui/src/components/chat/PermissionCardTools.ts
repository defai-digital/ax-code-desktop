import type { IconName } from "@/components/icon/icons"
import { desktopWebMcpRowTitle } from "@/lib/toolHelpers"

interface PermissionToolPresentation {
  displayName: string
  icon: IconName
}

export const getPermissionToolPresentation = (
  toolName: string,
  metadata?: Record<string, unknown>,
): PermissionToolPresentation => {
  const tool = toolName.toLowerCase()

  if (tool === "edit" || tool === "multiedit" || tool === "str_replace" || tool === "str_replace_based_edit_tool") {
    return { displayName: "edit", icon: "pencil-ai" }
  }

  if (tool === "write" || tool === "create" || tool === "file_write") {
    return { displayName: "write", icon: "file-edit" }
  }

  if (tool === "bash" || tool === "shell" || tool === "cmd" || tool === "terminal" || tool === "shell_command") {
    return { displayName: "bash", icon: "terminal-box" }
  }

  if (tool === "webfetch" || tool === "fetch" || tool === "curl" || tool === "wget") {
    return { displayName: "webfetch", icon: "global" }
  }

  if (tool === "webmcp" || tool === "desktop_webmcp") {
    return { displayName: desktopWebMcpRowTitle(undefined, metadata) ?? "webmcp", icon: "global" }
  }

  return { displayName: toolName, icon: "tools" }
}
