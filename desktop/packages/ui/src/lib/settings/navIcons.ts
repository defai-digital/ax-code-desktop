import type { IconName } from "@/components/icon/icons"
import type { SettingsPageSlug } from "./metadata"

export function getSettingsNavIcon(slug: SettingsPageSlug): IconName | null {
  switch (slug) {
    case "models":
      return "database-2"
    case "projects":
      return "folders"
    case "appearance":
      return "palette"
    case "chat":
      return "chat-ai-3"
    case "notifications":
      return "notification-3"
    case "shortcuts":
      return "command"
    case "sessions":
      return "chat-history"

    case "providers":
      return "cloud"
    case "agents":
      return "ai-agent"
    case "behavior":
      return "brain"
    case "commands":
      return "slash-commands-2"
    case "mcp":
      return "plug-2"

    case "skills.installed":
      return "book-open"

    case "git":
      return "git-branch"

    case "home":
      return null
    default:
      return "settings-3"
  }
}
