import { normalizeProjectPath } from "@/lib/projectResolution"
import type { IconName } from "@/components/icon/icons"

export type ProjectActionIconKey =
  | "play"
  | "build"
  | "lint"
  | "terminal"
  | "tools"
  | "bug"
  | "flask"
  | "rocket"
  | "code"
  | "server"
  | "branch"
  | "search"
  | "settings"
  | "brain"
  | "stack"
  | "robot"
  | "command"
  | "file"

export const PROJECT_ACTION_ICONS: Array<{
  key: ProjectActionIconKey
  label: string
  Icon: IconName
}> = [
  { key: "play", label: "Play", Icon: "play" },
  { key: "build", label: "Build", Icon: "hammer" },
  { key: "lint", label: "Lint", Icon: "checkbox-circle" },
  { key: "terminal", label: "Terminal", Icon: "terminal-box" },
  { key: "tools", label: "Tools", Icon: "tools" },
  { key: "bug", label: "Bug", Icon: "bug" },
  { key: "flask", label: "Flask", Icon: "flask" },
  { key: "rocket", label: "Rocket", Icon: "rocket" },
  { key: "code", label: "Code", Icon: "code" },
  { key: "server", label: "Server", Icon: "server" },
  { key: "branch", label: "Branch", Icon: "git-branch" },
  { key: "search", label: "Search", Icon: "search" },
  { key: "settings", label: "Settings", Icon: "settings-3" },
  { key: "brain", label: "Brain", Icon: "brain-ai-3" },
  { key: "stack", label: "Stack", Icon: "stack" },
  { key: "robot", label: "Robot", Icon: "robot-2" },
  { key: "command", label: "Command", Icon: "command" },
  { key: "file", label: "File", Icon: "file-text" },
]

export const PROJECT_ACTION_ICON_MAP = Object.fromEntries(
  PROJECT_ACTION_ICONS.map((entry) => [entry.key, entry.Icon]),
) as Record<ProjectActionIconKey, IconName>

export const PROJECT_ACTIONS_UPDATED_EVENT = "openchamber:project-actions-updated"

export const normalizeProjectActionDirectory = (value: string): string => {
  return normalizeProjectPath(value) ?? ""
}
export const toProjectActionRunKey = (directory: string, actionId: string): string => {
  return `${normalizeProjectActionDirectory(directory)}::${actionId}`
}

/** Reserved id of the launcher's built-in "Auto-discover" entry; a saved action may never use it. */
export const AUTO_DISCOVER_ACTION_ID = "__openchamber_auto_discover_preview__"

const stripControlChars = (value: string): string => {
  let next = ""
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    const isControl =
      (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127
    if (!isControl) {
      next += value[index]
    }
  }
  return next
}

/** The text the launcher types into the terminal for an action's command. */
export const normalizeProjectActionCommand = (command: string): string =>
  stripControlChars(command.trim().replace(/\r\n|\r/g, "\n"))

/** The URL an action opens, or null when the launcher would reject it. */
export const normalizeManualOpenUrl = (value: string | undefined): string | null => {
  const raw = (value || "").trim()
  if (!raw) {
    return null
  }

  const candidate = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

// Controls, format characters (bidirectional embeddings, overrides and isolates, zero-width joiners, the BOM) and every
// default-ignorable code point (combining grapheme joiner, Hangul fillers, variation selectors…), except tab and newline.
const INVISIBLE_CHARACTER_PATTERN = /(?![\t\n])[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu

/**
 * Show a command exactly enough to approve it: characters that render as nothing, or reorder the text around them,
 * are written out as ⟨U+XXXX⟩ so a reviewed command cannot hide or rearrange what runs.
 */
export const revealInvisibleCharacters = (value: string): string =>
  value.replace(
    INVISIBLE_CHARACTER_PATTERN,
    (char) => `⟨U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}⟩`,
  )
