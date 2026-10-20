import type { SidebarSection } from "@/constants/sidebar"
import { SETTINGS_NAVIGATION } from "./navigation"

export type SettingsPageSlug =
  | "home"
  | "models"
  | "projects"
  | "providers"
  | "agents"
  | "behavior"
  | "commands"
  | "mcp"
  | "hooks"
  | "skills.installed"
  | "git"
  | "appearance"
  | "chat"
  | "shortcuts"
  | "sessions"
  | "notifications"

export type SettingsPageGroup = "general" | "projects" | "models" | "coding" | "advanced"

export interface SettingsRuntimeContext {
  isWeb: boolean
  isDesktop: boolean
}

export interface SettingsPageMeta {
  slug: SettingsPageSlug
  title: string
  group: SettingsPageGroup
  kind: "single" | "split"
  description?: string
  keywords?: string[]
  hideFromNavigation?: boolean
  isAvailable?: (ctx: SettingsRuntimeContext) => boolean
}

const SETTINGS_PAGES: readonly Omit<SettingsPageMeta, "group">[] = [
  {
    slug: "home",
    title: "Settings",
    kind: "single",
    description: "Search and jump to common pages.",
    keywords: ["search", "settings"],
  },
  {
    slug: "models",
    title: "Local Models",
    kind: "single",
    keywords: ["models", "local models", "ax-engine", "download", "mtp", "mlx", "qwen", "gemma", "glm"],
  },
  {
    slug: "projects",
    title: "Projects",
    kind: "split",
    keywords: ["project", "projects", "worktree", "worktrees", "repo", "repository", "directory"],
  },
  {
    slug: "providers",
    title: "Providers",
    kind: "split",
    keywords: [
      "provider",
      "providers",
      "models",
      "model",
      "api key",
      "api keys",
      "openai",
      "anthropic",
      "ollama",
      "credentials",
    ],
  },
  {
    slug: "agents",
    title: "Agents",
    kind: "split",
    keywords: ["agent", "agents", "prompts", "tools", "permissions"],
  },
  {
    slug: "behavior",
    title: "Behavior",
    kind: "single",
    keywords: ["behavior", "agents.md", "system prompt", "global rules", "instructions", "override", "response style", "concise", "detailed"],
  },
  {
    slug: "commands",
    title: "Commands",
    kind: "split",
    keywords: ["command", "commands", "slash", "macros", "automation"],
  },
  {
    slug: "mcp",
    title: "MCP",
    kind: "split",
    keywords: ["mcp", "model context protocol", "servers", "tools", "remote", "stdio"],
  },
  {
    slug: "hooks",
    title: "Hooks",
    kind: "single",
    keywords: ["hooks", "lifecycle", "PreToolUse", "automation", "diagnostics", "trust", "configuration"],
  },
  {
    slug: "skills.installed",
    title: "Skills",
    kind: "split",
    keywords: ["skill", "skills", "instructions", "install", "catalog"],
  },
  {
    slug: "git",
    title: "Git",
    kind: "single",
    keywords: [
      "git",
      "github",
      "identity",
      "identities",
      "ssh",
      "profiles",
      "credentials",
      "keys",
      "commit",
      "gitmoji",
      "oauth",
      "prs",
      "issues",
    ],
  },
  {
    slug: "appearance",
    title: "Appearance",
    kind: "single",
    keywords: [
      "theme",
      "font",
      "spacing",
      "padding",
      "corner radius",
      "radius",
      "input bar",
      "keyboard",
      "viewport",
      "terminal",
    ],
  },
  {
    slug: "chat",
    title: "Chat",
    kind: "single",
    keywords: [
      "tools",
      "diff",
      "reasoning",
      "dotfiles",
      "draft",
      "queue",
      "output",
      "copy",
      "image",
      "split messages",
      "message actions",
    ],
  },
  {
    slug: "shortcuts",
    title: "Shortcuts",
    kind: "single",
    keywords: ["keyboard", "hotkeys", "shortcuts", "bindings"],
  },
  {
    slug: "sessions",
    title: "Sessions",
    kind: "single",
    keywords: ["defaults", "default agent", "default model", "retention", "memory", "limits", "zen"],
  },
  {
    slug: "notifications",
    title: "Notifications",
    kind: "single",
    keywords: ["alerts", "native", "summary", "summarization"],
  },
] as const

export const SETTINGS_PAGE_METADATA: readonly SettingsPageMeta[] = SETTINGS_PAGES.map(page => ({
  ...page,
  group: SETTINGS_NAVIGATION.find(group => group.pages.includes(page.slug))?.id ?? "general",
}))

const LEGACY_SIDEBAR_SECTION_TO_SETTINGS_SLUG: Record<SidebarSection, SettingsPageSlug> = {
  sessions: "sessions",
  agents: "agents",
  commands: "commands",
  mcp: "mcp",
  skills: "skills.installed",
  providers: "providers",
  "git-identities": "git",
  settings: "home",
}

export function getSettingsPageMeta(slug: string): SettingsPageMeta | null {
  const normalized = slug.trim().toLowerCase()
  return (SETTINGS_PAGE_METADATA as readonly SettingsPageMeta[]).find((page) => page.slug === normalized) ?? null
}

const RETIRED_SETTINGS_SLUGS = new Set(["remote-instances", "plugins", "magic-prompts", "snippets"])

export function resolveSettingsSlug(value: string | null | undefined): SettingsPageSlug {
  const normalized = (value ?? "").trim().toLowerCase()
  if (!normalized || RETIRED_SETTINGS_SLUGS.has(normalized)) {
    return "home"
  }
  // The catalog is a pane inside Skills, not a second settings destination.
  if (normalized === "skills.catalog") {
    return "skills.installed"
  }

  // hasOwnProperty, not a bare lookup: "?settings=constructor" would otherwise
  // read Object through the prototype chain and hand a function back as a slug.
  const legacy = Object.prototype.hasOwnProperty.call(LEGACY_SIDEBAR_SECTION_TO_SETTINGS_SLUG, normalized)
    ? LEGACY_SIDEBAR_SECTION_TO_SETTINGS_SLUG[normalized as SidebarSection]
    : undefined
  if (legacy) {
    return legacy
  }

  const direct = getSettingsPageMeta(normalized)
  if (direct) {
    return direct.slug
  }

  return "home"
}

export function resolveAvailableSettingsSlug(
  value: string | null | undefined,
  context: SettingsRuntimeContext,
): SettingsPageSlug {
  const slug = resolveSettingsSlug(value)
  const page = getSettingsPageMeta(slug)
  if (!page || (page.isAvailable && !page.isAvailable(context))) return "home"
  return slug
}
